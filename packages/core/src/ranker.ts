import type { MemoryRecord } from './types.js';

export type RankerWeights = {
  similarity: number;
  recency: number;
  access: number;
};

export const DEFAULT_WEIGHTS: RankerWeights = {
  similarity: 0.7,
  recency: 0.2,
  access: 0.1,
};

const RECENCY_HALF_LIFE_DAYS = 30;
const ACCESS_SATURATION = 20;

export function score(
  similarity: number,
  rec: MemoryRecord,
  weights: RankerWeights = DEFAULT_WEIGHTS,
  now: number = Date.now(),
): number {
  const ageDays = Math.max(0, (now - rec.lastAccessedAt) / 86400_000);
  const recency = Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
  const accessBoost = Math.min(1, rec.accessCount / ACCESS_SATURATION);
  return (
    weights.similarity * similarity +
    weights.recency * recency +
    weights.access * accessBoost
  );
}
