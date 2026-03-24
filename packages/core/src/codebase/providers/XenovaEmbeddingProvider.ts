/**
 * Xenova / @huggingface/transformers Embedding Provider
 *
 * Provides real semantic embeddings locally via WASM — no API key, no Ollama,
 * no server. The model (~25 MB) is downloaded once from HuggingFace Hub and
 * cached.
 *
 * Requires the optional dependency to be installed first:
 *   pnpm add @huggingface/transformers --filter @holoscript/core
 *
 * Default model: 'Xenova/all-MiniLM-L6-v2'  (384-dim, fast, high quality)
 * Alternative:   'Xenova/all-mpnet-base-v2'  (768-dim, higher quality, slower)
 */

import type { EmbeddingProvider } from './EmbeddingProvider';

export class XenovaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'xenova';

  private readonly modelName: string;
  // Lazily initialised so the (possibly slow) model load only happens on first use.
  private pipelinePromise: Promise<any> | null = null;

  /**
   * @param modelName - HuggingFace model identifier to use for feature
   *                    extraction. Defaults to `'Xenova/all-MiniLM-L6-v2'`
   *                    (384-dim, ~25 MB, fast). Alternative:
   *                    `'Xenova/all-mpnet-base-v2'` (768-dim, higher quality).
   *                    The model is downloaded on first use and cached locally.
   */
  constructor(modelName = 'Xenova/all-MiniLM-L6-v2') {
    this.modelName = modelName;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Embed texts using the WASM Sentence-Transformers pipeline.
   *
   * Mean-pools and L2-normalises the token embeddings so the output vectors
   * are suitable for cosine-similarity search. The model is loaded lazily on
   * the first call; subsequent calls reuse the cached pipeline.
   *
   * @param texts - One or more strings to embed.
   * @returns A `Promise` resolving to one embedding vector per input text.
   *          Vector length depends on the model (384 for the default model).
   * @throws If `@huggingface/transformers` is not installed. Install with:
   *         `pnpm add @huggingface/transformers --filter @holoscript/core`
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    const pipe = await this.loadPipeline();
    const results: number[][] = [];

    for (const text of texts) {
      // mean pooling + normalise → unit vector suitable for cosine similarity
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      // output.data is a Float32Array; convert to plain number[]
      results.push(Array.from(output.data) as number[]);
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private loadPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.initPipeline();
    }
    return this.pipelinePromise;
  }

  private async initPipeline(): Promise<any> {
    let transformers: any;

    try {
      // Try the current package name first (@huggingface/transformers v3+)
      transformers = await import('@huggingface/transformers');
    } catch {
      throw new Error(
        'Xenova provider requires @huggingface/transformers. ' +
          'Install it with:\n' +
          '  pnpm add @huggingface/transformers --filter @holoscript/core\n' +
          'or use --provider bm25 for zero-dependency operation.'
      );
    }

    const { pipeline } = transformers;
    return pipeline('feature-extraction', this.modelName, { quantized: true });
  }
}
