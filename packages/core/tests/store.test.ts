import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import type { MemoryRecord } from '../src/types.js';

function sample(over: Partial<MemoryRecord> = {}): MemoryRecord {
  const now = Date.now();
  return {
    id: 'r1',
    scope: 'project',
    projectHash: 'abc123',
    source: 'manual',
    content: 'Hello world',
    tags: ['test'],
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: now,
    expiresAt: null,
    channel: null,
    metadata: null,
    ...over,
  };
}

describe('Store', () => {
  let dir: string;
  let store: Store;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-store-'));
    store = await Store.open(join(dir, 'memory.db'));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('inserts and retrieves a record', async () => {
    await store.upsert(sample());
    const got = await store.get('r1');
    expect(got?.content).toBe('Hello world');
    expect(got?.tags).toEqual(['test']);
  });

  it('returns null for missing record', async () => {
    expect(await store.get('nope')).toBeNull();
  });

  it('deletes a record', async () => {
    await store.upsert(sample());
    await store.delete('r1');
    expect(await store.get('r1')).toBeNull();
  });

  it('lists by scope and project', async () => {
    await store.upsert(sample({ id: 'a', scope: 'project', projectHash: 'p1' }));
    await store.upsert(sample({ id: 'b', scope: 'project', projectHash: 'p2' }));
    await store.upsert(sample({ id: 'c', scope: 'global', projectHash: null }));
    const projP1 = await store.list({ scope: 'project', projectHash: 'p1' });
    expect(projP1.map(r => r.id)).toEqual(['a']);
    const globals = await store.list({ scope: 'global' });
    expect(globals.map(r => r.id)).toEqual(['c']);
  });

  it('counts and reports stats', async () => {
    await store.upsert(sample({ id: 'a', scope: 'project' }));
    await store.upsert(sample({ id: 'b', scope: 'global', projectHash: null }));
    const stats = await store.count();
    expect(stats.total).toBe(2);
    expect(stats.byScope.project).toBe(1);
    expect(stats.byScope.global).toBe(1);
  });

  it('persists across reopen', async () => {
    await store.upsert(sample());
    await store.flush();
    store.close();
    const reopened = await Store.open(join(dir, 'memory.db'));
    const got = await reopened.get('r1');
    expect(got?.content).toBe('Hello world');
    reopened.close();
  });

  it('updates access counters atomically', async () => {
    await store.upsert(sample({ accessCount: 0 }));
    await store.bumpAccess('r1');
    const got = await store.get('r1');
    expect(got?.accessCount).toBe(1);
    expect(got?.lastAccessedAt).toBeGreaterThan(0);
  });
});
