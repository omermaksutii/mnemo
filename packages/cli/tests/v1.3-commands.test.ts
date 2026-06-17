import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerBackup } from '../src/commands/backup.js';
import { registerRestore } from '../src/commands/restore.js';
import { registerMigrate } from '../src/commands/migrate.js';
import { registerRecall } from '../src/commands/recall.js';
import { Mnemo } from '@mnemo-mcp/core';

describe('mnemo v1.3 commands', () => {
  let dir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-v13-'));
    process.env.MNEMO_DATA_DIR = dir;
    process.env.MNEMO_EMBEDDER = 'hash';
    logs = [];
    origLog = console.log;
    console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  });
  afterEach(() => {
    delete process.env.MNEMO_DATA_DIR;
    delete process.env.MNEMO_EMBEDDER;
    console.log = origLog;
    rmSync(dir, { recursive: true, force: true });
  });

  it('backup writes a timestamped envelope and restore reads it back', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'backup me', scope: 'global' });
    await m.close();

    const outFile = join(dir, 'snap.json');
    const program = new Command().exitOverride();
    registerBackup(program);
    await program.parseAsync(['node', 'mnemo', 'backup', '--out', outFile]);
    expect(existsSync(outFile)).toBe(true);

    const dir2 = mkdtempSync(join(tmpdir(), 'mnemo-v13r-'));
    process.env.MNEMO_DATA_DIR = dir2;
    try {
      const program2 = new Command().exitOverride();
      registerRestore(program2);
      await program2.parseAsync(['node', 'mnemo', 'restore', outFile]);
      const m2 = await Mnemo.open({ dataDir: dir2, embedderType: 'hash' });
      const hits = await m2.recall('backup', { scope: 'all' });
      expect(hits.length).toBe(1);
      await m2.close();
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('backup creates missing parent directories for --out', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'x', scope: 'global' });
    await m.close();
    const nested = join(dir, 'a', 'b', 'snap.json');
    const program = new Command().exitOverride();
    registerBackup(program);
    await program.parseAsync(['node', 'mnemo', 'backup', '--out', nested]);
    const files = readdirSync(join(dir, 'a', 'b'));
    expect(files).toContain('snap.json');
  });

  it('migrate rebuilds the index and recall still works', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'reindex target about kubernetes', scope: 'global' });
    await m.close();

    // Wipe the index files to simulate a stale/corrupt index.
    rmSync(join(dir, 'hnsw.bin'), { force: true });
    rmSync(join(dir, 'hnsw.bin.map.json'), { force: true });

    const program = new Command().exitOverride();
    registerMigrate(program);
    await program.parseAsync(['node', 'mnemo', 'migrate']);
    expect(logs.join('\n')).toMatch(/reindexed 1/);

    const m2 = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const hits = await m2.recall('kubernetes', { scope: 'all' });
    expect(hits.length).toBe(1);
    await m2.close();
  });

  it('recall --explain emits a ranking breakdown', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'explainable ranking memory', scope: 'global' });
    await m.close();
    const program = new Command().exitOverride();
    registerRecall(program);
    await program.parseAsync(['node', 'mnemo', 'recall', 'explainable', '--scope', 'all', '--explain']);
    const out = logs.join('\n');
    expect(out).toMatch(/sim/);
    expect(out).toMatch(/recency/);
    expect(out).toMatch(/access/);
  });
});
