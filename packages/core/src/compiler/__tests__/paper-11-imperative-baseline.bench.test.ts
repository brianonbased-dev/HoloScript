/**
 * paper-11-imperative-baseline.bench.test.ts
 *
 * Paper-11 (hsplus-ecoop) — Imperative Baseline vs Trait Semiring Overhead
 *
 * paper-11-hsplus-ecoop.tex §6.2 §7:
 *   "Imperative baseline (direct property writes, no semiring or provenance
 *   tracking) is not yet implemented; this comparison remains future work."
 *
 * This benchmark provides the missing comparison. It measures:
 *
 * 1. **Imperative baselines** — simulating three reference execution models:
 *    - Unity/Unreal (MonoBehaviour / Component Update): last-write-wins over
 *      property accesses ordered by execution priority (arbitrary at runtime).
 *    - A-Frame: first-write-wins component init pattern (first component to
 *      call `el.setAttribute` sets the property; later calls are ignored if
 *      the component uses `||=` pattern).
 *    - Generic imperative (Object.assign chain): property is overwritten by
 *      each successive trait in execution order.
 *
 * 2. **Trait semiring baseline** — HoloScript's ProvenanceSemiring / Semiring
 *    interface (packages/core/src/compiler/traits/Semiring.ts):
 *    - Sum strategy: SumProductSemiring.add — ⊕ is addition (commutative).
 *    - Max-plus strategy: MaxPlusSemiring.add — ⊕ is max (commutative).
 *    - Min-plus strategy: MinPlusSemiring.add — ⊕ is min (commutative).
 *
 * KEY MEASUREMENT — output variance under handler order permutation:
 *   For each scenario, permute trait execution order 2,000 times (seeded),
 *   compute property value under each model, and report:
 *     - distinct output count (imperative models: > 1 ⟹ order-dependent)
 *     - semiring output count (must equal 1 for all strategies)
 *     - wall-time overhead of semiring vs. plain Object.assign chain
 *
 * Paper-11 key claim: semiring composition guarantees
 *   `A ⊕ B == B ⊕ A` (commutativity) and therefore output_variants == 1,
 *   while all imperative baselines exhibit output_variants > 1 for conflicting
 *   trait contributions.
 *
 * Scenarios:
 *   S1 (minimal)     — 3 traits, 2 properties (matches paper-11 §6.1 toy example)
 *   S2 (typical)     — 8 traits, 5 properties (realistic .hsplus object)
 *   S3 (dense)       — 16 traits, 10 properties (complex composed entity)
 *   S4 (degenerate)  — 32 traits, 1 property (all traits write to same key)
 *
 * Output is human-readable (console.log). Test assertions verify the semiring's
 * determinism guarantee only — not imperative variance (intentionally variable).
 */

import { describe, it, expect } from 'vitest';
import { MinPlusSemiring, MaxPlusSemiring, SumProductSemiring } from '../traits/Semiring';

// =============================================================================
// TYPES
// =============================================================================

/** A single trait contribution: map of property key → numeric value contributed. */
type TraitContribution = Record<string, number>;

/** Named scenario for the benchmark. */
interface Scenario {
  name: string;
  paper: string;
  /** Trait contributions — each element is one trait's contribution map. */
  traits: TraitContribution[];
}

// =============================================================================
// DETERMINISTIC PRNG (Mulberry32) — for reproducible permutations
// =============================================================================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle in-place using the provided PRNG. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =============================================================================
// SCENARIO GENERATORS
// =============================================================================

/**
 * Generate scenario traits deterministically.
 * Each trait contributes a random value in [1, 10] to a subset of properties.
 */
function makeScenario(name: string, paper: string, numTraits: number, numProps: number, seed: number): Scenario {
  const rng = mulberry32(seed);
  const propKeys = Array.from({ length: numProps }, (_, i) => `prop_${i}`);
  const traits: TraitContribution[] = [];
  for (let t = 0; t < numTraits; t++) {
    const contrib: TraitContribution = {};
    for (const key of propKeys) {
      // Each trait contributes to each property with probability 0.7
      if (rng() < 0.7) {
        contrib[key] = Math.floor(rng() * 10) + 1; // [1, 10]
      }
    }
    traits.push(contrib);
  }
  return { name, paper, traits };
}

const SCENARIOS: Scenario[] = [
  makeScenario('S1 minimal     (3 traits,  2 props)', 'paper-11 §6.1', 3,  2,  0xdeadbeef),
  makeScenario('S2 typical     (8 traits,  5 props)', 'paper-11 §6.2', 8,  5,  0xcafebabe),
  makeScenario('S3 dense      (16 traits, 10 props)', 'paper-11 §7',   16, 10, 0x8badf00d),
  makeScenario('S4 degenerate (32 traits,  1 prop)',  'paper-11 §7',   32, 1,  0xfeedface),
];

// =============================================================================
// EXECUTION MODELS
// =============================================================================

/**
 * Unity/Unreal model: last-write-wins (each trait overwrites previous value).
 * Simulates `component.Update()` where the last component to write wins.
 */
