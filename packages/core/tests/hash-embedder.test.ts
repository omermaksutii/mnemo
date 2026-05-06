import { describe, it, expect } from 'vitest';
import { HashEmbedder } from '../src/embedder.js';

describe('HashEmbedder', () => {
  const e = new HashEmbedder({ dimension: 384 });

  it('produces stable embeddings', async () => {
    const a = await e.embed('hello world');
    const b = await e.embed('hello world');
    expect(a).toEqual(b);
  });

  it('embeddings have configured dimension', async () => {
    const v = await e.embed('hello');
    expect(v.length).toBe(384);
  });

  it('embeddings are unit normalized', async () => {
    const v = await e.embed('test');
    let mag = 0;
    for (let i = 0; i < v.length; i++) mag += v[i]! * v[i]!;
    expect(Math.sqrt(mag)).toBeCloseTo(1, 5);
  });

  it('different inputs produce different embeddings', async () => {
    const a = await e.embed('cats are lovely');
    const b = await e.embed('database migration plan');
    expect(a).not.toEqual(b);
  });

  it('embedBatch returns one vector per input', async () => {
    const out = await e.embedBatch(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    out.forEach(v => expect(v.length).toBe(384));
  });
});
