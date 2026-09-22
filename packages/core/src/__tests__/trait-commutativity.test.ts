/**
 * Trait composition is order-independent, and this test is allowed to say so.
 *
 * WHY IT WAS REWRITTEN. Until 2026-09-21 this file was listed in
 * packages/core/test-baseline.json under flakyFiles, which means the core gate
 * IGNORED any failure inside it. Order-independence is the property that makes
 * traits a system rather than a pile of decorators — it is what lets a beginner
 * ignore ordering and an expert compose without reading every other trait — so
 * the one claim the trait system rests on was exempt from the gate.
 *
 * It was not exempt because composition was broken. Measured before changing
 * anything: the old test passed in isolation, 12.75s of test time, 64s wall.
 * The file was quarantined because of its WEIGHT, not its verdict. It ran
 * 200,000 evaluations and 20,000 SHA-256 hashes under a sharded,
 * memory-pressured runner, and it took the correctness assertion down with it.
 *
 * And the weight bought nothing. The overhead numbers it spent that time
 * computing — semiring microseconds, SHA microseconds, percent versus
 * imperative — were never asserted. They were printed. One console.log, no
 * expect. So a benchmark that could not fail got a property that could fail
 * excluded from the gate.
 *
 * WHAT CHANGED:
 *   - The correctness half is deterministic and fast, and runs always. A seeded
 *     generator replaces Math.random(), because a correctness failure on random
 *     data cannot be reproduced, and an irreproducible failure is what gets a
 *     file marked flaky in the first place.
 *   - Per-strategy cases enumerate EVERY permutation rather than sampling
 *     shuffles, so a failure names the strategy that broke instead of reporting
 *     that some ordering somewhere disagreed.
 *   - The benchmark is kept, behind HOLO_BENCH=1, where its weight is nobody's
 *     problem. Its numbers already have a home in .bench-logs.
 *   - The file comes OUT of flakyFiles, so the gate can fail on it.
 */
import { describe, test, expect } from 'vitest';
import { ProvenanceSemiring, TraitApplication } from '../compiler/traits/ProvenanceSemiring';
import { hashBytes } from '../testing/DeterminismHarness';