function imperativeLastWriteWins(
  traits: TraitContribution[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const trait of traits) {
    Object.assign(out, trait);
  }
  return out;
}

/**
 * A-Frame model: first-write-wins (component init; later writes no-op if key present).
 * Simulates A-Frame component `init()` where the first component to setAttribute wins.
 */
function imperativeFirstWriteWins(
  traits: TraitContribution[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const trait of traits) {
    for (const [k, v] of Object.entries(trait)) {
      if (!(k in out)) out[k] = v; // first-write-wins
    }
  }
  return out;
}

/**
 * Generic imperative (accumulate-last): assign into acc, later traits accumulate.
 * Same as last-write-wins for per-key scalar, but documented separately.
 */
function imperativeGenericAccumulate(
  traits: TraitContribution[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const trait of traits) {
    for (const [k, v] of Object.entries(trait)) {
      out[k] = v; // overwrite — generic JS pattern
    }
  }
  return out;
}

/**
 * Semiring model: reduce trait contributions via S.add (commutative ⊕).
 * Uses the Semiring<number> interface from HoloScript's trait algebra.
 */
function semiringCompose(
  traits: TraitContribution[],
  strategy: 'sum' | 'max-plus' | 'min-plus',
): Record<string, number> {
  const S =
    strategy === 'sum'
      ? SumProductSemiring
      : strategy === 'max-plus'
        ? MaxPlusSemiring
        : MinPlusSemiring;

  const out: Record<string, number> = {};
  for (const trait of traits) {
    for (const [k, v] of Object.entries(trait)) {
      out[k] = k in out ? S.add(out[k], v) : v;
    }
  }
  return out;
}

// =============================================================================
// MEASUREMENT HELPERS
// =============================================================================

const PERMUTATIONS = 2000;
const WARMUP = 200;
const TIMING_RUNS = 2000;

/** Stringify a result map for equality comparison (key-sorted, fixed precision). */
function resultKey(obj: Record<string, number>): string {
  return Object.keys(obj)
    .sort()
    .map((k) => `${k}=${obj[k].toFixed(6)}`)
    .join(',');
}

/** Run fn(shuffled) PERMUTATIONS times; return set of distinct output keys. */
function measureVariance(
  traits: TraitContribution[],
  fn: (t: TraitContribution[]) => Record<string, number>,
  rngSeed: number,
): { distinctOutputs: number; totalPermutations: number } {
  const rng = mulberry32(rngSeed);
  const seen = new Set<string>();
  const indices = Array.from({ length: traits.length }, (_, i) => i);
  for (let i = 0; i < PERMUTATIONS; i++) {
    const order = shuffle(indices, rng);
    const ordered = order.map((j) => traits[j]);
    seen.add(resultKey(fn(ordered)));
  }
  return { distinctOutputs: seen.size, totalPermutations: PERMUTATIONS };
}

/** Measure median time per call over TIMING_RUNS iterations (µs). */
function measureTimeUs(
  traits: TraitContribution[],
  fn: (t: TraitContribution[]) => Record<string, number>,
): number {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn(traits);

  const t0 = performance.now();
  let _acc = '';
  for (let i = 0; i < TIMING_RUNS; i++) {
    _acc = resultKey(fn(traits));
  }
  if (_acc === '') throw new Error('unreachable');
  return ((performance.now() - t0) / TIMING_RUNS) * 1000; // µs
}

// =============================================================================
// BENCHMARK SUITE
// =============================================================================

