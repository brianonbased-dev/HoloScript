/**
 * Embedding Providers
 *
 * Re-exports all provider implementations plus the shared interface and factory.
 * Import from here for the full API; import a specific provider file if you want
 * to avoid loading others.
 */

export type {
  EmbeddingProvider,
  EmbeddingProviderName,
  EmbeddingProviderOptions,
} from './EmbeddingProvider';
export { createEmbeddingProvider } from './EmbeddingProviderFactory';

export { XenovaEmbeddingProvider } from './XenovaEmbeddingProvider';
export { OllamaEmbeddingProvider } from './OllamaEmbeddingProvider';
export { OpenAIEmbeddingProvider } from './OpenAIEmbeddingProvider';
