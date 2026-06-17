import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStop } from '../src/hooks/stop.js';
import { runSubagentStop } from '../src/hooks/subagent-stop.js';
import { Mnemo, projectHashOf } from '@mnemo-mcp/core';

describe('reflection hooks (v2.2)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-reflect-hook-'));
    process.env.MNEMO_DATA_DIR = dir;
    process.env.MNEMO_EMBEDDER = 'hash';
    delete process.env.MNEMO_REFLECT;
  });
  afterEach(() => {
    delete process.env.MNEMO_DATA_DIR;
    delete process.env.MNEMO_EMBEDDER;
    rmSync(dir, { recursive: true, force: true });
  });

  it('stop hook captures an anti-pattern from a failing transcript', async () => {
    const tx = join(dir, 'transcript.jsonl');
    writeFileSync(tx, 'ran tests\n  2 failed | 4 passed\nError: undefined is not a function\n');
    const out = await runStop({ transcript_path: tx, cwd: dir });
    expect(out).toMatch(/anti-pattern/);

    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m.list({ channel: 'anti-pattern', includeExpired: true });
    expect(list.length).toBe(1);
    expect(list[0].tags).toContain('reflection');
    expect(list[0].tags).toContain('stop');
    await m.close();
  });

  it('does nothing for a clean transcript', async () => {
    const tx = join(dir, 'clean.jsonl');
    writeFileSync(tx, 'all 12 tests passed, nothing to see here\n');
    const out = await runStop({ transcript_path: tx, cwd: dir });
    expect(out).toBe('');
  });

  it('respects MNEMO_REFLECT=0 opt-out', async () => {
    process.env.MNEMO_REFLECT = '0';
    try {
      const tx = join(dir, 'fail.jsonl');
      writeFileSync(tx, '3 failed\n');
      expect(await runSubagentStop({ transcript_path: tx, cwd: dir })).toBe('');
    } finally {
      delete process.env.MNEMO_REFLECT;
    }
  });

  it('subagent-stop tags captures with "subagent"', async () => {
    const tx = join(dir, 'agent.jsonl');
    writeFileSync(tx, 'build failed\n');
    await runSubagentStop({ transcript_path: tx, cwd: dir });
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m.list({ channel: 'anti-pattern', includeExpired: true, projectHash: projectHashOf(dir) });
    expect(list[0].tags).toContain('subagent');
    await m.close();
  });
});
