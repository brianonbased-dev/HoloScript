/**
 * Embedding Provider Abstraction
 *
 * Decouples EmbeddingIndex from any backend. Priority order:
 *   - structural (DEFAULT — HoloGraph native, zero-dep, zero-latency, no API key)
 *   - holoembed  (768-dim: structural + char-trigram subword, best NL recall, no API)
 *   - ollama     (local server, semantic NL search, requires OLLAMA_URL)
 *   - xenova     (WASM local semantics, optional dep)
 *   - openai     (API, best NL quality, requires OPENAI_API_KEY)
 *
 * See Paper 26 Table 1: structural achieves 100% recall for graph-topology
 * queries at 364-583× speedup over embedding-based approaches.
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

export type EmbeddingProviderName = 'xenova' | 'openai' | 'ollama' | 'structural' | 'holoembed';

export interface EmbeddingProviderOptions {
  /**
   * Which provider to use.
   * Defaults to 'structural' — HoloGraph native, zero-dependency, no API key.
   * Use 'openai' or 'ollama' for NL→code semantic search over large corpora.
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
