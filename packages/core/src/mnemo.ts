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
  PruneOpts,
  PruneResult,
  RecallOpts,
  UpdateInput,
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

    // Rebuild missing index entries from store (covers cold start where the
    // index was deleted but the database survived).
    const all = await store.list({ includeExpired: true });
    if (index.size() < all.length) {
      for (const rec of all) {
        const v = await embedder.embed(rec.content);
        await index.add(rec.id, v);
      }
      await index.save();
    }

    return new Mnemo(store, index, embedder, dataDir);
  }

  /** True when the most recent `capture()` updated an existing memory instead of inserting a new one. */
  lastCaptureDeduped = false;

  async capture(input: CaptureInput): Promise<MemoryRecord> {
    const dedupThreshold = input.dedupThreshold ?? 0.95;
    const v = await this.embedder.embed(input.content);
    this.lastCaptureDeduped = false;

    if (dedupThreshold > 0 && this.index.size() > 0) {
      const candidates = await this.index.query(v, 5);
      for (const cand of candidates) {
        if (cand.similarity < dedupThreshold) break;
        const existing = await this.store.get(cand.id);
        if (!existing) continue;
        const sameScope =
          existing.scope === (input.scope ?? 'project') &&
          existing.projectHash === (input.projectHash ?? null);
        if (!sameScope) continue;
        const updated = await this.store.update(existing.id, {
          content: input.content,
          tags: dedupeTags([...(existing.tags ?? []), ...(input.tags ?? [])]),
          expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
        });
        if (updated) {
          const v2 = await this.embedder.embed(updated.content);
          await this.index.add(updated.id, v2);
          await this.index.save();
          this.lastCaptureDeduped = true;
          return updated;
        }
      }
    }

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
      expiresAt: input.expiresAt ?? null,
    };
    await this.store.upsert(rec);
    await this.index.add(rec.id, v);
    await this.index.save();
    return rec;
  }

  async recall(query: string, opts: RecallOpts = {}): Promise<MemoryHit[]> {
    const k = opts.k ?? 10;
    const minScore = opts.minScore ?? 0;
    const v = await this.embedder.embed(query);
    const candidates = await this.index.query(v, Math.max(k * 4, 20));
    const requiredTags = opts.tags ?? [];
    const sources = opts.source ? (Array.isArray(opts.source) ? opts.source : [opts.source]) : null;
    const since = opts.since ?? 0;
    const now = Date.now();
    const out: MemoryHit[] = [];

    for (const cand of candidates) {
      const rec = await this.store.get(cand.id);
      if (!rec) continue;
      if (opts.scope && opts.scope !== 'all' && rec.scope !== opts.scope) continue;
      if (opts.projectHash !== undefined && rec.projectHash !== opts.projectHash) continue;
      if (!opts.includeExpired && rec.expiresAt !== null && rec.expiresAt <= now) continue;
      if (since && rec.updatedAt < since) continue;
      if (sources && !sources.includes(rec.source)) continue;
      if (requiredTags.length && !requiredTags.every(t => rec.tags.includes(t))) continue;
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

  async update(id: string, fields: UpdateInput): Promise<MemoryRecord | null> {
    const updated = await this.store.update(id, fields);
    if (!updated) return null;
    if (fields.content !== undefined) {
      const v = await this.embedder.embed(updated.content);
      await this.index.add(updated.id, v);
      await this.index.save();
    }
    return updated;
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
      expired: counts.expired,
    };
  }

  async export(): Promise<MemoryRecord[]> {
    return this.store.list({ includeExpired: true });
  }

  async import(records: MemoryRecord[]): Promise<void> {
    for (const rec of records) {
      await this.store.upsert({
        ...rec,
        source: 'imported',
        expiresAt: rec.expiresAt ?? null,
      });
      const v = await this.embedder.embed(rec.content);
      await this.index.add(rec.id, v);
    }
    await this.index.save();
  }

  async prune(opts: PruneOpts = {}): Promise<PruneResult> {
    const expiredOn = opts.expired !== false;
    const dupThr = opts.duplicateThreshold ?? 0.97;
    const minAccess = opts.minAccessCount ?? 0;
    const staleDays = opts.staleAfterDays ?? 0;
    const dryRun = !!opts.dryRun;
    const now = Date.now();

    const all = await this.store.list({ includeExpired: true });
    const expired: MemoryRecord[] = [];
    const stale: MemoryRecord[] = [];
    const duplicates: { kept: MemoryRecord; dropped: MemoryRecord }[] = [];

    if (expiredOn) {
      for (const r of all) {
        if (r.expiresAt !== null && r.expiresAt <= now) expired.push(r);
      }
    }

    if (minAccess > 0 && staleDays > 0) {
      const cutoff = now - staleDays * 86400_000;
      for (const r of all) {
        if (r.accessCount < minAccess && r.updatedAt < cutoff && !expired.includes(r)) {
          stale.push(r);
        }
      }
    }

    if (dupThr > 0) {
      const seen = new Set<string>();
      // Walk by most-recently-accessed first; a more recently accessed record wins.
      const sorted = [...all].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
      for (const keep of sorted) {
        if (seen.has(keep.id) || expired.includes(keep)) continue;
        const v = await this.embedder.embed(keep.content);
        const peers = await this.index.query(v, 8);
        for (const peer of peers) {
          if (peer.id === keep.id) continue;
          if (peer.similarity < dupThr) continue;
          const dropCandidate = await this.store.get(peer.id);
          if (!dropCandidate) continue;
          if (dropCandidate.scope !== keep.scope || dropCandidate.projectHash !== keep.projectHash) continue;
          if (dropCandidate.lastAccessedAt > keep.lastAccessedAt) continue;
          if (seen.has(dropCandidate.id) || expired.includes(dropCandidate)) continue;
          duplicates.push({ kept: keep, dropped: dropCandidate });
          seen.add(dropCandidate.id);
        }
        seen.add(keep.id);
      }
    }

    let totalDeleted = 0;
    if (!dryRun) {
      const toDelete = new Set<string>([
        ...expired.map(r => r.id),
        ...stale.map(r => r.id),
        ...duplicates.map(d => d.dropped.id),
      ]);
      for (const id of toDelete) {
        await this.store.delete(id);
        await this.index.remove(id);
      }
      if (toDelete.size > 0) await this.index.save();
      totalDeleted = toDelete.size;
    }

    return { expired, duplicates, stale, totalDeleted };
  }

  async close(): Promise<void> {
    await this.index.save();
    this.store.close();
  }
}

function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(t => t.trim()).filter(Boolean)));
}
