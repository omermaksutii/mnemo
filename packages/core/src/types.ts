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
};

export type CaptureInput = {
  content: string;
  scope?: MemoryScope;
  projectHash?: string | null;
  source?: MemorySource;
  tags?: string[];
};

export type RecallOpts = {
  k?: number;
  scope?: MemoryScope | 'all';
  projectHash?: string | null;
  minScore?: number;
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
  limit?: number;
  since?: number;
};

export type MnemoStats = {
  totalMemories: number;
  byScope: Record<MemoryScope, number>;
  indexSize: number;
  embeddingDimension: number;
  storageBytes: number;
};

export type MnemoOpts = {
  dataDir?: string;
  embedderType?: 'onnx' | 'hash';
};
