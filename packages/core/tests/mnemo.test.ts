import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mnemo } from '../src/mnemo.js';

describe('Mnemo (with HashEmbedder)', () => {
  let dir: string;
  let m: Mnemo;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-e2e-'));
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
  });
  afterEach(async () => {
    await m.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('captures and recalls a memory', async () => {
    await m.capture({ content: 'we use Vitest, never Jest', scope: 'global' });
    const hits = await m.recall('Vitest test runner');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.record.content).toMatch(/Vitest/);
  });

  it('respects scope filter', async () => {
    await m.capture({ content: 'project-only fact', scope: 'project', projectHash: 'p1' });
    await m.capture({ content: 'global fact', scope: 'global' });
    const projectHits = await m.recall('fact', { scope: 'project', projectHash: 'p1' });
    expect(projectHits.every(h => h.record.scope === 'project')).toBe(true);
  });

  it('forget removes a memory', async () => {
    const created = await m.capture({ content: 'forgettable' });
    await m.forget(created.id);
    const list = await m.list();
    expect(list.find(r => r.id === created.id)).toBeUndefined();
  });

  it('list returns recent first', async () => {
    const a = await m.capture({ content: 'first' });
    await new Promise(r => setTimeout(r, 5));
    const b = await m.capture({ content: 'second' });
    const list = await m.list();
    expect(list[0]!.id).toBe(b.id);
    expect(list[1]!.id).toBe(a.id);
  });

  it('stats reports totals and dimension', async () => {
    await m.capture({ content: 'a', scope: 'global' });
    await m.capture({ content: 'b', scope: 'project', projectHash: 'p1' });
    const s = await m.stats();
    expect(s.totalMemories).toBe(2);
    expect(s.byScope.global).toBe(1);
    expect(s.byScope.project).toBe(1);
    expect(s.embeddingDimension).toBe(384);
  });

  it('persists across reopen', async () => {
    await m.capture({ content: 'persists across restart', scope: 'global' });
    await m.close();
    const m2 = await Mnemo.open({ dataDir: dir, embedderType: 'hash' });
    const hits = await m2.recall('persists across restart');
    expect(hits[0]!.record.content).toMatch(/persists/);
    await m2.close();
    m = await Mnemo.open({ dataDir: dir, embedderType: 'hash' }); // restore for afterEach close
  });

  it('export/import round-trips', async () => {
    await m.capture({ content: 'one', scope: 'global' });
    await m.capture({ content: 'two', scope: 'global' });
    const dump = await m.export();
    expect(dump).toHaveLength(2);

    const dir2 = mkdtempSync(join(tmpdir(), 'mnemo-e2e2-'));
    try {
      const m2 = await Mnemo.open({ dataDir: dir2, embedderType: 'hash' });
      await m2.import(dump);
      const list = await m2.list();
      expect(list).toHaveLength(2);
      await m2.close();
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});
