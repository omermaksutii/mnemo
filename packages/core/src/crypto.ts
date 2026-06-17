import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Encryption at rest (v1.3). When a passphrase is configured, the on-disk
 * `memory.db` is stored as an AES-256-GCM envelope instead of raw SQLite bytes.
 *
 * Envelope layout (all binary, concatenated):
 *   magic   "MNEMOE1" (7 bytes)
 *   salt    16 bytes   — scrypt salt
 *   iv      12 bytes   — GCM nonce
 *   tag     16 bytes   — GCM auth tag
 *   cipher  N bytes    — encrypted payload
 *
 * Plaintext databases (no magic prefix) are read transparently, so turning
 * encryption on is a one-way upgrade that never bricks an existing store.
 */

const MAGIC = Buffer.from('MNEMOE1', 'utf8');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/** Resolve the encryption passphrase from an explicit value or the environment. */
export function resolveEncryptionKey(explicit?: string): string | null {
  if (explicit) return explicit;
  if (process.env.MNEMO_ENCRYPTION_KEY) return process.env.MNEMO_ENCRYPTION_KEY;
  return null;
}

/** True when the buffer carries the Mnemo encryption envelope magic. */
export function isEncrypted(buf: Uint8Array): boolean {
  if (buf.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) return false;
  }
  return true;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN);
}

export function encryptBytes(plain: Uint8Array, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, salt, iv, tag, enc]);
}

export function decryptBytes(envelope: Uint8Array, passphrase: string): Buffer {
  if (!isEncrypted(envelope)) {
    throw new Error('not a Mnemo encryption envelope');
  }
  const buf = Buffer.from(envelope);
  let off = MAGIC.length;
  const salt = buf.subarray(off, (off += SALT_LEN));
  const iv = buf.subarray(off, (off += IV_LEN));
  const tag = buf.subarray(off, (off += TAG_LEN));
  const cipher = buf.subarray(off);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(cipher), decipher.final()]);
  } catch {
    throw new Error(
      'failed to decrypt memory.db — wrong MNEMO_ENCRYPTION_KEY or corrupted file',
    );
  }
}