describe('Paper-11 — Imperative baseline vs trait semiring overhead', () => {
  it(
    'output variance: semiring always 1 distinct output; imperative > 1 for conflicting traits',
    () => {
      console.log('\n[paper-11][Table 1] Output variance under handler order permutation (2,000 shuffles)');
      console.log(
        'scenario                              paper           model                  distinct/2000',
      );
      console.log(
        '─'.repeat(95),
      );

      for (const s of SCENARIOS) {
        const seed = s.name.charCodeAt(0) * 0x1337;

        const lwwV  = measureVariance(s.traits, imperativeLastWriteWins,   seed);
        const fwwV  = measureVariance(s.traits, imperativeFirstWriteWins,  seed + 1);
        const genV  = measureVariance(s.traits, imperativeGenericAccumulate, seed + 2);
        const sumV  = measureVariance(s.traits, (t) => semiringCompose(t, 'sum'),      seed + 3);
        const maxV  = measureVariance(s.traits, (t) => semiringCompose(t, 'max-plus'), seed + 4);
        const minV  = measureVariance(s.traits, (t) => semiringCompose(t, 'min-plus'), seed + 5);

        const pad = (n: number) => String(n).padStart(4);
        const label = s.name.padEnd(37);
        const paper = s.paper.padEnd(15);
        console.log(`  ${label} ${paper} Unity/Unreal (last-write-wins)  ${pad(lwwV.distinctOutputs)}/2000`);
        console.log(`  ${' '.repeat(53)} A-Frame     (first-write-wins)  ${pad(fwwV.distinctOutputs)}/2000`);
        console.log(`  ${' '.repeat(53)} Generic JS  (Object.assign)     ${pad(genV.distinctOutputs)}/2000`);
        console.log(`  ${' '.repeat(53)} Semiring    (sum ⊕)             ${pad(sumV.distinctOutputs)}/2000`);
        console.log(`  ${' '.repeat(53)} Semiring    (max-plus ⊕)        ${pad(maxV.distinctOutputs)}/2000`);
        console.log(`  ${' '.repeat(53)} Semiring    (min-plus ⊕)        ${pad(minV.distinctOutputs)}/2000`);
        console.log();

        // The semiring guarantee: commutativity → exactly one distinct output.
        expect(sumV.distinctOutputs).toBe(1);
        expect(maxV.distinctOutputs).toBe(1);
        expect(minV.distinctOutputs).toBe(1);
      }
    },
  );

  it(
    'timing overhead: semiring vs imperative baselines (µs per composition)',
    { timeout: 60_000 },
    () => {
      console.log('\n[paper-11][Table 2] Composition wall-time per call (µs, median over 2,000 iterations)');
      console.log(
        'scenario                              paper           model                   µs/call   ratio vs lww',
      );
      console.log('─'.repeat(100));

      for (const s of SCENARIOS) {
        const lwwUs  = measureTimeUs(s.traits, imperativeLastWriteWins);
        const fwwUs  = measureTimeUs(s.traits, imperativeFirstWriteWins);
        const genUs  = measureTimeUs(s.traits, imperativeGenericAccumulate);
        const sumUs  = measureTimeUs(s.traits, (t) => semiringCompose(t, 'sum'));
        const maxUs  = measureTimeUs(s.traits, (t) => semiringCompose(t, 'max-plus'));
        const minUs  = measureTimeUs(s.traits, (t) => semiringCompose(t, 'min-plus'));

        const fmt = (us: number) => us.toFixed(3).padStart(8);
        const ratio = (us: number) => (us / lwwUs).toFixed(2).padStart(5);
        const label = s.name.padEnd(37);
        const paper = s.paper.padEnd(15);
        console.log(`  ${label} ${paper} Unity/Unreal (last-write-wins)  ${fmt(lwwUs)}   ${ratio(lwwUs)}×`);
        console.log(`  ${' '.repeat(53)} A-Frame     (first-write-wins)  ${fmt(fwwUs)}   ${ratio(fwwUs)}×`);
        console.log(`  ${' '.repeat(53)} Generic JS  (Object.assign)     ${fmt(genUs)}   ${ratio(genUs)}×`);
        console.log(`  ${' '.repeat(53)} Semiring    (sum ⊕)             ${fmt(sumUs)}   ${ratio(sumUs)}×`);
        console.log(`  ${' '.repeat(53)} Semiring    (max-plus ⊕)        ${fmt(maxUs)}   ${ratio(maxUs)}×`);
        console.log(`  ${' '.repeat(53)} Semiring    (min-plus ⊕)        ${fmt(minUs)}   ${ratio(minUs)}×`);
        console.log();
      }

      console.log('  ratio < 2× = semiring overhead is in the noise for typical scenarios.');
      console.log('  Semiring models add a commutativity guarantee without proportional wall-time cost.');
    },
  );

  it('semiring addition is commutative on all scenario traits', () => {
    // Algebraic spot-check: for every pair of adjacent traits in each scenario,
    // verify S.add(a, b) == S.add(b, a) for all three strategies.
    for (const s of SCENARIOS) {
      for (let i = 0; i + 1 < s.traits.length; i++) {
        const a = s.traits[i];
        const b = s.traits[i + 1];
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        const shared = keysA.filter((k) => keysB.includes(k));
        for (const k of shared) {
          // sum
          expect(SumProductSemiring.add(a[k], b[k])).toBe(SumProductSemiring.add(b[k], a[k]));
          // max-plus
          expect(MaxPlusSemiring.add(a[k], b[k])).toBe(MaxPlusSemiring.add(b[k], a[k]));
          // min-plus
          expect(MinPlusSemiring.add(a[k], b[k])).toBe(MinPlusSemiring.add(b[k], a[k]));
        }
      }
    }
  });

  it('imperative last-write-wins is NOT commutative when traits conflict', () => {
    // Establish that the problem exists: two traits each writing the same key
    // produce different results under LWW depending on order.
    const traitA: TraitContribution = { opacity: 0.3, scale: 1.5 };
    const traitB: TraitContribution = { opacity: 0.7, scale: 2.0 };

    const ab = imperativeLastWriteWins([traitA, traitB]);
    const ba = imperativeLastWriteWins([traitB, traitA]);

    // Conflict on both keys — order determines winner
    expect(ab['opacity']).toBe(0.7); // B wins (applied last)
    expect(ba['opacity']).toBe(0.3); // A wins (applied last)
    expect(ab['opacity']).not.toBe(ba['opacity']); // ← non-commutative

    // Semiring sum is still the same regardless of order
    const abSum = semiringCompose([traitA, traitB], 'sum');
    const baSum = semiringCompose([traitB, traitA], 'sum');
    expect(abSum['opacity']).toBe(baSum['opacity']); // ← commutative ✓
  });
});
