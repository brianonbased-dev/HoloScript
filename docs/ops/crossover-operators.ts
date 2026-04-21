/**
 * crossover-operators.ts  (P.007.02)
 *
 * Crossover operators for the evolutionary / genetic-algorithm optimizer.
 *
 * Implements five recombination strategies:
 *   1. SinglePointCrossover
 *   2. TwoPointCrossover
 *   3. UniformCrossover  (with optional schema-bias via CrossGenerationLearner)
 *   4. ArithmeticCrossover  (blend-α)
 *   5. SimulatedBinaryCrossover  (SBX, etaC = 15)
 *
 * All operators implement the CrossoverOperator interface and are buildable
 * via the createCrossoverOperator factory.
 */

// ── Shared genome types ───────────────────────────────────────────────────────

/** A concrete genome: an array of real-valued genes. */
export type ConcreteGenome = number[];

/**
 * A building-block schema extracted by CrossGenerationLearner.
 * pattern[i] = null → gene i is free; pattern[i] = v → gene i is fixed to v.
 * Schemas are sorted descending by fitness before being passed to crossover.
 */
export interface Schema {
  readonly pattern: ReadonlyArray<number | null>;
  readonly fitness: number;
}

// ── CrossoverOperator interface ───────────────────────────────────────────────

export interface CrossoverOperator {
  readonly name: string;
  crossover(
    p1: ConcreteGenome,
    p2: ConcreteGenome,
    schemas?: Schema[],
  ): [ConcreteGenome, ConcreteGenome];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Uniform integer in [0, max). */
function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

// ── 1. SinglePointCrossover ───────────────────────────────────────────────────

/**
 * Classic one-cut-point recombination.
 *
 * Picks a random cut point k ∈ [0, L) then swaps the tails:
 *   c1 = p1[0..k) ++ p2[k..]
 *   c2 = p2[0..k) ++ p1[k..]
 */
export class SinglePointCrossover implements CrossoverOperator {
  readonly name = 'single-point';

  crossover(p1: ConcreteGenome, p2: ConcreteGenome): [ConcreteGenome, ConcreteGenome] {
    const len = p1.length;
    const pt = randInt(len);
    return [
      [...p1.slice(0, pt), ...p2.slice(pt)],
      [...p2.slice(0, pt), ...p1.slice(pt)],
    ];
  }
}

// ── 2. TwoPointCrossover ──────────────────────────────────────────────────────

/**
 * Two-cut-point recombination.
 *
 * Picks two random points pt1 ≤ pt2 and swaps the interior segment:
 *   c1 = p1[0..pt1) ++ p2[pt1..pt2) ++ p1[pt2..]
 *   c2 = p2[0..pt1) ++ p1[pt1..pt2) ++ p2[pt2..]
 */
export class TwoPointCrossover implements CrossoverOperator {
  readonly name = 'two-point';

  crossover(p1: ConcreteGenome, p2: ConcreteGenome): [ConcreteGenome, ConcreteGenome] {
    const len = p1.length;
    let pt1 = randInt(len);
    let pt2 = randInt(len);
    if (pt1 > pt2) [pt1, pt2] = [pt2, pt1];

    return [
      [...p1.slice(0, pt1), ...p2.slice(pt1, pt2), ...p1.slice(pt2)],
      [...p2.slice(0, pt1), ...p1.slice(pt1, pt2), ...p2.slice(pt2)],
    ];
  }
}

// ── 3. UniformCrossover ───────────────────────────────────────────────────────

/**
 * Gene-by-gene Bernoulli coin-flip with optional schema-bias.
 *
 * Without schemas: each gene is inherited from p1 or p2 with equal probability.
 *
 * With schemas (sorted desc by fitness): the dominant schema's fixed genes
 * are always preserved in c1, giving schema-biased exploration of the search
 * space as described in CrossGenerationLearner (P.008.03).
 */
export class UniformCrossover implements CrossoverOperator {
  readonly name = 'uniform';

