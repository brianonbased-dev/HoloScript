/**
 * HoloEmbed — shared types
 */

// =============================================================================
// SYMBOL INPUT
// =============================================================================

/**
 * Minimal symbol descriptor needed for encoding.
 * Intentionally independent of `@holoscript/absorb-service` types so this
 * package can be used without absorb-service as a dependency.
 */
export interface SymbolInput {
  /** Symbol identifier (camelCase, PascalCase, snake_case). */
  name: string;
  /** Symbol kind: function | method | class | interface | type_alias | enum | constant | field */
  type: string;
  /** Absolute or root-relative file path. */
  filePath: string;
  /** 1-based line number. */
  line: number;
  /** 0-based column. */
  column?: number;
  /** Signature string, e.g. "function foo(x: string): void" */
  signature?: string;
  /** JSDoc / block-comment extracted from source. */
  docComment?: string;
  /** Whether the symbol is exported. */
  isExported?: boolean;
  /** Visibility: 'public' | 'protected' | 'private' | 'internal' */
  visibility?: string;
  /** Owner class/interface name (for methods/fields). */
  owner?: string;
  /** Lines of code. */
  lineCount?: number;
}

// =============================================================================
// GRAPH ENRICHMENT
// =============================================================================

/**
 * Optional graph-topology features passed alongside a SymbolInput.
 * When provided, these fill the structural call-graph and event-chain dims.
 */
export interface GraphEnrichment {
  /** Number of callers of this symbol. */
  fanIn?: number;
  /** Number of callees from this symbol. */
  fanOut?: number;
  /** Number of event emissions. */
  emitCount?: number;
  /** Number of event subscriptions. */
  listenCount?: number;
  /** Names of events emitted or listened to. */
  eventNames?: string[];
}

// =============================================================================
// ENCODER OPTIONS
// =============================================================================

export interface EncoderOptions {
  /**
   * Whether to attempt SNN-WebGPU acceleration.
   * Defaults to true; gracefully falls back to CPU if WebGPU is unavailable.
   */
  enableSnn?: boolean;
  /**
   * Number of LIF timesteps for SNN population coding.
   * Higher values → richer spike-rate patterns, slower GPU batch.
   * Default: 50 (50ms simulated at dt=1ms).
   */
  snnTimesteps?: number;
}

// =============================================================================
// OUTPUT
// =============================================================================

/** Dimensionality of the HoloEmbed output vector. */
export const HOLOEMBED_DIM = 768;

/** Dimensionality of the structural base (dims 0-383). */
export const STRUCTURAL_DIM = 384;

/** Number of bins per char-trigram subword block (dims 384-511, 512-639, 640-767). */
export const SUBWORD_BINS = 128;

/** Number of subword blocks. */
export const SUBWORD_BLOCKS = 3;
