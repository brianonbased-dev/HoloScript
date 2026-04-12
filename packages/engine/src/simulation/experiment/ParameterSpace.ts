/**
 * ParameterSpace — Generate config variants for parameter sweeps.
 *
 * Supports:
 *   - Grid search (full factorial): every combination of parameter values
 *   - Latin Hypercube Sampling (LHS): space-filling random sampling
 *
 * Each sample is a set of overrides that can be deep-merged into a base config.
 *
 * @see ExperimentOrchestrator — consumes the samples this module produces
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParameterRange {
  /** Dot-path into the config object (e.g., "material.youngs_modulus") */
  path: string;
  /** Explicit values to sweep (takes priority over min/max/steps) */
  values?: number[];
  /** Range mode: min value */
  min?: number;
  /** Range mode: max value */
  max?: number;
  /** Range mode: number of evenly-spaced steps (inclusive of endpoints) */
  steps?: number;
}

export interface ParameterSample {
  /** Index in the sweep */
  index: number;
  /** Parameter overrides: path → value */
  overrides: Map<string, number>;
}

// ── ParameterSpace ───────────────────────────────────────────────────────────

export class ParameterSpace {
  private ranges: ParameterRange[];
  private resolvedValues: number[][];

  constructor(ranges: ParameterRange[]) {
    this.ranges = ranges;
    this.resolvedValues = ranges.map(resolveRange);
  }

  /** Total number of grid-search samples (product of all range sizes). */
  get gridSize(): number {
    return this.resolvedValues.reduce((acc, v) => acc * v.length, 1);
  }

  /** Number of parameters being swept. */
  get dimensions(): number {
    return this.ranges.length;
  }

  /**
   * Full factorial grid search.
   * Returns every combination of parameter values.
   */
  gridSearch(): ParameterSample[] {
    const samples: ParameterSample[] = [];
    const dims = this.resolvedValues;
    const ndims = dims.length;
    const total = this.gridSize;

    for (let i = 0; i < total; i++) {
      const overrides = new Map<string, number>();
      let remainder = i;

      for (let d = ndims - 1; d >= 0; d--) {
        const dimSize = dims[d].length;
        const idx = remainder % dimSize;
        remainder = Math.floor(remainder / dimSize);
        overrides.set(this.ranges[d].path, dims[d][idx]);
      }

      samples.push({ index: i, overrides });
    }

    return samples;
  }

  /**
   * Latin Hypercube Sampling.
   * Generates n space-filling samples across the parameter space.
   * Each parameter range is divided into n equal strata; each stratum
   * is sampled exactly once, with random permutation across dimensions.
   */
  latinHypercube(n: number, seed = 42): ParameterSample[] {
    const rng = seededRandom(seed);
    const samples: ParameterSample[] = [];

    // For each dimension, create a random permutation of n strata
    const permutations: number[][] = this.ranges.map(() => {
      const perm = Array.from({ length: n }, (_, i) => i);
      // Fisher-Yates shuffle
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      return perm;
    });

    for (let i = 0; i < n; i++) {
      const overrides = new Map<string, number>();

      for (let d = 0; d < this.ranges.length; d++) {
        const range = this.ranges[d];
        const stratum = permutations[d][i];

        if (range.values) {
          // Discrete values: pick from the stratum
          const idx = Math.floor((stratum / n) * range.values.length);
          overrides.set(range.path, range.values[Math.min(idx, range.values.length - 1)]);
        } else {
          // Continuous range: uniform random within stratum
          const min = range.min ?? 0;
          const max = range.max ?? 1;
          const stratumLow = min + (stratum / n) * (max - min);
          const stratumHigh = min + ((stratum + 1) / n) * (max - min);
          const value = stratumLow + rng() * (stratumHigh - stratumLow);
          overrides.set(range.path, value);
        }
      }

      samples.push({ index: i, overrides });
    }

    return samples;
  }
}

// ── Config Application ───────────────────────────────────────────────────────

/**
 * Deep-merge parameter overrides into a base config.
 * Supports dot-path notation: "material.youngs_modulus" → config.material.youngs_modulus
 */
export function applyOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: Map<string, number>,
): T {
  // Deep clone
  const result = JSON.parse(JSON.stringify(base)) as T;

  for (const [path, value] of overrides) {
    const parts = path.split('.');
    let target: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof target[parts[i]] !== 'object' || target[parts[i]] === null) {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as Record<string, unknown>;
    }

    target[parts[parts.length - 1]] = value;
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveRange(range: ParameterRange): number[] {
  if (range.values) return range.values;

  const min = range.min ?? 0;
  const max = range.max ?? 1;
  const steps = range.steps ?? 5;

  if (steps < 2) return [min];

  const values: number[] = [];
  for (let i = 0; i < steps; i++) {
    values.push(min + (i / (steps - 1)) * (max - min));
  }
  return values;
}

/** Simple seeded PRNG (mulberry32). */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
