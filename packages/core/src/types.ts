export type MemoryScope = 'project' | 'global';

export type MemorySource = 'manual' | 'auto-edit' | 'auto-task' | 'imported';

export type MemoryRecord = {
  id: string;
  scope: MemoryScope;
  projectHash: string | null;
  source: MemorySource;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  /** Unix ms after which the memory should be considered expired and skipped from recall. null = never. */
  expiresAt: number | null;
};

export type CaptureInput = {
  content: string;
  scope?: MemoryScope;
  projectHash?: string | null;
  source?: MemorySource;
  tags?: string[];
  /** Unix ms or null. Convenience helper: pass `Date.now() + ms` for relative TTL. */
  expiresAt?: number | null;
  /**
   * Cosine-similarity threshold (0–1). If a candidate already exists with similarity ≥ this,
   * Mnemo updates the existing record instead of inserting a duplicate. Default 0.95.
   * Pass `0` to always insert.
   */
  dedupThreshold?: number;
};

export type RecallOpts = {
  k?: number;
  scope?: MemoryScope | 'all';
  projectHash?: string | null;
  minScore?: number;
  /** Filter results to memories that have ALL of these tags. */
  tags?: string[];
  /** Filter results by source. */
  source?: MemorySource | MemorySource[];
  /** Only consider memories with `updatedAt >= since` (unix ms). */
  since?: number;
  /** Include expired memories in results. Default false. */
  includeExpired?: boolean;
};

export type MemoryHit = {
  record: MemoryRecord;
  score: number;
  similarity: number;
};

export type ListFilter = {
  scope?: MemoryScope;
  projectHash?: string | null;
  tags?: string[];
  source?: MemorySource | MemorySource[];
  limit?: number;
  since?: number;
  includeExpired?: boolean;
};

export type UpdateInput = {
  content?: string;
  tags?: string[];
  scope?: MemoryScope;
  projectHash?: string | null;
  expiresAt?: number | null;
};

export type PruneOpts = {
  /** Drop memories whose `expiresAt` is in the past. Default true. */
  expired?: boolean;
  /** Drop memories with similarity ≥ this to a *more recently accessed* peer. Default 0.97. Set 0 to disable. */
  duplicateThreshold?: number;
  /** Drop memories with `accessCount` < this AND older than `staleAfterDays`. Default disabled (0). */
  minAccessCount?: number;
  staleAfterDays?: number;
  /** When true, only return what would be pruned without deleting. */
  dryRun?: boolean;
};

export type PruneResult = {
  expired: MemoryRecord[];
  duplicates: { kept: MemoryRecord; dropped: MemoryRecord }[];
  stale: MemoryRecord[];
  totalDeleted: number;
};

export type MnemoStats = {
  totalMemories: number;
  byScope: Record<MemoryScope, number>;
  indexSize: number;
  embeddingDimension: number;
  storageBytes: number;
  expired: number;
};

export type MnemoOpts = {
  dataDir?: string;
  embedderType?: 'onnx' | 'hash';
};
