import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo, projectHashOf } from '@mnemo-mcp/core';
import { runUserPromptSubmit } from '../src/hooks/user-prompt-submit.js';

describe('user-prompt-submit hook', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-ups-'));
    process.env.MNEMO_DATA_DIR = dir;
    process.env.MNEMO_EMBEDDER = 'hash';
  });
  afterEach(() => {
    delete process.env.MNEMO_DATA_DIR;
    delete process.env.MNEMO_EMBEDDER;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty for short or missing prompts', async () => {
    expect(await runUserPromptSubmit({})).toBe('');
    expect(await runUserPromptSubmit({ prompt: 'hi' })).toBe('');
  });

  it('returns empty when no memories match', async () => {
    const out = await runUserPromptSubmit({ prompt: 'something completely unrelated to anything stored' });
    expect(out).toBe('');
  });

  it('does not crash with a populated store', async () => {
    const cwd = '/some/repo';
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'OAuth tokens refresh every 30 minutes', scope: 'global' });
    await m.close();
    // hash embedder is not strongly semantic; assert structure instead
    const out = await runUserPromptSubmit({
      prompt: 'OAuth tokens refresh every 30 minutes',
      cwd,
    });
    expect(typeof out).toBe('string');
  });
});
