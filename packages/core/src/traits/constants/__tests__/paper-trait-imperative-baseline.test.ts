/**
 * Paper 11 / ECOOP — Imperative baseline microbenchmark.
 *
 * Measures wall-clock cost of an UNCONTRACTED imperative composition
 * (direct property writes into a plain object, no semiring, no provenance,
 * no conflict-mode tracking). This is the "future work" baseline that
 * paper-11-hsplus-ecoop.tex referenced as not-yet-implemented; closing it
 * lets §5 ship the apples-to-apples overhead ratio reviewers will look for.
 *
 * Input shape mirrors paper-trait-semiring-overhead.test.ts exactly (same
 * trait universe via VR_TRAITS, same BATCH_SIZES 1-100, same WARMUP/ITERATIONS,
 * same TraitApplication value shape) so the per-trait microsecond columns are
 * directly comparable. The two artifacts together form the "with vs. without
 * the contract" pair the ablation table in §5.4 cites.
 *
 * Determinism: the imperative baseline by construction has NO order-
 * independence guarantee. We do NOT randomise application order here; we
 * report cost only. The order-independence claim is the WHOLE POINT of the
 * semiring-vs-imperative gap and is established in
 * paper-trait-order-independence.test.ts (10,000/10,000 orderings).
 *
 * Run: pnpm --filter @holoscript/core exec vitest run \
 *   src/traits/constants/__tests__/paper-trait-imperative-baseline.test.ts
 */

import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VR_TRAITS } from '../index';

// ---------- helpers (mirror semiring-overhead harness shape) ----------

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

interface TraitApplication {
  name: string;
  config: Record<string, unknown>;
}

function traitApp(name: string, index: number): TraitApplication {
  return {
    name,
    config: {
      [`prop_${name.replace(/[^a-zA-Z0-9]/g, '_')}`]: index,
      enabled: true,
    },
  };
}

function calcStats(samples: number[]): { median: number; p99: number; min: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
  return { median, p99, min: sorted[0], max: sorted[n - 1] };
}

// ---------- imperative composition (last-write-wins) ----------

/**
 * Apply a batch of trait applications to a plain object via direct property
 * writes. No semiring, no hashing, no provenance, no conflict-mode tracking —
 * this is the unmediated baseline real game engines (Unity ECS, Bevy, etc.)
 * approximate when they don't use a semantic composition layer. Conflicting
 * writes silently last-wins, which is exactly the order-dependence problem
 * Paper 11 identifies.
 *
 * Returns the composed config object so V8 can't dead-code-eliminate the
 * write loop (the returned reference is used by the caller in samples).
 */
function applyImperative(apps: TraitApplication[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < apps.length; i++) {
    const cfg = apps[i].config;
    // Inline property copy — no for-in/Object.assign overhead beyond key-by-key
    // assignment. Matches what handcrafted handler chains do in production code.
    for (const key in cfg) {
      out[key] = cfg[key];
    }
  }
  return out;
}

// ---------- constants (mirror semiring harness exactly) ----------

const BATCH_SIZES = [1, 2, 5, 10, 20, 50, 100];
const WARMUP = 50;
const ITERATIONS = 500;

// ---------- test ----------

describe('Paper 11 — imperative-baseline overhead microbenchmark', () => {
  it('measures direct property-write composition median/p99 per-call and per-trait (µs)', () => {
    const uniqueTraits = Array.from(new Set(VR_TRAITS.map(normalizeTraitName)));

    const rows: Array<{
      batchSize: number;
      warmup: number;
      iterations: number;
      perCallMedianUs: number;
      perCallP99Us: number;
      perTraitMedianUs: number;
      perTraitP99Us: number;
    }> = [];

    // JSON-serialisation probe — kept identical to semiring harness so the
    // "irreducible cost floor" reference point in the paper's ablation table
    // is computed from the same probe shape on both sides.
    const jsonProbe: number[] = [];
    {
      const sampleApp = traitApp(uniqueTraits[0], 0);
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        JSON.stringify(sampleApp.config);
        jsonProbe.push((performance.now() - t0) * 1000);
      }
    }
    const jsonStats = calcStats(jsonProbe.slice(50));

    console.log('\n[paper-trait-imperative-baseline] IMPERATIVE BASELINE MICROBENCHMARK');
    console.log(`  trait universe: ${uniqueTraits.length}`);
    console.log(`  warmup: ${WARMUP}  measured iterations: ${ITERATIONS}`);
    console.log(
      `  JSON.stringify (single config) median=${jsonStats.median.toFixed(2)} µs  p99=${jsonStats.p99.toFixed(2)} µs`
    );
    console.log('');

    // Sink to keep V8 honest — accumulate a primitive derived from the result
    // so the runtime can't elide the apply loop as dead code.
    let sink = 0;

    for (const batchSize of BATCH_SIZES) {
      const apps: TraitApplication[] = uniqueTraits
        .slice(0, batchSize)
        .map((name, i) => traitApp(name, i));

      // Warmup.
      for (let w = 0; w < WARMUP; w++) {
        const out = applyImperative(apps);
        sink += Object.keys(out).length;
      }

      // Measured runs.
      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        const out = applyImperative(apps);
        samples.push((performance.now() - t0) * 1000); // µs
        sink += Object.keys(out).length;
      }

      const stats = calcStats(samples);
      const perTraitMedian = batchSize > 0 ? stats.median / batchSize : stats.median;
      const perTraitP99 = batchSize > 0 ? stats.p99 / batchSize : stats.p99;

      rows.push({
        batchSize,
        warmup: WARMUP,
        iterations: ITERATIONS,
        perCallMedianUs: parseFloat(stats.median.toFixed(3)),
        perCallP99Us: parseFloat(stats.p99.toFixed(3)),
        perTraitMedianUs: parseFloat(perTraitMedian.toFixed(3)),
        perTraitP99Us: parseFloat(perTraitP99.toFixed(3)),
      });

      console.log(
        `  batchSize=${batchSize.toString().padStart(3)}` +
          `  perCall median=${stats.median.toFixed(2).padStart(7)} µs  p99=${stats.p99.toFixed(2).padStart(7)} µs` +
          `  perTrait median=${perTraitMedian.toFixed(2).padStart(7)} µs  p99=${perTraitP99.toFixed(2).padStart(7)} µs`
      );
    }

    // Persist JSON artifact alongside paper-trait-semiring-overhead.json so
    // the paper's §5.4 ablation table can read both with the same loader.
    const artifact = {
      generatedAt: new Date().toISOString(),
      traitUniverseCount: uniqueTraits.length,
      warmup: WARMUP,
      iterations: ITERATIONS,
      jsonSerializationUs: {
        median: parseFloat(jsonStats.median.toFixed(3)),
        p99: parseFloat(jsonStats.p99.toFixed(3)),
        note: 'single TraitApplication.config JSON.stringify, µs (probe-shape identical to paper-trait-semiring-overhead.json)',
      },
      byBatchSize: rows,
      compositionShape: 'imperative-direct-write-no-semiring-no-provenance-no-conflict-mode',
      orderIndependenceClaim:
        'NONE — last-write-wins by construction; reordering inputs may change output. See paper-trait-order-independence.test.ts for the contracted-side guarantee that this baseline lacks.',
      sinkChecksum: sink,
    };

    const outDir = path.resolve(__dirname, '../../../../../../.bench-logs');
    if (fs.existsSync(outDir)) {
      fs.writeFileSync(
        path.join(outDir, 'paper-trait-imperative-baseline.json'),
        JSON.stringify(artifact, null, 2)
      );
    }
  });
});
