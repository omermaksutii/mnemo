import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFailures, summarizeFailures } from '../src/reflect.js';
import { Mnemo } from '../src/mnemo.js';

describe('failure detection (v2.2)', () => {
  it('detects test, type, build, revert, and error signals', () => {
    const text = [
      'running suite…',
      '  3 failed | 10 passed',
      "src/x.ts(4,2): error TS2304: Cannot find name 'Foo'.",
      'Build failed with 1 error',
      'I reverted the change',
      'Error: connection refused',
      'all good here',
    ].join('\n');
    const kinds = detectFailures(text).map(s => s.kind).sort();
    expect(kinds).toEqual(['build-failure', 'error', 'revert', 'test-failure', 'type-error']);
  });

  it('returns nothing for a clean transcript', () => {
    expect(detectFailures('everything passed, 12 green, all good')).toHaveLength(0);
  });

  it('summarizes into an anti-pattern paragraph', () => {
    const signals = detectFailures('5 failed\nError: boom');
    const summary = summarizeFailures(signals, 'add the widget');
    expect(summary).toMatch(/Anti-pattern while "add the widget"/);
    expect(summary).toMatch(/test-failure/);
  });
});

describe('anti-pattern recall boost', () => {
  let dir: string;
  let m: Mnemo;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-reflect-'));
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
  });
  afterEach(async () => {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lifts an anti-pattern hit above a same-similarity note when boosted', async () => {
    await m.capture({ content: 'deploy pipeline uses blue-green', scope: 'global', channel: 'note' });
    await m.capture({ content: 'deploy pipeline broke on blue-green rollout', scope: 'global', channel: 'anti-pattern' });
    const boosted = await m.recall('deploy pipeline blue-green', { scope: 'all', antiPatternBoost: 0.3 });
    expect(boosted[0].record.channel).toBe('anti-pattern');
  });
});
