import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerSync } from '../src/commands/sync.js';
import { startSyncServer, type SyncServerHandle } from '@mnemo-mcp/sync-server';
import { Mnemo, isEncrypted } from '@mnemo-mcp/core';

describe('mnemo sync (end-to-end encrypted)', () => {
  let srvDir: string;
  let dataA: string;
  let dataB: string;
  let h: SyncServerHandle;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(async () => {
    srvDir = mkdtempSync(join(tmpdir(), 'mnemo-sync-store-'));
    dataA = mkdtempSync(join(tmpdir(), 'mnemo-sync-a-'));
    dataB = mkdtempSync(join(tmpdir(), 'mnemo-sync-b-'));
    h = await startSyncServer({ dir: srvDir, token: 'tok' });
    process.env.MNEMO_EMBEDDER = 'hash';
    process.env.MNEMO_SYNC_URL = `http://127.0.0.1:${h.port}`;
    process.env.MNEMO_SYNC_TOKEN = 'tok';
    process.env.MNEMO_ENCRYPTION_KEY = 'e2e-pass';
    logs = [];
    origLog = console.log;
    console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  });
  afterEach(async () => {
    await h.close();
    console.log = origLog;
    for (const k of ['MNEMO_EMBEDDER', 'MNEMO_SYNC_URL', 'MNEMO_SYNC_TOKEN', 'MNEMO_ENCRYPTION_KEY']) delete process.env[k];
    for (const d of [srvDir, dataA, dataB]) rmSync(d, { recursive: true, force: true });
  });

  const run = async (sub: string, dataDir: string) => {
    const program = new Command().exitOverride();
    registerSync(program);
    await program.parseAsync(['node', 'mnemo', 'sync', sub, '--data-dir', dataDir]);
  };

  it('pushes from A and pulls into B, and the server stores only ciphertext', async () => {
    const a = await Mnemo.open({ dataDir: dataA, embedderType: 'hash' });
    await a.capture({ content: 'secret sync memory about quasars', scope: 'global' });
    await a.close();

    await run('push', dataA);

    // The server's stored blob must be encrypted and must not contain plaintext.
    const files = readdirSync(srvDir);
    expect(files.length).toBe(1);
    const blob = readFileSync(join(srvDir, files[0]));
    expect(isEncrypted(blob)).toBe(true);
    expect(blob.includes(Buffer.from('quasars'))).toBe(false);

    await run('pull', dataB);
    const b = await Mnemo.open({ dataDir: dataB, embedderType: 'hash' });
    const hits = await b.recall('quasars', { scope: 'all' });
    expect(hits.length).toBe(1);
    expect(hits[0].record.content).toContain('quasars');
    await b.close();
  });

  it('refuses to sync without an encryption key', async () => {
    delete process.env.MNEMO_ENCRYPTION_KEY;
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.join(' ')); };
    try {
      await run('push', dataA);
    } finally {
      console.error = origErr;
    }
    expect(errs.join('\n')).toMatch(/encryption key/);
    process.exitCode = 0;
  });
});
