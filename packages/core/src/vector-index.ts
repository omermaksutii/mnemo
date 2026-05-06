import hnswlib, { type HierarchicalNSW as HnswType } from 'hnswlib-node';
import { existsSync } from 'node:fs';

const { HierarchicalNSW } = hnswlib;
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

export type VectorIndexOpts = {
  path: string;
  dimension: number;
  maxElements?: number;
  m?: number;
  efConstruction?: number;
};

export type VectorHit = {
  id: string;
  similarity: number; // cosine similarity in [-1, 1]
};

type LabelMap = {
  entries: [string, number][];
  nextLabel: number;
};

/**
 * HNSW vector index with id-based lookup. Stores a label↔id mapping
 * separately because hnswlib uses numeric labels.
 */
export class VectorIndex {
  private nextLabel = 1;
  private idToLabel = new Map<string, number>();
  private labelToId = new Map<number, string>();

  private constructor(
    private hnsw: HnswType,
    private opts: Required<VectorIndexOpts>,
  ) {}

  private static mapPath(p: string): string {
    return `${p}.map.json`;
  }

  static async open(opts: VectorIndexOpts): Promise<VectorIndex> {
    const full: Required<VectorIndexOpts> = {
      path: opts.path,
      dimension: opts.dimension,
      maxElements: opts.maxElements ?? 100_000,
      m: opts.m ?? 16,
      efConstruction: opts.efConstruction ?? 200,
    };
    const hnsw = new HierarchicalNSW('cosine', full.dimension);
    if (existsSync(full.path)) {
      hnsw.readIndexSync(full.path);
    } else {
      await mkdir(dirname(full.path), { recursive: true });
      hnsw.initIndex(full.maxElements, full.m, full.efConstruction);
    }
    hnsw.setEf(Math.max(50, full.m * 4));
    const idx = new VectorIndex(hnsw, full);
    if (existsSync(VectorIndex.mapPath(full.path))) {
      const raw = await readFile(VectorIndex.mapPath(full.path), 'utf8');
      const parsed = JSON.parse(raw) as LabelMap;
      idx.nextLabel = parsed.nextLabel;
      for (const [id, label] of parsed.entries) {
        idx.idToLabel.set(id, label);
        idx.labelToId.set(label, id);
      }
    }
    return idx;
  }

  async add(id: string, vector: Float32Array): Promise<void> {
    if (vector.length !== this.opts.dimension) {
      throw new Error(`vector dim ${vector.length} != index dim ${this.opts.dimension}`);
    }
    const existing = this.idToLabel.get(id);
    const label = existing ?? this.nextLabel++;
    this.hnsw.addPoint(Array.from(vector), label);
    this.idToLabel.set(id, label);
    this.labelToId.set(label, id);
  }

  async remove(id: string): Promise<void> {
    const label = this.idToLabel.get(id);
    if (label === undefined) return;
    this.hnsw.markDelete(label);
    this.idToLabel.delete(id);
    this.labelToId.delete(label);
  }

  async query(vector: Float32Array, k: number): Promise<VectorHit[]> {
    if (this.size() === 0) return [];
    const got = this.hnsw.searchKnn(Array.from(vector), Math.min(k, this.size()));
    const out: VectorHit[] = [];
    for (let i = 0; i < got.neighbors.length; i++) {
      const label = got.neighbors[i]!;
      const id = this.labelToId.get(label);
      if (!id) continue;
      // hnswlib returns cosine *distance* (1 - sim) for 'cosine' space.
      const distance = got.distances[i]!;
      out.push({ id, similarity: 1 - distance });
    }
    return out;
  }

  size(): number {
    return this.idToLabel.size;
  }

  async save(): Promise<void> {
    // hnswlib-node has a quirk where a saved-then-reloaded empty index
    // refuses to accept new points ("exceeds the specified limit"). Avoid
    // it by only persisting the HNSW binary once we actually have entries.
    if (this.idToLabel.size === 0) {
      // Best-effort cleanup of any prior empty file.
      try { await unlink(this.opts.path); } catch {}
      try { await unlink(VectorIndex.mapPath(this.opts.path)); } catch {}
      return;
    }
    this.hnsw.writeIndexSync(this.opts.path);
    const map: LabelMap = {
      entries: [...this.idToLabel.entries()],
      nextLabel: this.nextLabel,
    };
    await writeFile(VectorIndex.mapPath(this.opts.path), JSON.stringify(map));
  }
}
