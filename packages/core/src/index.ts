export const VERSION = '2.0.0';
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
