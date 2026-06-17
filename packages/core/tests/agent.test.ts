import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo } from '../src/mnemo.js';

describe('cross-agent attribution (v2.3)', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('records the capturing agent and filters recall by it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-agent-'));
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'cursor noticed the flaky test', scope: 'global', agent: 'cursor' });
    await m.capture({ content: 'aider refactored the parser', scope: 'global', agent: 'aider' });

    const cursorOnly = await m.recall('flaky parser refactor', { scope: 'all', agent: 'cursor' });
    expect(cursorOnly.every(h => h.record.agent === 'cursor')).toBe(true);
    expect(cursorOnly.length).toBe(1);

    const stats = await m.stats();
    expect(stats.byAgent).toEqual({ cursor: 1, aider: 1 });
    await m.close();
  });

  it('uses the engine default agent (and $MNEMO_AGENT) when none is given', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-agent2-'));
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash', defaultAgent: 'claude-code' });
    const rec = await m.capture({ content: 'default-attributed memory', scope: 'global' });
    expect(rec.agent).toBe('claude-code');
    await m.close();
  });

  it('persists agent attribution across reopen', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-agent3-'));
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'persisted by an agent', scope: 'global', agent: 'cursor' });
    await m.close();
    const m2 = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m2.list({ agent: 'cursor', includeExpired: true });
    expect(list.length).toBe(1);
    await m2.close();
  });
});
