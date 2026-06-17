import { describe, it, expect } from 'vitest';
import { quantizeInt8, dequantizeInt8, cosine, bytesSaved } from '../src/quantize.js';
import { HashEmbedder } from '../src/embedder.js';

describe('int8 quantization', () => {
  it('reconstructs a vector within tight error', async () => {
    const emb = new HashEmbedder({ dimension: 384 });
    const v = await emb.embed('the rain in spain falls mainly on the plain');
    const q = quantizeInt8(v);
    expect(q.data.length).toBe(v.length);
    const back = dequantizeInt8(q);
    // Cosine similarity to the original must stay essentially 1.
    expect(cosine(v, back)).toBeGreaterThan(0.999);
  });

  it('preserves relative ranking between two embeddings', async () => {
    const emb = new HashEmbedder({ dimension: 384 });
    const query = await emb.embed('database migrations');
    const near = await emb.embed('database migrations and schema changes');
    const far = await emb.embed('cooking pasta for dinner');
    const qq = dequantizeInt8(quantizeInt8(query));
    const qn = dequantizeInt8(quantizeInt8(near));
    const qf = dequantizeInt8(quantizeInt8(far));
    expect(cosine(qq, qn)).toBeGreaterThan(cosine(qq, qf));
  });

  it('handles the all-zero vector', () => {
    const z = new Float32Array(8);
    const back = dequantizeInt8(quantizeInt8(z));
    expect([...back].every(x => x === 0)).toBe(true);
  });

  it('reports ~4x byte savings', () => {
    expect(bytesSaved(384)).toBe(384 * 4 - (384 + 4));
  });
});
