/**
 * Embedding Provider Factory
 *
 * Factory function for creating embedding providers.
 * Extracted from EmbeddingProvider.ts to avoid circular dependencies
 * between the interface file and the concrete provider implementations.
 *
 * Each concrete provider is loaded lazily via dynamic import to
 * keep optional dependencies truly optional.
 */

import type { EmbeddingProvider, EmbeddingProviderName, EmbeddingProviderOptions } from './EmbeddingProvider';

/**
 * Create an EmbeddingProvider from options.
 *
 * @example
 * // Zero-dependency, always works:
 * const p = await createEmbeddingProvider({ provider: 'bm25' });
 *
 * // Local WASM semantics (requires: pnpm add @huggingface/transformers):
 * const p = await createEmbeddingProvider({ provider: 'xenova' });
 *
 * // OpenAI API (requires: pnpm add openai):
 * const p = await createEmbeddingProvider({ provider: 'openai', openaiApiKey: '...' });
 *
 * // Original Ollama behaviour:
 * const p = await createEmbeddingProvider({ provider: 'ollama', ollamaUrl: '...' });
 */
export async function createEmbeddingProvider(
  opts: EmbeddingProviderOptions = {}
): Promise<EmbeddingProvider> {
  const name: EmbeddingProviderName = opts.provider ?? 'bm25';

  switch (name) {
    case 'bm25': {
      const { BM25EmbeddingProvider } = await import('./BM25EmbeddingProvider');
      return new BM25EmbeddingProvider();
    }
    case 'xenova': {
      const { XenovaEmbeddingProvider } = await import('./XenovaEmbeddingProvider');
      return new XenovaEmbeddingProvider(opts.xenovaModel);
    }
    case 'openai': {
      const { OpenAIEmbeddingProvider } = await import('./OpenAIEmbeddingProvider');
      return new OpenAIEmbeddingProvider(opts.openaiApiKey, opts.openaiModel);
    }
    case 'ollama': {
      const { OllamaEmbeddingProvider } = await import('./OllamaEmbeddingProvider');
      return new OllamaEmbeddingProvider(opts.ollamaUrl, opts.ollamaModel);
    }
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown embedding provider: ${String(_exhaustive)}`);
    }
  }
}
