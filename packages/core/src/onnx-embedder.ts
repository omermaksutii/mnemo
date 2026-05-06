import { mkdir } from 'node:fs/promises';
import type { Embedder } from './embedder.js';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

type FeatureExtractionPipeline = (
  texts: string | string[],
  opts?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

export class OnnxEmbedder implements Embedder {
  readonly dimension = 384;

  private constructor(private pipe: FeatureExtractionPipeline) {}

  static async load(modelCacheDir: string): Promise<OnnxEmbedder> {
    await mkdir(modelCacheDir, { recursive: true });
    const transformers = (await import('@huggingface/transformers')) as unknown as {
      env: { cacheDir: string; allowLocalModels: boolean };
      pipeline: (task: string, model: string) => Promise<FeatureExtractionPipeline>;
    };
    transformers.env.cacheDir = modelCacheDir;
    transformers.env.allowLocalModels = false;
    const pipe = await transformers.pipeline('feature-extraction', MODEL_ID);
    return new OnnxEmbedder(pipe);
  }

  async embed(text: string): Promise<Float32Array> {
    const out = await this.pipe(text, { pooling: 'mean', normalize: true });
    return new Float32Array(out.data.slice(0, this.dimension));
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const out = await this.pipe(texts, { pooling: 'mean', normalize: true });
    const result: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      result.push(new Float32Array(out.data.slice(i * this.dimension, (i + 1) * this.dimension)));
    }
    return result;
  }
}
