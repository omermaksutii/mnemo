import { createHash } from 'node:crypto';

export interface Embedder {
  readonly dimension: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export type HashEmbedderOpts = {
  dimension?: number;
};

/**
 * Deterministic, dependency-free embedder for tests.
 * Real semantic similarity is provided by OnnxEmbedder.
 */
export class HashEmbedder implements Embedder {
  readonly dimension: number;

  constructor(opts: HashEmbedderOpts = {}) {
    this.dimension = opts.dimension ?? 384;
  }

  async embed(text: string): Promise<Float32Array> {
    const out = new Float32Array(this.dimension);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    for (const tok of tokens) {
      const h = createHash('sha256').update(tok).digest();
      for (let i = 0; i < this.dimension; i++) {
        const byte = h[i % h.length] ?? 0;
        out[i]! += (byte / 255) * 2 - 1;
      }
    }
    let mag = 0;
    for (let i = 0; i < out.length; i++) mag += out[i]! * out[i]!;
    mag = Math.sqrt(mag) || 1;
    for (let i = 0; i < out.length; i++) out[i] = out[i]! / mag;
    return out;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