  crossover(
    p1: ConcreteGenome,
    p2: ConcreteGenome,
    schemas: Schema[] = [],
  ): [ConcreteGenome, ConcreteGenome] {
    const len = p1.length;
    const c1: ConcreteGenome = new Array<number>(len);
    const c2: ConcreteGenome = new Array<number>(len);

    // Use the highest-fitness schema (if any) to bias c1 toward proven alleles.
    const dominant = schemas.length > 0 ? schemas[0] : null;

    for (let i = 0; i < len; i++) {
      const schemaGene = dominant?.pattern[i] ?? null;
      if (schemaGene !== null) {
        // Schema-fixed gene: lock it into c1, keep c2 exploratory.
        c1[i] = schemaGene;
        c2[i] = Math.random() < 0.5 ? p1[i] : p2[i];
      } else {
        // Free gene: standard uniform exchange.
        if (Math.random() < 0.5) {
          c1[i] = p1[i];
          c2[i] = p2[i];
        } else {
          c1[i] = p2[i];
          c2[i] = p1[i];
        }
      }
    }
    return [c1, c2];
  }
}

// ── 4. ArithmeticCrossover ────────────────────────────────────────────────────

/**
 * Blend-α arithmetic recombination.
 *
 * For each gene:
 *   c1[i] = α·p1[i] + (1−α)·p2[i]
 *   c2[i] = (1−α)·p1[i] + α·p2[i]
 *
 * When α = 0.5 the children are identical (midpoint).
 * Default: α is drawn uniformly from [0, 1] at construction time.
 */
export class ArithmeticCrossover implements CrossoverOperator {
  readonly name = 'arithmetic';
  private readonly alpha: number;

  /**
   * @param alpha Blend coefficient in [0, 1]. Default: random in [0, 1].
   */
  constructor(alpha?: number) {
    this.alpha = alpha !== undefined ? alpha : Math.random();
  }

  crossover(p1: ConcreteGenome, p2: ConcreteGenome): [ConcreteGenome, ConcreteGenome] {
    const a = this.alpha;
    const c1: ConcreteGenome = new Array<number>(p1.length);
    const c2: ConcreteGenome = new Array<number>(p1.length);
    for (let i = 0; i < p1.length; i++) {
      c1[i] = a * p1[i] + (1 - a) * p2[i];
      c2[i] = (1 - a) * p1[i] + a * p2[i];
    }
    return [c1, c2];
  }
}

// ── 5. SimulatedBinaryCrossover ───────────────────────────────────────────────

/**
 * Simulated Binary Crossover (SBX) — Deb & Agrawal (1995).
 *
 * Mimics the offspring distribution of single-point crossover on binary
 * strings in the real-coded domain. The spread factor β is sampled from a
 * polynomial distribution parameterised by the distribution index etaC:
 *   u ~ U[0, 1]
 *   β = (2u)^(1/(etaC+1))          if u ≤ 0.5
 *     = (1 / (2(1−u)))^(1/(etaC+1)) otherwise
 *
 * Higher etaC → children closer to parents (less exploration).
 * Recommended default: etaC = 15.
 */
export class SimulatedBinaryCrossover implements CrossoverOperator {
  readonly name = 'sbx';
  private readonly etaC: number;

  /**
   * @param etaC Distribution index. Default: 15.
   */
  constructor(etaC = 15) {
    this.etaC = etaC;
  }

  crossover(p1: ConcreteGenome, p2: ConcreteGenome): [ConcreteGenome, ConcreteGenome] {
    const c1: ConcreteGenome = new Array<number>(p1.length);
    const c2: ConcreteGenome = new Array<number>(p1.length);
    const exp = 1.0 / (this.etaC + 1.0);

    for (let i = 0; i < p1.length; i++) {
      if (Math.random() <= 0.5 && Math.abs(p1[i] - p2[i]) > 1e-14) {
        const u = Math.random();
        const beta =
          u <= 0.5
            ? Math.pow(2.0 * u, exp)
            : Math.pow(1.0 / (2.0 * (1.0 - u)), exp);
        const mid = 0.5 * (p1[i] + p2[i]);
        const half = 0.5 * beta * Math.abs(p1[i] - p2[i]);
        c1[i] = mid - half;
        c2[i] = mid + half;
      } else {
        c1[i] = p1[i];
        c2[i] = p2[i];
      }
    }
    return [c1, c2];
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export type CrossoverMethod =
  | 'single-point'
  | 'two-point'
  | 'uniform'
  | 'arithmetic'
  | 'sbx';

export interface CrossoverOptions {
  /** For ArithmeticCrossover: blend coefficient α ∈ [0, 1]. */
  alpha?: number;
  /** For SimulatedBinaryCrossover: distribution index (default 15). */
  etaC?: number;
}

/**
 * Build a CrossoverOperator by name.
 *
 * @example
 * const op = createCrossoverOperator('sbx', { etaC: 20 });
 * const [c1, c2] = op.crossover(parent1, parent2);
 */
export function createCrossoverOperator(
  method: CrossoverMethod,
  opts: CrossoverOptions = {},
): CrossoverOperator {
  switch (method) {
    case 'single-point':
      return new SinglePointCrossover();
    case 'two-point':
      return new TwoPointCrossover();
    case 'uniform':
      return new UniformCrossover();
    case 'arithmetic':
      return new ArithmeticCrossover(opts.alpha);
    case 'sbx':
      return new SimulatedBinaryCrossover(opts.etaC);
  }
}
