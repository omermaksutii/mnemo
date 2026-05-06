import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerList } from '../src/commands/list.js';
import { registerForget } from '../src/commands/forget.js';
import { registerStats } from '../src/commands/stats.js';
import { Mnemo } from '@mnemo-mcp/core';

describe('mnemo misc commands', () => {
  let dir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-cli-misc-'));
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

  it('list shows memories', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'one', scope: 'global' });
    await m.capture({ content: 'two', scope: 'global' });
    await m.close();
    const program = new Command().exitOverride();
    registerList(program);
    await program.parseAsync(['node', 'mnemo', 'list']);
    const out = logs.join('\n');
    expect(out).toMatch(/one/);
    expect(out).toMatch(/two/);
  });

  it('forget deletes by id prefix', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const r = await m.capture({ content: 'forgettable', scope: 'global' });
    await m.close();
    const program = new Command().exitOverride();
    registerForget(program);
    await program.parseAsync(['node', 'mnemo', 'forget', r.id.slice(0, 8)]);
    const m2 = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    expect((await m2.list({}))).toHaveLength(0);
    await m2.close();
  });

  it('stats shows totals', async () => {
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'a', scope: 'global' });
    await m.close();
    const program = new Command().exitOverride();
    registerStats(program);
    await program.parseAsync(['node', 'mnemo', 'stats']);
    expect(logs.join('\n')).toMatch(/memories:/);
  });
});
