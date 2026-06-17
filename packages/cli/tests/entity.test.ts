import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerEntity } from '../src/commands/entity.js';

describe('mnemo entity command', () => {
  let dir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-entity-cli-'));
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

  const run = async (...argv: string[]) => {
    const program = new Command().exitOverride();
    registerEntity(program);
    await program.parseAsync(['node', 'mnemo', 'entity', ...argv]);
  };

  it('creates, links, and shows entity context with dependents', async () => {
    await run('create', 'AuthService', '-g', '-t', 'service', '-d', 'login + tokens');
    await run('link', 'Billing', 'requires', 'AuthService', '-g');
    logs.length = 0;
    await run('show', 'AuthService', '--depends');
    const out = logs.join('\n');
    expect(out).toMatch(/AuthService/);
    expect(out).toMatch(/requires/);
    expect(out).toMatch(/Billing/);
  });

  it('rejects an invalid relation kind', async () => {
    await run('create', 'A', '-g');
    process.exitCode = 0;
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.join(' ')); };
    try {
      await run('link', 'A', 'frobnicates', 'B', '-g');
    } finally {
      console.error = origErr;
    }
    expect(errs.join('\n')).toMatch(/invalid kind/);
    process.exitCode = 0;
  });
});
