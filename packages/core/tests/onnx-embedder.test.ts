import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnnxEmbedder } from '../src/onnx-embedder.js';

const RUN_ONNX = process.env.MNEMO_TEST_ONNX === '1';
const d = RUN_ONNX ? describe : describe.skip;

d('OnnxEmbedder (slow, downloads model)', () => {
  it('produces 384-dim normalized embeddings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mnemo-onnx-'));
    try {
      const e = await OnnxEmbedder.load(dir);
      expect(e.dimension).toBe(384);
      const v = await e.embed('hello world');
      expect(v.length).toBe(384);
      let mag = 0;
      for (let i = 0; i < v.length; i++) mag += v[i]! * v[i]!;
      expect(Math.sqrt(mag)).toBeCloseTo(1, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('semantically similar texts have higher similarity than unrelated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mnemo-onnx-'));
    try {
      const e = await OnnxEmbedder.load(dir);
      const a = await e.embed('a cat is sleeping');
      const b = await e.embed('a kitten is napping');
      const c = await e.embed('database migration plan');
      const sim = (x: Float32Array, y: Float32Array) => {
        let s = 0;
        for (let i = 0; i < x.length; i++) s += x[i]! * y[i]!;
        return s;
      };
      expect(sim(a, b)).toBeGreaterThan(sim(a, c));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
