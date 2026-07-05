/**
 * Embedding Provider Abstraction
 *
 * Decouples EmbeddingIndex from any backend.
 *
 * Keyless HoloScript-native providers are the only defaults (F.106):
 *   - structural (DEFAULT — HoloGraph native, zero-dep, zero-latency, no API key)
 *   - holoembed  (768-dim: structural + char-trigram subword, best NL recall, no API)
 *
 * External providers are EXPLICIT OPT-IN ONLY — selected solely by passing
 * `{ provider: '<name>' }` to the factory, never auto-selected from the presence
 * of an API key in the environment:
 *   - ollama     (local server, semantic NL search, requires OLLAMA_URL)
 *   - xenova     (WASM local semantics, optional dep)
 *   - openai     (API; opt-in only, requires OPENAI_API_KEY) — never an auto-default
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

export type EmbeddingProviderName =
  | 'xenova'
  | 'openai'
  | 'ollama'
  | 'structural'
  | 'holoembed'
  | 'holodistill-m1a-student';

export type HoloDistillEncoder = (payload: {
  studentPath: string;
  baseModel: string;
  maxLength: number;
  outDim: number;
  texts: string[];
}) => Promise<{ embeddings: unknown }>;

export interface EmbeddingProviderOptions {
  /**
   * Which provider to use.
   * Defaults to 'structural' — HoloGraph native, zero-dependency, no API key.
   * Use 'holoembed' for keyless NL→code semantic search. 'openai'/'ollama'/'xenova'
   * are explicit opt-in only and are never auto-selected from env credentials (F.106).
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

  // HoloDistill M1a student query tower
  /** student.safetensors path emitted by the HoloDistill M1a recipe */
  holodistillStudentPath?: string;
  /** Base sentence-transformers model used by the student backbone */
  holodistillBaseModel?: string;
  /** Python executable used to run the safetensors bridge (default: python) */
  holodistillPythonCommand?: string;
  /** Token cap used by the HoloTune recipe (default: 128) */
  holodistillMaxLength?: number;
  /** Expected output dimension (default: 768) */
  holodistillOutDim?: number;
  /** Encoder timeout in milliseconds (default: 120000) */
  holodistillTimeoutMs?: number;
  /** Test hook for lightweight fixtures; production uses the built-in Python bridge */
  holodistillEncoderScript?: string;
  /** Test hook for lightweight in-process fixtures */
  holodistillEncoder?: HoloDistillEncoder;
}
