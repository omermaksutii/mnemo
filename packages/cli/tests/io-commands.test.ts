import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerExport } from '../src/commands/export.js';
import { registerImport } from '../src/commands/import.js';
import { registerDoctor } from '../src/commands/doctor.js';
import { Mnemo } from '@mnemo-mcp/core';

describe('mnemo io & doctor', () => {
  let dir: string;
  let outFile: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-cli-io-'));
    outFile = join(dir, 'dump.json');
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

  it('export writes a JSON file with all memories', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'a', scope: 'global' });
    await m.capture({ content: 'b', scope: 'global' });
    await m.close();
    const program = new Command().exitOverride();
    registerExport(program);
    await program.parseAsync(['node', 'mnemo', 'export', '--out', outFile]);
    const dump = JSON.parse(readFileSync(outFile, 'utf8'));
    expect(dump).toHaveLength(2);
  });

  it('import loads from a JSON file', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'imported', scope: 'global' });
    await m.close();
    const program = new Command().exitOverride();
    registerExport(program);
    await program.parseAsync(['node', 'mnemo', 'export', '--out', outFile]);

    const dir2 = mkdtempSync(join(tmpdir(), 'mnemo-cli-io2-'));
    process.env.MNEMO_DATA_DIR = dir2;
    try {
      const program2 = new Command().exitOverride();
      registerImport(program2);
      await program2.parseAsync(['node', 'mnemo', 'import', outFile]);
      const m2 = await Mnemo.open({ dataDir: dir2, embedderType: 'hash' });
      expect((await m2.list({}))).toHaveLength(1);
      await m2.close();
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('doctor reports healthy on a valid setup', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.close();
    const program = new Command().exitOverride();
    registerDoctor(program);
    await program.parseAsync(['node', 'mnemo', 'doctor']);
    expect(logs.join('\n')).toMatch(/healthy/i);
  });
});
