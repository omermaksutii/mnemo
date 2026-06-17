export type MemoryScope = 'project' | 'global' | 'team';

export type MemorySource = 'manual' | 'auto-edit' | 'auto-task' | 'imported' | 'team-sync';

/** Structured category beyond freeform tags. Channels are an opinionated set. */
export type MemoryChannel =
  | 'decision'
  | 'convention'
  | 'gotcha'
  | 'todo'
  | 'anti-pattern'
  | 'note'
  | 'procedure';

export const CHANNELS: readonly MemoryChannel[] = [
  'decision',
  'convention',
  'gotcha',
  'todo',
  'anti-pattern',
  'note',
  'procedure',
] as const;

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
  /** Optional structured channel for organizing memories beyond tags. */
  channel: MemoryChannel | null;
  /** Free-form JSON metadata. Used by procedures (steps, run counts) and future v2 features. */
  metadata: Record<string, unknown> | null;
};

/** Procedural memory: a named workflow Claude can follow step-by-step. */
export type Procedure = {
  /** Stable identifier (kebab-case recommended). */
  name: string;
  /** One-line summary used for semantic matching. */
  description: string;
  /** Ordered steps. Each step is one action. */
  steps: string[];
  /** Stats. */
  runs: number;
  successes: number;
  failures: number;
  /** Underlying memory id so we can update it. */
  memoryId: string;
  scope: MemoryScope;
};

export type CaptureInput = {
  content: string;
  scope?: MemoryScope;
  projectHash?: string | null;
  source?: MemorySource;
  tags?: string[];
  channel?: MemoryChannel | null;
  metadata?: Record<string, unknown> | null;
  /** Unix ms or null. Convenience helper: pass `Date.now() + ms` for relative TTL. */
  expiresAt?: number | null;
  /**
   * Cosine-similarity threshold (0–1). If a candidate already exists with similarity ≥ this,
   * Mnemo updates the existing record instead of inserting a duplicate. Default 0.95.
   * Pass `0` to always insert.
   */
  dedupThreshold?: number;
  /** Override secret-guard. Default false. */
  allowSensitive?: boolean;
  /** Pre-supplied id (used when importing/team-sync to preserve identity). */
  id?: string;
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
  /** Filter results by channel. */
  channel?: MemoryChannel | MemoryChannel[];
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
  channel?: MemoryChannel | MemoryChannel[];
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
  channel?: MemoryChannel | null;
  metadata?: Record<string, unknown> | null;
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
  byChannel: Record<string, number>;
  indexSize: number;
  embeddingDimension: number;
  storageBytes: number;
  expired: number;
  neverRecalled: number;
};

export type MnemoOpts = {
  dataDir?: string;
  embedderType?: 'onnx' | 'hash';
  /** Passphrase for encryption-at-rest. Falls back to $MNEMO_ENCRYPTION_KEY. */
  encryptionKey?: string;
};
