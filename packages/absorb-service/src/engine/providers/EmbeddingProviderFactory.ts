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

import type {
  EmbeddingProvider,
  EmbeddingProviderName,
  EmbeddingProviderOptions,
} from './EmbeddingProvider';

/**
 * Create an EmbeddingProvider from options.
 *
 * Default provider is 'structural' — HoloGraph native embeddings.
 * Zero-dependency, zero-latency, no API key, no model download.
 * Achieves 100% recall for graph-topology queries (Paper 26 Table 1).
 *
 * @example
 * // Default (HoloGraph structural — recommended for graph queries):
 * const p = await createEmbeddingProvider();
 *
 * // NL semantic search (requires running Ollama server):
 * const p = await createEmbeddingProvider({ provider: 'ollama', ollamaUrl: '...' });
 *
 * // NL semantic search (requires OPENAI_API_KEY):
 * const p = await createEmbeddingProvider({ provider: 'openai', openaiApiKey: '...' });
 *
 * // Local WASM semantics (requires: pnpm add @huggingface/transformers):
 * const p = await createEmbeddingProvider({ provider: 'xenova' });
 */
export async function createEmbeddingProvider(
  opts: EmbeddingProviderOptions = {}
): Promise<EmbeddingProvider> {
  const name: EmbeddingProviderName = opts.provider ?? 'structural';

  switch (name) {
    case 'structural': {
      // Zero-dependency, zero-latency deterministic structural embeddings.
      // No API key, no network, no model download. Suitable for CI, offline
      // environments, and Paper 26 benchmarks. 384-dim, L2-normalized.
      const { StructuralEmbeddingProvider } = await import('./StructuralEmbeddingProvider');
      return new StructuralEmbeddingProvider();
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
