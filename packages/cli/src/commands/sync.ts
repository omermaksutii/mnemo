import type { Command } from 'commander';
import { Mnemo, encryptBytes, decryptBytes, isEncrypted, resolveEncryptionKey, type MemoryRecord } from '@mnemo-mcp/core';
import chalk from 'chalk';
import { writeJsonResult } from '../json-mode.js';

type Opts = {
  server?: string;
  token?: string;
  namespace?: string;
  key?: string;
  dataDir?: string;
};

type Config = { server: string; token?: string; namespace: string; key: string };

function resolveConfig(opts: Opts): Config | { error: string } {
  const server = opts.server ?? process.env.MNEMO_SYNC_URL;
  if (!server) return { error: 'no sync server — pass --server or set MNEMO_SYNC_URL' };
  const key = resolveEncryptionKey(opts.key);
  if (!key) {
    return { error: 'end-to-end sync requires an encryption key — set MNEMO_ENCRYPTION_KEY or pass --key' };
  }
  return {
    server: server.replace(/\/$/, ''),
    token: opts.token ?? process.env.MNEMO_SYNC_TOKEN,
    namespace: opts.namespace ?? process.env.MNEMO_SYNC_NAMESPACE ?? 'default',
    key,
  };
}

function authHeaders(cfg: Config): Record<string, string> {
  return cfg.token ? { authorization: `Bearer ${cfg.token}` } : {};
}

/**
 * `mnemo sync push|pull|status` — optional multi-machine sync against a
 * self-hosted (or mnemo.dev) sync server. End-to-end encrypted: memories are
 * encrypted locally with your key before upload, so the server only ever stores
 * ciphertext. Local-first stays the default; this is purely opt-in (v2.5).
 */
export function registerSync(program: Command): void {
  const sync = program
    .command('sync')
    .description('Optional end-to-end-encrypted multi-machine sync');

  const common = (c: Command) =>
    c
      .option('--server <url>', 'Sync server URL (or MNEMO_SYNC_URL)')
      .option('--token <token>', 'Bearer token (or MNEMO_SYNC_TOKEN)')
      .option('--namespace <name>', 'Sync namespace (or MNEMO_SYNC_NAMESPACE; default "default")')
      .option('--key <passphrase>', 'Encryption key (or MNEMO_ENCRYPTION_KEY)')
      .option('--data-dir <path>', 'Data directory override');

  // --- push ---
  common(sync.command('push').description('Encrypt and upload all memories'))
    .action(async (opts: Opts) => {
      const cfg = resolveConfig(opts);
      if ('error' in cfg) return fail(cfg.error);
      const m = await openEngine(opts);
      try {
        const dump = await m.export();
        const plaintext = Buffer.from(JSON.stringify({ version: 1, memories: dump }), 'utf8');
        const ciphertext = encryptBytes(plaintext, cfg.key);
        const res = await fetch(`${cfg.server}/v1/blobs/${cfg.namespace}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream', ...authHeaders(cfg) },
          body: new Uint8Array(ciphertext) as unknown as BodyInit,
        });
        if (!res.ok) return fail(`server returned ${res.status} ${res.statusText}`);
        if (writeJsonResult({ pushed: dump.length, namespace: cfg.namespace, bytes: ciphertext.length })) return;
        console.log(chalk.green('pushed'), dump.length, 'memories', chalk.dim(`(${ciphertext.length} encrypted bytes → ${cfg.namespace})`));
      } finally {
        await m.close();
      }
    });

  // --- pull ---
  common(sync.command('pull').description('Download, decrypt, and import memories'))
    .action(async (opts: Opts) => {
      const cfg = resolveConfig(opts);
      if ('error' in cfg) return fail(cfg.error);
      const res = await fetch(`${cfg.server}/v1/blobs/${cfg.namespace}`, { headers: authHeaders(cfg) });
      if (res.status === 404) return fail(`nothing synced under namespace "${cfg.namespace}" yet`);
      if (!res.ok) return fail(`server returned ${res.status} ${res.statusText}`);
      const ciphertext = new Uint8Array(await res.arrayBuffer());
      if (!isEncrypted(ciphertext)) return fail('downloaded blob is not a Mnemo encryption envelope');
      let memories: MemoryRecord[];
      try {
        const plaintext = decryptBytes(ciphertext, cfg.key);
        memories = JSON.parse(plaintext.toString('utf8')).memories;
      } catch (err) {
        return fail((err as Error).message);
      }
      const m = await openEngine(opts);
      try {
        await m.import(memories);
        if (writeJsonResult({ pulled: memories.length, namespace: cfg.namespace })) return;
        console.log(chalk.green('pulled'), memories.length, 'memories', chalk.dim(`(from ${cfg.namespace})`));
      } finally {
        await m.close();
      }
    });

  // --- status ---
  common(sync.command('status').description('Check the sync server and namespace'))
    .action(async (opts: Opts) => {
      const cfg = resolveConfig(opts);
      if ('error' in cfg) return fail(cfg.error);
      let health: unknown = null;
      try {
        const h = await fetch(`${cfg.server}/v1/health`);
        health = h.ok ? await h.json() : { ok: false, status: h.status };
      } catch (err) {
        return fail(`cannot reach ${cfg.server}: ${(err as Error).message}`);
      }
      const head = await fetch(`${cfg.server}/v1/blobs/${cfg.namespace}`, { method: 'HEAD', headers: authHeaders(cfg) });
      const hasBlob = head.ok;
      if (writeJsonResult({ server: cfg.server, namespace: cfg.namespace, health, hasBlob })) return;
      console.log(chalk.bold('server'), cfg.server);
      console.log(chalk.bold('namespace'), cfg.namespace, hasBlob ? chalk.green('(has data)') : chalk.dim('(empty)'));
      console.log(chalk.bold('health'), JSON.stringify(health));
    });
}

function fail(msg: string): void {
  if (writeJsonResult({ error: msg })) {
    process.exitCode = 1;
    return;
  }
  console.error(chalk.red('sync:'), msg);
  process.exitCode = 1;
}

async function openEngine(opts: Opts): Promise<Mnemo> {
  const embedderType = (process.env.MNEMO_EMBEDDER === 'hash' ? 'hash' : 'onnx') as 'hash' | 'onnx';
  return Mnemo.open({ dataDir: opts.dataDir, embedderType });
}
