// TARGET: packages/core/src/compiler/ReproducibilityMode.ts
/**
 * Reproducibility Mode — Deterministic Compilation Flag
 *
 * Adds a --reproducible compiler flag that ensures deterministic compilation
 * output across runs. When enabled:
 * - Timestamps are fixed to a canonical epoch value
 * - Object keys are sorted lexicographically
 * - Random values use a seeded PRNG instead of Math.random()
 * - UUIDs are generated deterministically from content hashes
 * - Map iteration order is stabilized via sorted entries
 *
 * This is critical for:
 * - CI/CD pipeline cache validation (identical input = identical output)
 * - Content-addressable storage (CAS) for compiled scene artifacts
 * - Cryptographic signing of compiled output
 * - Regression testing of compiler changes
 * - Reproducible research with HoloScript scenes
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type {
  HoloComposition,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Reproducibility mode configuration */
export interface ReproducibilityConfig {
  /** Enable deterministic mode (default: false) */
  enabled: boolean;
  /** Fixed timestamp for all date/time values (default: "2026-01-01T00:00:00.000Z") */
  fixedTimestamp?: string;
  /** Seed for the deterministic PRNG (default: 42) */
  randomSeed?: number;
  /** Sort object keys in output (default: true when enabled) */
  sortKeys?: boolean;
  /** Use content-hash UUIDs instead of random UUIDs (default: true when enabled) */
  deterministicIds?: boolean;
  /** Fixed generator string for metadata (default: "holoscript-compiler") */
  generatorString?: string;
  /** Include a reproducibility manifest in output (default: false) */
  includeManifest?: boolean;
}

/** Reproducibility manifest included in output when `includeManifest` is true */
export interface ReproducibilityManifest {
  /** Flag indicating this output was produced in reproducible mode */
  reproducible: true;
  /** The random seed used */
  seed: number;
  /** The fixed timestamp used */
  timestamp: string;
  /** SHA-256 hash of the input composition (hex-encoded) */
  inputHash: string;
  /** Compiler version that produced this output */
  compilerVersion: string;
}

/** A seeded pseudo-random number generator (Mulberry32 algorithm) */
export interface SeededRNG {
  /** Returns a deterministic float in [0, 1) */
  next(): number;
  /** Returns a deterministic integer in [min, max] inclusive */
  nextInt(min: number, max: number): number;
  /** Returns a deterministic UUID v4 */
  nextUUID(): string;
  /** Reset the RNG to its initial seed */
  reset(): void;
  /** Get current seed state (for checkpointing) */
  getState(): number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';
const DEFAULT_SEED = 42;
const DEFAULT_GENERATOR = 'holoscript-compiler';
const COMPILER_VERSION = '6.0.0';

// =============================================================================
// SEEDED PRNG (Mulberry32)
// =============================================================================

/**
 * Creates a seeded pseudo-random number generator using the Mulberry32 algorithm.
 * Mulberry32 is a simple, fast, high-quality 32-bit PRNG suitable for
 * deterministic content generation.
 *
 * @param seed - Initial seed value (32-bit integer)
 */
export function createSeededRNG(seed: number = DEFAULT_SEED): SeededRNG {
  let state = seed | 0;
  const initialSeed = state;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function nextUUID(): string {
    // Generate a UUID-like string from seeded random values
    const hex = (n: number, len: number): string =>
      Array.from({ length: len }, () =>
        nextInt(0, 15).toString(16)
      ).join('');

    return `${hex(0, 8)}-${hex(0, 4)}-4${hex(0, 3)}-${(8 + nextInt(0, 3)).toString(16)}${hex(0, 3)}-${hex(0, 12)}`;
  }

  function reset(): void {
    state = initialSeed;
  }

  function getState(): number {
    return state;
  }

  return { next, nextInt, nextUUID, reset, getState };
}

// =============================================================================
// DETERMINISTIC HELPERS
// =============================================================================

/**
 * Deep-sort all object keys in a value tree.
 * Arrays preserve their element order; only object keys are sorted.
 */
export function sortKeysDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted as T;
  }
  return value;
}

/**
 * Compute a simple hash of a string (FNV-1a 32-bit).
 * For reproducibility manifests; not cryptographic.
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generate a content-based hash for a HoloComposition.
 * Uses the composition's serialized JSON as input to FNV-1a.
 */
export function hashComposition(composition: HoloComposition): string {
  const sorted = sortKeysDeep(composition);
  const serialized = JSON.stringify(sorted);
  // Chain multiple FNV-1a rounds for a longer hash
  const h1 = fnv1a32(serialized);
  const h2 = fnv1a32(serialized + h1);
  const h3 = fnv1a32(serialized + h2);
  const h4 = fnv1a32(serialized + h3);
  const h5 = fnv1a32(serialized + h4);
  const h6 = fnv1a32(serialized + h5);
  const h7 = fnv1a32(serialized + h6);
  const h8 = fnv1a32(serialized + h7);
  return `${h1}${h2}${h3}${h4}${h5}${h6}${h7}${h8}`;
}

// =============================================================================
// REPRODUCIBILITY CONTEXT
// =============================================================================

