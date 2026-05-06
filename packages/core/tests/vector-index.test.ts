import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VectorIndex } from '../src/vector-index.js';

function vec(seed: number, dim = 4): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.sin(seed + i);
  let mag = 0;
  for (let i = 0; i < dim; i++) mag += v[i]! * v[i]!;
  mag = Math.sqrt(mag);
  for (let i = 0; i < dim; i++) v[i] = v[i]! / mag;
  return v;
}

describe('VectorIndex', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mnemo-idx-'));
    path = join(dir, 'hnsw.bin');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('adds and queries nearest neighbors', async () => {
    const idx = await VectorIndex.open({ path, dimension: 4, maxElements: 100 });
    await idx.add('a', vec(0.1));
    await idx.add('b', vec(0.2));
    await idx.add('c', vec(5.0));
    const hits = await idx.query(vec(0.1), 2);
    expect(hits[0]!.id).toBe('a');
    expect(hits.map(h => h.id)).toContain('b');
  });

  it('removes by id', async () => {
    const idx = await VectorIndex.open({ path, dimension: 4, maxElements: 100 });
    await idx.add('a', vec(0.1));
    await idx.remove('a');
    const hits = await idx.query(vec(0.1), 5);
    expect(hits.find(h => h.id === 'a')).toBeUndefined();
  });

  it('persists across reopen', async () => {
    const idx = await VectorIndex.open({ path, dimension: 4, maxElements: 100 });
    await idx.add('a', vec(0.1));
    await idx.add('b', vec(0.2));
    await idx.save();
    expect(existsSync(path)).toBe(true);
    const reopened = await VectorIndex.open({ path, dimension: 4, maxElements: 100 });
    const hits = await reopened.query(vec(0.1), 1);
    expect(hits[0]!.id).toBe('a');
  });

  it('reports element count', async () => {
    const idx = await VectorIndex.open({ path, dimension: 4, maxElements: 100 });
    await idx.add('a', vec(0.1));
    await idx.add('b', vec(0.2));
    expect(idx.size()).toBe(2);
  });
});
