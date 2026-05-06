import { describe, it, expect } from 'vitest';
import { score, DEFAULT_WEIGHTS } from '../src/ranker.js';
import type { MemoryRecord } from '../src/types.js';

function rec(over: Partial<MemoryRecord> = {}): MemoryRecord {
  const now = Date.now();
  return {
    id: 'x', scope: 'project', projectHash: null, source: 'manual',
    content: 'c', tags: [], createdAt: now, updatedAt: now,
    accessCount: 0, lastAccessedAt: now, ...over,
  };
}

describe('ranker.score', () => {
  it('similarity dominates with default weights', () => {
    const fresh = rec();
    expect(score(0.9, fresh)).toBeGreaterThan(score(0.1, fresh));
  });

  it('newer records score higher than older with same similarity', () => {
    const now = Date.now();
    const oldRec = rec({ createdAt: now - 90 * 86400_000, lastAccessedAt: now - 90 * 86400_000 });
    const newRec = rec({ createdAt: now, lastAccessedAt: now });
    expect(score(0.5, newRec)).toBeGreaterThan(score(0.5, oldRec));
  });

  it('higher access count boosts score', () => {
    const cold = rec({ accessCount: 0 });
    const hot = rec({ accessCount: 50 });
    expect(score(0.5, hot)).toBeGreaterThan(score(0.5, cold));
  });

  it('exposes default weights summing to 1', () => {
    const sum = DEFAULT_WEIGHTS.similarity + DEFAULT_WEIGHTS.recency + DEFAULT_WEIGHTS.access;
    expect(sum).toBeCloseTo(1, 5);
  });
});
