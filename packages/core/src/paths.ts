import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function resolveDataDir(override?: string): string {
  if (override) return override;
  if (process.env.MNEMO_DATA_DIR) return process.env.MNEMO_DATA_DIR;
  return join(homedir(), '.mnemo');
}

export type Paths = {
  dataDir: string;
  dbFile: string;
  indexFile: string;
  modelDir: string;
  configFile: string;
  logFile: string;
};

export function paths(dataDir: string): Paths {
  return {
    dataDir,
    dbFile: join(dataDir, 'memory.db'),
    indexFile: join(dataDir, 'hnsw.bin'),
    modelDir: join(dataDir, 'model'),
    configFile: join(dataDir, 'config.json'),
    logFile: join(dataDir, 'mnemo.log'),
  };
}

export function projectHashOf(absolutePath: string): string {
  return createHash('sha256').update(absolutePath).digest('hex').slice(0, 16);
}
