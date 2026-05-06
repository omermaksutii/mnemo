export const VERSION = '1.0.0';
export * from './types.js';
export { Mnemo } from './mnemo.js';
export { HashEmbedder } from './embedder.js';
export type { Embedder } from './embedder.js';
export { resolveDataDir, projectHashOf, paths } from './paths.js';
export { parseDuration, expiresAtFromTtl, sinceFromAgo } from './duration.js';
