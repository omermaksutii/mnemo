/**
 * Int8 embedding quantization (v1.3). Symmetric per-vector quantization gives
 * ~4× memory savings (float32 → int8) while preserving cosine similarity to
 * within a fraction of a percent for normalized MiniLM embeddings.
 *
 * Each vector is quantized independently: scale = max(|v|) / 127, then
 * q[i] = round(v[i] / scale). Reconstruction is v'[i] = q[i] * scale.
 */

export type QuantizedVector = {
  /** Int8 components, one per dimension. */
  data: Int8Array;
  /** Per-vector scale factor; multiply to reconstruct. */
  scale: number;
};

export function quantizeInt8(vector: Float32Array): QuantizedVector {
  let maxAbs = 0;
  for (let i = 0; i < vector.length; i++) {
    const a = Math.abs(vector[i]!);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs === 0 ? 1 : maxAbs / 127;
  const data = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const q = Math.round(vector[i]! / scale);
    data[i] = q < -127 ? -127 : q > 127 ? 127 : q;
  }
  return { data, scale };
}

export function dequantizeInt8(q: QuantizedVector): Float32Array {
  const out = new Float32Array(q.data.length);
  for (let i = 0; i < q.data.length; i++) {
    out[i] = q.data[i]! * q.scale;
  }
  return out;
}

/** Cosine similarity between two float vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Bytes saved per vector by storing int8 + a single float32 scale vs. float32. */
export function bytesSaved(dimension: number): number {
  const float32Bytes = dimension * 4;
  const int8Bytes = dimension * 1 + 4; // +4 for the scale
  return float32Bytes - int8Bytes;
}