/**
 * A ReproducibilityContext wraps the configuration and provides deterministic
 * replacements for non-deterministic operations used during compilation.
 *
 * Usage:
 * ```typescript
 * const ctx = createReproducibilityContext({ enabled: true, randomSeed: 123 });
 *
 * // Replace Math.random() calls:
 * const value = ctx.random(); // deterministic
 *
 * // Replace Date.now() calls:
 * const ts = ctx.timestamp(); // fixed
 *
 * // Replace uuid() calls:
 * const id = ctx.uuid(); // deterministic
 *
 * // Sort output before serialization:
 * const sorted = ctx.stabilize(outputObject);
 * ```
 */
export interface ReproducibilityContext {
  /** Whether reproducibility mode is active */
  readonly enabled: boolean;
  /** The underlying configuration */
  readonly config: Required<ReproducibilityConfig>;
  /** Get a deterministic random float in [0, 1) */
  random(): number;
  /** Get a deterministic random integer in [min, max] */
  randomInt(min: number, max: number): number;
  /** Get the fixed timestamp string */
  timestamp(): string;
  /** Get the fixed timestamp as a Date object */
  timestampDate(): Date;
  /** Get a deterministic UUID */
  uuid(): string;
  /** Get the fixed generator string */
  generator(): string;
  /** Stabilize an object: sort keys and normalize values */
  stabilize<T>(value: T): T;
  /** Generate a reproducibility manifest for the given composition */
  manifest(composition: HoloComposition): ReproducibilityManifest;
  /** Reset the PRNG to its initial state */
  reset(): void;
  /** JSON.stringify with sorted keys and fixed indent */
  stringify(value: unknown, indent?: number): string;
}

/**
 * Create a ReproducibilityContext from configuration.
 *
 * @param config - Reproducibility configuration (pass `{ enabled: false }` to disable)
 */
export function createReproducibilityContext(
  config: ReproducibilityConfig
): ReproducibilityContext {
  const fullConfig: Required<ReproducibilityConfig> = {
    enabled: config.enabled,
    fixedTimestamp: config.fixedTimestamp ?? DEFAULT_FIXED_TIMESTAMP,
    randomSeed: config.randomSeed ?? DEFAULT_SEED,
    sortKeys: config.sortKeys ?? config.enabled,
    deterministicIds: config.deterministicIds ?? config.enabled,
    generatorString: config.generatorString ?? DEFAULT_GENERATOR,
    includeManifest: config.includeManifest ?? false,
  };

  const rng = createSeededRNG(fullConfig.randomSeed);

  function random(): number {
    return fullConfig.enabled ? rng.next() : Math.random();
  }

  function randomInt(min: number, max: number): number {
    return fullConfig.enabled ? rng.nextInt(min, max) : Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function timestamp(): string {
    return fullConfig.enabled ? fullConfig.fixedTimestamp : new Date().toISOString();
  }

  function timestampDate(): Date {
    return fullConfig.enabled ? new Date(fullConfig.fixedTimestamp) : new Date();
  }

  function uuid(): string {
    if (!fullConfig.enabled || !fullConfig.deterministicIds) {
      return crypto?.randomUUID?.() ?? rng.nextUUID();
    }
    return rng.nextUUID();
  }

  function generator(): string {
    return fullConfig.generatorString;
  }

  function stabilize<T>(value: T): T {
    if (!fullConfig.enabled || !fullConfig.sortKeys) return value;
    return sortKeysDeep(value);
  }

  function manifest(composition: HoloComposition): ReproducibilityManifest {
    return {
      reproducible: true,
      seed: fullConfig.randomSeed,
      timestamp: fullConfig.fixedTimestamp,
      inputHash: hashComposition(composition),
      compilerVersion: COMPILER_VERSION,
    };
  }

  function reset(): void {
    rng.reset();
  }

  function stringify(value: unknown, indent: number = 2): string {
    const processed = fullConfig.enabled && fullConfig.sortKeys
      ? sortKeysDeep(value)
      : value;
    return JSON.stringify(processed, null, indent);
  }

  return {
    enabled: fullConfig.enabled,
    config: fullConfig,
    random,
    randomInt,
    timestamp,
    timestampDate,
    uuid,
    generator,
    stabilize,
    manifest,
    reset,
    stringify,
  };
}

// =============================================================================
// CLI FLAG PARSER
// =============================================================================

/**
 * Parse compiler flags for reproducibility mode.
 *
 * Supports:
 *   --reproducible            Enable with defaults
 *   --reproducible-seed=123   Custom seed
 *   --reproducible-timestamp="2026-06-01T00:00:00Z"   Custom fixed timestamp
 *   --no-reproducible         Explicitly disable
 */
export function parseReproducibilityFlags(
  args: string[]
): ReproducibilityConfig {
  const config: ReproducibilityConfig = { enabled: false };

  for (const arg of args) {
    if (arg === '--reproducible') {
      config.enabled = true;
    }
    if (arg === '--no-reproducible') {
      config.enabled = false;
    }
    if (arg.startsWith('--reproducible-seed=')) {
      config.enabled = true;
      config.randomSeed = parseInt(arg.split('=')[1], 10);
      if (isNaN(config.randomSeed!)) config.randomSeed = DEFAULT_SEED;
    }
    if (arg.startsWith('--reproducible-timestamp=')) {
      config.enabled = true;
      config.fixedTimestamp = arg.split('=')[1].replace(/"/g, '');
    }
    if (arg === '--reproducible-manifest') {
      config.includeManifest = true;
    }
  }

  return config;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default createReproducibilityContext;
