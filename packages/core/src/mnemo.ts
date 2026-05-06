import { randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { VectorIndex } from './vector-index.js';
import { HashEmbedder, type Embedder } from './embedder.js';
import { score } from './ranker.js';
import { paths, resolveDataDir } from './paths.js';
import type {
  CaptureInput,
  ListFilter,
  MemoryHit,
  MemoryRecord,
  MnemoOpts,
  MnemoStats,
  RecallOpts,
} from './types.js';
import { stat } from 'node:fs/promises';

export class Mnemo {
  private constructor(
    private store: Store,
    private index: VectorIndex,
    private embedder: Embedder,
    private dataDir: string,
  ) {}

  static async open(opts: MnemoOpts = {}): Promise<Mnemo> {
    const dataDir = resolveDataDir(opts.dataDir);
    const p = paths(dataDir);

    let embedder: Embedder;
    if (opts.embedderType === 'onnx') {
      const { OnnxEmbedder } = await import('./onnx-embedder.js');
      embedder = await OnnxEmbedder.load(p.modelDir);
    } else {
      embedder = new HashEmbedder({ dimension: 384 });
    }

    const store = await Store.open(p.dbFile);
    const index = await VectorIndex.open({
      path: p.indexFile,
      dimension: embedder.dimension,
      maxElements: 100_000,
    });

    // Rebuild missing index entries from store (covers cold start where
    // the index was deleted but the database survived).
    const all = await store.list({});
    if (index.size() < all.length) {
      for (const rec of all) {
        const v = await embedder.embed(rec.content);
        await index.add(rec.id, v);
      }
      await index.save();
    }

    return new Mnemo(store, index, embedder, dataDir);
  }

  async capture(input: CaptureInput): Promise<MemoryRecord> {
    const now = Date.now();
    const rec: MemoryRecord = {
      id: randomUUID(),
      scope: input.scope ?? 'project',
      projectHash: input.projectHash ?? null,
      source: input.source ?? 'manual',
      content: input.content,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };
    await this.store.upsert(rec);
    const v = await this.embedder.embed(rec.content);
    await this.index.add(rec.id, v);
    await this.index.save();
    return rec;
  }

  async recall(query: string, opts: RecallOpts = {}): Promise<MemoryHit[]> {
    const k = opts.k ?? 10;
    const minScore = opts.minScore ?? 0;
    const v = await this.embedder.embed(query);
    const candidates = await this.index.query(v, Math.max(k * 4, 20));
    const out: MemoryHit[] = [];
    for (const cand of candidates) {
      const rec = await this.store.get(cand.id);
      if (!rec) continue;
      if (opts.scope && opts.scope !== 'all' && rec.scope !== opts.scope) continue;
      if (opts.projectHash !== undefined && rec.projectHash !== opts.projectHash) continue;
      const s = score(cand.similarity, rec);
      if (s < minScore) continue;
      out.push({ record: rec, score: s, similarity: cand.similarity });
    }
    out.sort((a, b) => b.score - a.score);
    const top = out.slice(0, k);
    for (const hit of top) await this.store.bumpAccess(hit.record.id);
    return top;
  }

  async forget(id: string): Promise<void> {
    await this.store.delete(id);
    await this.index.remove(id);
    await this.index.save();
  }

  async list(filter: ListFilter = {}): Promise<MemoryRecord[]> {
    return this.store.list(filter);
  }

  async stats(): Promise<MnemoStats> {
    const counts = await this.store.count();
    let storageBytes = 0;
    try {
      const s = await stat(paths(this.dataDir).dbFile);
      storageBytes = s.size;
    } catch {}
    return {
      totalMemories: counts.total,
      byScope: counts.byScope,
      indexSize: this.index.size(),
      embeddingDimension: this.embedder.dimension,
      storageBytes,
    };
  }

  async export(): Promise<MemoryRecord[]> {
    return this.store.list({});
  }

  async import(records: MemoryRecord[]): Promise<void> {
    for (const rec of records) {
      await this.store.upsert({ ...rec, source: 'imported' });
      const v = await this.embedder.embed(rec.content);
      await this.index.add(rec.id, v);
    }
    await this.index.save();
  }

  async close(): Promise<void> {
    await this.index.save();
    this.store.close();
  }
}
