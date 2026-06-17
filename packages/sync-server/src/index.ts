import { homedir } from 'node:os';
import { join } from 'node:path';
import { startSyncServer } from './server.js';

export const VERSION = '2.6.0';
export { createSyncHandler, startSyncServer } from './server.js';
export type { SyncServerOpts, SyncServerHandle } from './server.js';

/** CLI entry: `mnemo-sync-server`. Configured via env / flags. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const dir = opts.dir ?? process.env.MNEMO_SYNC_DIR ?? join(homedir(), '.mnemo-sync');
  const token = opts.token ?? process.env.MNEMO_SYNC_TOKEN;
  const port = Number(opts.port ?? process.env.MNEMO_SYNC_PORT ?? 7177);
  const host = opts.host ?? process.env.MNEMO_SYNC_HOST ?? '127.0.0.1';

  const handle = await startSyncServer({ dir, token, port, host });
  // eslint-disable-next-line no-console
  console.log(`mnemo-sync-server listening on http://${host}:${handle.port}`);
  console.log(`  store: ${dir}`);
  console.log(`  auth:  ${token ? 'bearer token required' : 'OPEN (no token — dev only)'}`);
  console.log('  end-to-end encrypted: the server only ever stores ciphertext.');

  const shutdown = async () => { await handle.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a && a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = 'true';
    }
  }
  return out;
}
