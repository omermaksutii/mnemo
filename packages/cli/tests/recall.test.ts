import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerRecall } from '../src/commands/recall.js';
import { Mnemo } from '@mnemo-mcp/core';

describe('mnemo recall', () => {
  let dir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-cli-r-'));
    process.env.MNEMO_DATA_DIR = dir;
    process.env.MNEMO_EMBEDDER = 'hash';
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'we use Vitest, never Jest', scope: 'global' });
    await m.capture({ content: 'database migrations live in src/db/migrations', scope: 'global' });
    await m.close();
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

  it('returns memories matching the query', async () => {
    const program = new Command().exitOverride();
    registerRecall(program);
    await program.parseAsync(['node', 'mnemo', 'recall', 'Vitest', '-k', '5']);
    expect(logs.join('\n')).toMatch(/Vitest/);
  });

  it('prints a no-match notice when nothing scores above min', async () => {
    const program = new Command().exitOverride();
    registerRecall(program);
    await program.parseAsync(['node', 'mnemo', 'recall', 'totally', 'unrelated', '--min-score', '0.99']);
    expect(logs.join('\n')).toMatch(/no/i);
  });
});
