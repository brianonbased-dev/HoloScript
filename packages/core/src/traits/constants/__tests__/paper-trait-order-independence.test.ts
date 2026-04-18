/**
 * Paper 11 / ECOOP — Randomized order-independence harness.
 *
 * Verifies that ProvenanceSemiring.add() produces identical output regardless
 * of the input ordering (commutativity property C1).
 *
 * For each random subset drawn from the trait universe, runs ORDERINGS_PER_SUBSET
 * random permutations and asserts every permutation yields the same finalConfig
 * canonical fingerprint.
 *
 * Run: pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-order-independence.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VR_TRAITS } from '../index';
import { ProvenanceSemiring } from '../../../compiler/traits/ProvenanceSemiring';
import type { TraitApplication } from '../../../compiler/traits/ProvenanceSemiring';

// ---------- helpers ----------

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

/** Canonical fingerprint of a plain-object config (sorted-key JSON). */
function fingerprint(config: Record<string, unknown>): string {
  const keys = Object.keys(config).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = config[k];
  return JSON.stringify(sorted);
}

/** Fisher–Yates shuffle (in-place). */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Seeded LCG RNG so the harness is fully deterministic across runs. */
function makeLcgRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Build a trivial TraitApplication from a trait name. */
function traitApp(name: string, index: number): TraitApplication {
  return {
    name,
    config: {
      [`prop_${name.replace(/[^a-zA-Z0-9]/g, '_')}`]: index,
      enabled: true,
    },
  };
}

// ---------- constants ----------

/** Number of random subsets to draw at each size bucket. */
const SUBSETS_PER_BUCKET = 20;
/** Number of random permutations to test per subset. */
const ORDERINGS_PER_SUBSET = 100;
/** Subset sizes to sample. */
const SUBSET_SIZES = [2, 5, 10, 20, 50];

// ---------- test ----------

describe('Paper 11 — randomized order-independence harness', () => {
  it('verifies ProvenanceSemiring.add() is order-independent across random permutations', () => {
    const rng = makeLcgRng(0xdeadbeef);
    const uniqueTraits = Array.from(new Set(VR_TRAITS.map(normalizeTraitName)));
    const semiring = new ProvenanceSemiring();

    const results: Array<{
      subsetSize: number;
      subsetsChecked: number;
      orderingsPerSubset: number;
      totalOrderingsChecked: number;
      pass: number;
      fail: number;
    }> = [];

    let overallPass = 0;
    let overallFail = 0;

    for (const subsetSize of SUBSET_SIZES) {
      let bucketPass = 0;
      let bucketFail = 0;

      for (let s = 0; s < SUBSETS_PER_BUCKET; s++) {
        // Draw a random subset of 'subsetSize' distinct traits.
        const pool = [...uniqueTraits];
        shuffle(pool, rng);
        const subset = pool.slice(0, subsetSize);

        // Build canonical TraitApplication array.
        const apps: TraitApplication[] = subset.map((name, i) => traitApp(name, i));

        // Compute baseline config (canonical ordering).
        const baseline = semiring.add([...apps]);
        const baselineFingerprint = fingerprint(baseline.config);

        // Run ORDERINGS_PER_SUBSET random permutations, compare fingerprints.
        for (let o = 0; o < ORDERINGS_PER_SUBSET; o++) {
          const permuted = shuffle([...apps], rng);
          const result = semiring.add(permuted);
          const fp = fingerprint(result.config);
          if (fp === baselineFingerprint) {
            bucketPass++;
          } else {
            bucketFail++;
          }
        }
      }

      overallPass += bucketPass;
      overallFail += bucketFail;

      results.push({
        subsetSize,
        subsetsChecked: SUBSETS_PER_BUCKET,
        orderingsPerSubset: ORDERINGS_PER_SUBSET,
        totalOrderingsChecked: SUBSETS_PER_BUCKET * ORDERINGS_PER_SUBSET,
        pass: bucketPass,
        fail: bucketFail,
      });

      // All orderings must produce identical configs.
      expect(bucketFail, `Size ${subsetSize}: expected 0 failures`).toBe(0);
    }

    const totalOrderings = overallPass + overallFail;
    console.log('\n[paper-trait-order-independence] ORDER-INDEPENDENCE RESULTS');
    console.log(`  trait universe: ${uniqueTraits.length}`);
    console.log(`  subset sizes tested: ${SUBSET_SIZES.join(', ')}`);
    console.log(`  subsets per bucket: ${SUBSETS_PER_BUCKET}`);
    console.log(`  orderings per subset: ${ORDERINGS_PER_SUBSET}`);
    console.log(`  total orderings checked: ${totalOrderings}`);
    console.log(`  pass: ${overallPass}  fail: ${overallFail}`);
    for (const r of results) {
      console.log(
        `  size=${r.subsetSize} subtests=${r.subsetsChecked} total=${r.totalOrderingsChecked} pass=${r.pass} fail=${r.fail}`
      );
    }

    // Persist JSON artifact.
    const artifact = {
      generatedAt: new Date().toISOString(),
      rngSeed: '0xdeadbeef',
      traitUniverseCount: uniqueTraits.length,
      subsetSizes: SUBSET_SIZES,
      subsetsPerBucket: SUBSETS_PER_BUCKET,
      orderingsPerSubset: ORDERINGS_PER_SUBSET,
      totalOrderingsChecked: totalOrderings,
      overallPass,
      overallFail,
      bySize: results,
    };

    const outDir = path.resolve(__dirname, '../../../../../../.bench-logs');
    if (fs.existsSync(outDir)) {
      fs.writeFileSync(
        path.join(outDir, 'paper-trait-order-independence.json'),
        JSON.stringify(artifact, null, 2)
      );
    }

    expect(overallFail).toBe(0);
  });
});
