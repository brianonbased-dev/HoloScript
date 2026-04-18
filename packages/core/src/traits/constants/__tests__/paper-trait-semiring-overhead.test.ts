/**
 * Paper 11 / ECOOP — Semiring resolution overhead microbenchmark.
 *
 * Measures wall-clock cost of ProvenanceSemiring.add() across realistic
 * trait-set sizes. Reports median and p99 per-call (µs) and per-trait (µs).
 *
 * Run: pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-semiring-overhead.test.ts
 */

import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VR_TRAITS } from '../index';
import { ProvenanceSemiring } from '../../../compiler/traits/ProvenanceSemiring';
import type { TraitApplication } from '../../../compiler/traits/ProvenanceSemiring';

// ---------- helpers ----------

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
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

// ---------- constants ----------

/** Trait set sizes to benchmark. */
const BATCH_SIZES = [1, 2, 5, 10, 20, 50, 100];
/** Number of warmup iterations (not measured). */
const WARMUP = 50;
/** Number of measured iterations per batch size. */
const ITERATIONS = 500;

// ---------- test ----------

describe('Paper 11 — semiring resolution overhead microbenchmark', () => {
  it('measures ProvenanceSemiring.add() median/p99 per-call and per-trait (µs)', () => {
    const uniqueTraits = Array.from(new Set(VR_TRAITS.map(normalizeTraitName)));
    const semiring = new ProvenanceSemiring();

    const rows: Array<{
      batchSize: number;
      warmup: number;
      iterations: number;
      perCallMedianUs: number;
      perCallP99Us: number;
      perTraitMedianUs: number;
      perTraitP99Us: number;
    }> = [];

    // Measure JSON serialization cost (probe only the cost of JSON.stringify on a typical config).
    const jsonProbe: number[] = [];
    {
      const sampleApp = traitApp(uniqueTraits[0], 0);
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        JSON.stringify(sampleApp.config);
        jsonProbe.push((performance.now() - t0) * 1000);
      }
    }
    const jsonStats = calcStats(jsonProbe.slice(50)); // drop first 50

    console.log('\n[paper-trait-semiring-overhead] SEMIRING OVERHEAD MICROBENCHMARK');
    console.log(`  trait universe: ${uniqueTraits.length}`);
    console.log(`  warmup: ${WARMUP}  measured iterations: ${ITERATIONS}`);
    console.log(
      `  JSON.stringify (single config) median=${jsonStats.median.toFixed(2)} µs  p99=${jsonStats.p99.toFixed(2)} µs`
    );
    console.log('');

    for (const batchSize of BATCH_SIZES) {
      // Build a fixed set of trait applications for this batch.
      const apps: TraitApplication[] = uniqueTraits
        .slice(0, batchSize)
        .map((name, i) => traitApp(name, i));

      // Warmup.
      for (let w = 0; w < WARMUP; w++) {
        semiring.add(apps);
      }

      // Measured runs.
      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        semiring.add(apps);
        samples.push((performance.now() - t0) * 1000); // µs
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

    // Persist JSON artifact.
    const artifact = {
      generatedAt: new Date().toISOString(),
      traitUniverseCount: uniqueTraits.length,
      warmup: WARMUP,
      iterations: ITERATIONS,
      jsonSerializationUs: {
        median: parseFloat(jsonStats.median.toFixed(3)),
        p99: parseFloat(jsonStats.p99.toFixed(3)),
        note: 'single TraitApplication.config JSON.stringify, µs',
      },
      byBatchSize: rows,
    };

    const outDir = path.resolve(__dirname, '../../../../../../.bench-logs');
    if (fs.existsSync(outDir)) {
      fs.writeFileSync(
        path.join(outDir, 'paper-trait-semiring-overhead.json'),
        JSON.stringify(artifact, null, 2)
      );
    }
  });
});