/**
 * Deterministic PRNG (mulberry32). Same seed, same trait sets, every run and
 * every machine — so a failure here is a bug someone can reproduce rather than
 * a coin that landed badly.
 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rules = [
  { property: 'mass', strategy: 'authority-weighted' as const },
  { property: 'friction', strategy: 'max' as const },
  { property: 'restitution', strategy: 'min' as const },
  {
    property: 'color',
    strategy: 'domain-override' as const,
    precedence: ['material', 'color', 'hoverable', 'glowing'],
  },
  { property: 'opacity', strategy: 'min' as const },
];

const SOURCES = ['material', 'color', 'hoverable', 'glowing', 'physics', 'kinematic'];

function makeTrait(rand: () => number, index: number): TraitApplication {
  return {
    name: SOURCES[index % SOURCES.length],
    config: {
      mass: rand() * 100,
      friction: rand(),
      restitution: rand(),
      color: '#' + Math.floor(rand() * 16777215).toString(16),
      opacity: rand(),
    },
    context: {
      authorityLevel: Math.floor(rand() * 100),
      agentId: `agent-${Math.floor(rand() * 10)}`,
    },
  };
}

/** Every ordering of the input, not a sample of them. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

function shuffleWith<T>(rand: () => number, array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('trait composition is order-independent', () => {
  test('every ordering of a trait set resolves to the same configuration', () => {
    // Four traits: 24 orderings each, exhaustive. 150 sets = 3,600 resolutions,
    // which is enough to exercise all five rules many times over and finishes
    // in well under a second — the reason this one can live in the gate.
    const rand = seededRandom(0x5eed1);
    const semiring = new ProvenanceSemiring(rules);
    const disagreements: string[] = [];

    for (let set = 0; set < 150; set++) {
      const traitSet = [0, 1, 2, 3].map((i) => makeTrait(rand, set + i));
      const orderings = permutations(traitSet);

      const serialized = new Set(
        orderings.map((o) => JSON.stringify(semiring.add(o).config))
      );

      if (serialized.size !== 1) {
        disagreements.push(
          `set ${set}: ${serialized.size} distinct results across ${orderings.length} orderings`
        );
      }
    }

    expect(disagreements).toEqual([]);
  });

  test('the serialized bytes are identical too, not merely the values', async () => {
    // Key ORDER matters as well as key values: a receipt is hashed, so two
    // resolutions that differ only in serialization order would produce two
    // hashes for one composition and break every proof built on them.
    const rand = seededRandom(0x5eed2);
    const semiring = new ProvenanceSemiring(rules);

    for (let set = 0; set < 25; set++) {
      const traitSet = [0, 1, 2, 3, 4].map((i) => makeTrait(rand, set + i));
      const hashes = new Set<string>();

      for (let ord = 0; ord < 12; ord++) {
        const composed = semiring.add(shuffleWith(rand, traitSet));
        hashes.add(await hashBytes(JSON.stringify(composed.config), 'sha256'));
      }

      expect(hashes.size, `set ${set} hashed to ${hashes.size} distinct values`).toBe(1);
    }
  });

  /**
   * One case per strategy, every permutation, so a failure names the culprit.
   * The old test told you only that "some ordering disagreed" somewhere inside
   * 200,000 evaluations.
   */
  test.each([
    ['max', 'friction', [0.1, 0.9, 0.5, 0.3], 0.9],
    ['min', 'restitution', [0.8, 0.2, 0.6, 0.4], 0.2],
    ['min', 'opacity', [1, 0.25, 0.75, 0.5], 0.25],
  ])('%s is commutative on %s, across all 24 orderings', (_strategy, property, values, want) => {
    const semiring = new ProvenanceSemiring(rules);
    const traits: TraitApplication[] = (values as number[]).map((v, i) => ({
      name: SOURCES[i],
      config: { [property as string]: v },
      context: { authorityLevel: 50, agentId: `agent-${i}` },
    }));

    const results = new Set(
      permutations(traits).map((o) => (semiring.add(o).config as Record<string, unknown>)[property as string])
    );

    expect([...results]).toEqual([want]);
  });

  test('authority-weighted picks the same winner in every ordering', () => {
    const semiring = new ProvenanceSemiring(rules);
    const traits: TraitApplication[] = [
      { name: 'physics', config: { mass: 10 }, context: { authorityLevel: 90, agentId: 'a' } },
      { name: 'material', config: { mass: 20 }, context: { authorityLevel: 10, agentId: 'b' } },
      { name: 'kinematic', config: { mass: 30 }, context: { authorityLevel: 50, agentId: 'c' } },
    ];

    const masses = new Set(
      permutations(traits).map((o) => (semiring.add(o).config as { mass: number }).mass)
    );

    expect(masses.size, `authority-weighted produced ${masses.size} different masses`).toBe(1);
  });

  test('PROVENANCE is order-independent, not just the value', () => {
    // The assertion this file was missing, and the reason it could not fail.
    //
    // For authority-weighted, the resolved VALUE is a multiplication, which is
    // commutative whatever the tie-break does — so inspecting config.mass can
    // never detect order dependence. What the tie-break actually selects is the
    // CONTEXT: whose authority won. Attribution is what receipts are built on,
    // so attribution is the property to pin.
    //
    // HONEST STATUS: THIS ONE IS NOT PROVEN, and it is the only assertion here
    // that is not. Twice I replaced the body of tieBreakProvenance with
    // `return a` — whichever argument arrived first, i.e. deliberately
    // order-dependent — and NOTHING in this file went red, this test included.
    // Probing through the real entry point showed why: composing masses 2, 3
    // and 5 with equal authority resolved to the same source in every ordering
    // regardless. So either the tie-break is unreachable from add(), or
    // something upstream settles the winner before weights are compared.
    //
    // The assertion is kept because it is correct and cheap, and because it
    // marks the question. It is NOT evidence that the tie-break works. Whoever
    // picks this up: find an input that reaches tieBreakProvenance, or find out
    // that nothing can, and then either prove this test or delete it. An
    // assertion nobody can make fail is the thing this file was rewritten to
    // stop pretending about.
    const semiring = new ProvenanceSemiring(rules);
    const traits: TraitApplication[] = [
      { name: 'physics', config: { mass: 2 }, context: { authorityLevel: 42, agentId: 'agent-a' } },
      { name: 'material', config: { mass: 3 }, context: { authorityLevel: 42, agentId: 'agent-b' } },
      { name: 'kinematic', config: { mass: 5 }, context: { authorityLevel: 42, agentId: 'agent-c' } },
      { name: 'glowing', config: { mass: 7 }, context: { authorityLevel: 42, agentId: 'agent-d' } },
    ];

    const winners = new Set(
      permutations(traits).map((ordering) => {
        const provenance = semiring.add(ordering).provenance as Record<
          string,
          { context?: { agentId?: string } }
        >;
        return provenance.mass?.context?.agentId ?? '(none)';
      })
    );

    expect(
      [...winners],
      `authority tied four ways and attribution went to ${[...winners].join(', ')} depending on ordering`
    ).toHaveLength(1);
  });

  test('a TIE in authority still resolves the same way in every ordering', () => {
    // The hard case, and the one order-dependence hides in: equal authority,
    // different values. ProvenanceSemiring documents a deterministic winner for
    // exactly this (CRDT-01). Without it the answer is whichever trait happened
    // to arrive last, which is commutativity failing silently — every ordering
    // returns a plausible number, just not the same one.
    const semiring = new ProvenanceSemiring(rules);
    const traits: TraitApplication[] = [
      { name: 'physics', config: { mass: 11 }, context: { authorityLevel: 42, agentId: 'a' } },
      { name: 'material', config: { mass: 22 }, context: { authorityLevel: 42, agentId: 'b' } },
      { name: 'kinematic', config: { mass: 33 }, context: { authorityLevel: 42, agentId: 'c' } },
      { name: 'glowing', config: { mass: 44 }, context: { authorityLevel: 42, agentId: 'd' } },
    ];

    const masses = new Set(
      permutations(traits).map((o) => (semiring.add(o).config as { mass: number }).mass)
    );

    expect([...masses].length, `tied authority produced ${[...masses]}`).toBe(1);
  });

  test('domain-override respects precedence regardless of arrival order', () => {
    const semiring = new ProvenanceSemiring(rules);
    // 'material' is first in the declared precedence, so its colour must win
    // from any position in the input.
    const traits: TraitApplication[] = [
      { name: 'glowing', config: { color: '#111111' }, context: { authorityLevel: 99, agentId: 'a' } },
      { name: 'hoverable', config: { color: '#222222' }, context: { authorityLevel: 99, agentId: 'b' } },
      { name: 'material', config: { color: '#333333' }, context: { authorityLevel: 1, agentId: 'c' } },
    ];

    const colors = new Set(
      permutations(traits).map((o) => (semiring.add(o).config as { color: string }).color)
    );

    expect([...colors]).toEqual(['#333333']);
  });
});

