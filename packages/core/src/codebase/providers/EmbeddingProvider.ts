/**
 * Embedding Provider Abstraction
 *
 * Decouples EmbeddingIndex from Ollama so any backend can be used:
 *   - BM25 (zero deps, always available, keyword-based)
 *   - Xenova/Transformers (WASM local semantics, optional dep)
 *   - OpenAI (API, optional dep)
 *   - Ollama (original behaviour, backward compat)
 */

// =============================================================================
// INTERFACE
// =============================================================================

/** Minimum contract every embedding backend must satisfy. */
export interface EmbeddingProvider {
  /** Stable identifier stored in serialized indexes. */
  readonly name: string;
  /**
   * Embed a batch of texts.
   * Returns one float array per input text.
   * All vectors in a single index must have the same dimension.
   */
  getEmbeddings(texts: string[]): Promise<number[][]>;
}

// =============================================================================
// FACTORY OPTIONS
// =============================================================================

export type EmbeddingProviderName = 'bm25' | 'xenova' | 'openai' | 'ollama';

export interface EmbeddingProviderOptions {
  /**
   * Which provider to use.
   * Defaults to 'bm25' (zero-dependency, always available).
   */
  provider?: EmbeddingProviderName;

  // ── Ollama ────────────────────────────────────────────────────────────────
  /** Ollama base URL (default: 'http://localhost:11434') */
  ollamaUrl?: string;
  /** Ollama embedding model (default: 'nomic-embed-text') */
  ollamaModel?: string;

  // ── OpenAI ───────────────────────────────────────────────────────────────
  /** OpenAI API key (falls back to OPENAI_API_KEY env var) */
  openaiApiKey?: string;
  /** OpenAI embedding model (default: 'text-embedding-3-small') */
  openaiModel?: string;

  // ── Xenova / @huggingface/transformers ───────────────────────────────────
  /** HuggingFace model id (default: 'Xenova/all-MiniLM-L6-v2') */
  xenovaModel?: string;
}

