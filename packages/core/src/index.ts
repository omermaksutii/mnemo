export const VERSION = '2.3.0';
export * from './types.js';
export { Mnemo, SecretContentError } from './mnemo.js';
export { HashEmbedder } from './embedder.js';
export type { Embedder } from './embedder.js';
export { resolveDataDir, projectHashOf, paths } from './paths.js';
export { parseDuration, expiresAtFromTtl, sinceFromAgo } from './duration.js';
export { detectSecrets, hasSecrets } from './secret-guard.js';
export type { SecretMatch } from './secret-guard.js';
export { parseMarkdown, parsePlain } from './ingest.js';
export type { IngestChunk } from './ingest.js';
export {
  procedureFromRecord,
  procedureMetadata,
  procedureToContent,
  validateProcedureName,
} from './procedure.js';
export type { RecordProcedureInput } from './procedure.js';
export {
  encryptBytes,
  decryptBytes,
  isEncrypted,
  resolveEncryptionKey,
} from './crypto.js';
export {
  quantizeInt8,
  dequantizeInt8,
  cosine,
  bytesSaved,
} from './quantize.js';
export type { QuantizedVector } from './quantize.js';
export { detectFailures, summarizeFailures } from './reflect.js';
export type { FailureKind, FailureSignal } from './reflect.js';