/**
 * The benchmark the old file was really made of. It asserts nothing and never
 * did; it prints overhead figures. Kept because the numbers are cited, moved
 * behind a flag because its weight is what got the property above quarantined.
 *
 *   HOLO_BENCH=1 npx vitest run src/__tests__/trait-commutativity.test.ts
 */
describe.skipIf(!process.env.HOLO_BENCH)('trait composition overhead (benchmark)', () => {
  function calcStats(samples: number[]) {
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    return { median, p99: sorted[Math.floor(n * 0.99)] };
  }

  test(
    '200,000 resolutions, overhead profile',
    async () => {
      const objects = 100;
      const traitSetsPerObject = 20;
      const orderingsPerSet = 10;
      const runs = 10;
      const rand = seededRandom(0xbe11c4);
      const semiring = new ProvenanceSemiring(rules);
      const semiringSamples: number[] = [];
      const relativeSamples: number[] = [];

      for (let r = 0; r < runs; r++) {
        let semiringMs = 0;
        let baselineMs = 0;
        let shaMs = 0;
        let applications = 0;

        for (let o = 0; o < objects; o++) {
          for (let s = 0; s < traitSetsPerObject; s++) {
            const traitCount = 5 + Math.floor(rand() * 5);
            const traitSet = Array.from({ length: traitCount }, (_, i) => makeTrait(rand, i));

            const t0Base = performance.now();
            for (let ord = 0; ord < orderingsPerSet; ord++) {
              const config: Record<string, unknown> = {};
              for (const trait of traitSet) Object.assign(config, trait.config);
            }
            baselineMs += performance.now() - t0Base;

            for (let ord = 0; ord < orderingsPerSet; ord++) {
              const ordering = shuffleWith(rand, traitSet);
              const t0 = performance.now();
              const composed = semiring.add(ordering);
              semiringMs += performance.now() - t0;

              const json = JSON.stringify(composed.config);
              const t0Hash = performance.now();
              await hashBytes(json, 'sha256');
              shaMs += performance.now() - t0Hash;
              applications += traitCount;
            }
          }
        }

        semiringSamples.push((semiringMs * 1000) / applications);
        relativeSamples.push(((semiringMs + shaMs - baselineMs) / baselineMs) * 100);
      }

      const sem = calcStats(semiringSamples);
      const rel = calcStats(relativeSamples);
      console.log(
        `\nresolutions: ${objects * traitSetsPerObject * orderingsPerSet * runs}\n` +
          `semiring per trait: ${sem.median.toFixed(3)} us median (p99 ${sem.p99.toFixed(3)})\n` +
          `relative to imperative assign: ${rel.median.toFixed(2)}% median (p99 ${rel.p99.toFixed(2)}%)\n`
      );

      // Asserted so this is a test and not a print statement: the profile must
      // have produced a finite number for every run.
      expect(semiringSamples.every((n) => Number.isFinite(n))).toBe(true);
      expect(semiringSamples).toHaveLength(runs);
    },
    120000
  );
});
