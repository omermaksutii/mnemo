import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerRemember } from '../src/commands/remember.js';
import { Mnemo } from '@omermaksutii/mnemo-core';

describe('mnemo remember', () => {
  let dir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-cli-'));
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

  it('captures a memory and prints saved', async () => {
    const program = new Command().exitOverride();
    registerRemember(program);
    await program.parseAsync(['node', 'mnemo', 'remember', 'we', 'use', 'Vitest']);
    expect(logs.join('\n')).toMatch(/saved/i);
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m.list({});
    expect(list).toHaveLength(1);
    expect(list[0]!.content).toBe('we use Vitest');
    await m.close();
  });

  it('accepts --global flag', async () => {
    const program = new Command().exitOverride();
    registerRemember(program);
    await program.parseAsync(['node', 'mnemo', 'remember', '--global', 'I', 'prefer', 'pnpm']);
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m.list({ scope: 'global' });
    expect(list[0]!.scope).toBe('global');
    await m.close();
  });

  it('accepts --tags flag', async () => {
    const program = new Command().exitOverride();
    registerRemember(program);
    await program.parseAsync(['node', 'mnemo', 'remember', '--tags', 'auth,convention', 'use', 'OAuth']);
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m.list({});
    expect(list[0]!.tags).toEqual(['auth', 'convention']);
    await m.close();
  });
});
