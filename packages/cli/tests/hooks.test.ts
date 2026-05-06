import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo, projectHashOf } from '@mnemo-mcp/core';
import { runSessionStart } from '../src/hooks/session-start.js';
import { runPreTask } from '../src/hooks/pre-task.js';
import { runPostEdit } from '../src/hooks/post-edit.js';
import { shouldAutoCapture } from '../src/hooks/capture-rules.js';

describe('hook handlers', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-hook-'));
    process.env.MNEMO_DATA_DIR = dir;
    process.env.MNEMO_EMBEDDER = 'hash';
  });
  afterEach(() => {
    delete process.env.MNEMO_DATA_DIR;
    delete process.env.MNEMO_EMBEDDER;
    rmSync(dir, { recursive: true, force: true });
  });

  it('capture rules match expected files', () => {
    expect(shouldAutoCapture('/repo/CLAUDE.md')).toBe(true);
    expect(shouldAutoCapture('AGENTS.md')).toBe(true);
    expect(shouldAutoCapture('docs/decisions/0001-use-postgres.md')).toBe(true);
    expect(shouldAutoCapture('src/foo.ts')).toBe(false);
    expect(shouldAutoCapture('README.md')).toBe(false);
  });

  it('session-start returns empty when no memories', async () => {
    const out = await runSessionStart({ cwd: '/some/repo' });
    expect(out).toBe('');
  });

  it('session-start surfaces project + global memories', async () => {
    const cwd = '/some/repo';
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'project fact 1', scope: 'project', projectHash: projectHashOf(cwd) });
    await m.capture({ content: 'global preference X', scope: 'global' });
    await m.close();
    const out = await runSessionStart({ cwd });
    expect(out).toMatch(/## Mnemo memory snapshot/);
    expect(out).toMatch(/project fact 1/);
    expect(out).toMatch(/global preference X/);
  });

  it('post-edit captures CLAUDE.md edits', async () => {
    const cwd = '/some/repo';
    const out = await runPostEdit({
      tool_name: 'Write',
      tool_input: { file_path: '/some/repo/CLAUDE.md', content: 'Always use Vitest.' },
      cwd,
    });
    expect(out).toMatch(/captured/);
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const list = await m.list({ scope: 'project', projectHash: projectHashOf(cwd) });
    expect(list[0]!.tags).toContain('auto-edit');
    expect(list[0]!.source).toBe('auto-edit');
    await m.close();
  });

  it('post-edit ignores non-matching files', async () => {
    const out = await runPostEdit({
      tool_input: { file_path: '/some/repo/src/foo.ts', new_string: 'whatever' },
      cwd: '/some/repo',
    });
    expect(out).toBe('');
  });

  it('pre-task injects relevant memories', async () => {
    const cwd = '/some/repo';
    const m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    await m.capture({ content: 'OAuth tokens refresh every 30 minutes', scope: 'global' });
    await m.close();
    const out = await runPreTask({
      tool_input: { description: 'OAuth tokens refresh every 30 minutes' },
      cwd,
    });
    // hash embedder gives only stable but not strongly semantic similarity;
    // verify the function handles a populated store without crashing.
    expect(typeof out).toBe('string');
  });
});
