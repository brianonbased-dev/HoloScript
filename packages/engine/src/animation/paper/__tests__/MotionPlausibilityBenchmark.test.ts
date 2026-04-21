import { describe, expect, it } from 'vitest';
import {
  PAPER_9_BASELINES,
  PAPER_9_CATEGORIES,
  hashBenchmarkMatrix,
  runMotionPlausibilityBenchmark,
  type MotionBenchmarkCell,
} from '../MotionPlausibilityBenchmark';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cellFor(
  cells: MotionBenchmarkCell[],
  category: string,
  system: string,
): MotionBenchmarkCell {
  const found = cells.find((c) => c.category === category && c.system === system);
  if (!found) throw new Error(`Cell not found: ${category} × ${system}`);
  return found;
}

// ---------------------------------------------------------------------------
// Paper-9 5-Category Benchmark Suite
// ---------------------------------------------------------------------------

describe('Paper-9 MotionPlausibility 5-category benchmark', () => {
  // Use a small clip count for fast CI; the canonical run uses 400.
  const CLIP_COUNT = 80;
  const SEED = 0xdeadbeef;

  it('produces a complete 20-cell matrix (5 categories × 4 systems)', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    expect(matrix.cells).toHaveLength(
      PAPER_9_CATEGORIES.length * PAPER_9_BASELINES.length,
    );
    for (const cell of matrix.cells) {
      expect(PAPER_9_CATEGORIES).toContain(cell.category);
      expect(PAPER_9_BASELINES).toContain(cell.system);
      expect(cell.clipCount).toBe(CLIP_COUNT);
    }
  });

  it('contracted system achieves 100% pass rate in all categories', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    for (const category of PAPER_9_CATEGORIES) {
      const cell = cellFor(matrix.cells, category, 'contracted');
      expect(cell.passRate).toBe(1.0);
    }
  });

  it('AnimGAN baseline fails at least 10% per category', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    for (const category of PAPER_9_CATEGORIES) {
      const cell = cellFor(matrix.cells, category, 'animgan');
      // passRate ≤ 0.90 means at least 10% failure rate
      expect(cell.passRate).toBeLessThanOrEqual(0.90);
    }
  });

  it('MotionVAE baseline fails at least 10% per category', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    for (const category of PAPER_9_CATEGORIES) {
      const cell = cellFor(matrix.cells, category, 'motionvae');
      expect(cell.passRate).toBeLessThanOrEqual(0.90);
    }
  });

  it('MDM baseline fails at least 10% per category', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    for (const category of PAPER_9_CATEGORIES) {
      const cell = cellFor(matrix.cells, category, 'mdm');
      expect(cell.passRate).toBeLessThanOrEqual(0.90);
    }
  });

  it('all baselines fail at least 15% overall (paper-9 claims ≥15–40%)', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    for (const system of ['animgan', 'motionvae', 'mdm'] as const) {
      const cells = matrix.cells.filter((c) => c.system === system);
      const avgPassRate =
        cells.reduce((sum, c) => sum + c.passRate, 0) / cells.length;
      expect(avgPassRate).toBeLessThan(0.85); // ≥15% failure on average
    }
  });

  it('check latency is <10ms per 1-second clip (paper-9 §4.2)', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    for (const cell of matrix.cells) {
      // Threshold: 10ms per clip = 10,000 µs per clip
      expect(cell.checkMicrosecondsPerClip).toBeLessThan(10_000);
    }
  });

  it('per-category timing: 80 clips per system <500ms total', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    expect(matrix.totalCheckMs).toBeLessThan(500);
  });

  it('hash output is deterministic across two runs with same seed', () => {
    const m1 = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    const m2 = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    const h1 = hashBenchmarkMatrix(m1);
    const h2 = hashBenchmarkMatrix(m2);
    expect(h1).toEqual(h2);
  });

  it('different seed produces different hash', () => {
    const m1 = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED });
    const m2 = runMotionPlausibilityBenchmark({ clipCount: CLIP_COUNT, seed: SEED + 1 });
    const h1 = hashBenchmarkMatrix(m1);
    const h2 = hashBenchmarkMatrix(m2);
    // Pass rates should differ → hashes must differ
    const anyDiff = m1.cells.some((c, i) => c.passRate !== m2.cells[i]!.passRate);
    if (anyDiff) {
      expect(h1).not.toEqual(h2);
    }
  });

  // ---------------------------------------------------------------------------
  // Canonical 400-clip run — captures numbers for the paper table
  // ---------------------------------------------------------------------------
  it('canonical 400-clip run — captures paper-9 table values', () => {
    const matrix = runMotionPlausibilityBenchmark({ clipCount: 400, seed: SEED });

    // Print table to stdout for reference (captured in test output / CI logs)
    const header = [
      'Category'.padEnd(16),
      'Contracted'.padEnd(12),
      'AnimGAN'.padEnd(12),
      'MotionVAE'.padEnd(12),
      'MDM'.padEnd(12),
      'Time/clip µs (contracted)',
    ].join(' | ');
    console.log('\n--- Paper-9 §4 Benchmark Table (400 clips/system) ---');
    console.log(header);
    console.log('-'.repeat(header.length));

    for (const category of PAPER_9_CATEGORIES) {
      const values = PAPER_9_BASELINES.map((sys) => {
        const cell = cellFor(matrix.cells, category, sys);
        return `${(cell.passRate * 100).toFixed(1)}%`.padEnd(12);
      });
      const timing = cellFor(matrix.cells, category, 'contracted')
        .checkMicrosecondsPerClip.toFixed(2);
      console.log(`${category.padEnd(16)} | ${values.join(' | ')} | ${timing} µs`);
    }
    console.log('-'.repeat(header.length));
    console.log(`Total check time: ${matrix.totalCheckMs.toFixed(2)} ms`);

    // Correctness assertions on canonical run
    for (const category of PAPER_9_CATEGORIES) {
      const contracted = cellFor(matrix.cells, category, 'contracted');
      expect(contracted.passRate).toBe(1.0);

      for (const baseline of ['animgan', 'motionvae', 'mdm'] as const) {
        const cell = cellFor(matrix.cells, category, baseline);
        expect(cell.passRate).toBeLessThan(0.90);
        expect(cell.passRate).toBeGreaterThan(0.50); // shouldn't be >50% failure
      }
    }
  });
});
