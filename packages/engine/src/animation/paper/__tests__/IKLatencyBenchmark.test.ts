import { describe, expect, it } from 'vitest';
import { DeterminismHarness } from '@holoscript/core';
import {
  benchmarkIKLatencyCell,
  benchmarkIKLatencyMatrix,
  formatIKLatencyMarkdown,
  PAPER_7_IK_CHAIN_LENGTHS,
  PAPER_7_IK_MODES,
  runIKLatencyProbe,
} from '../IKLatencyProbe';

describe('IKLatencyProbe (Paper 7 camera-ready benchmark substrate)', () => {
  it('emits deterministic bytes for a single benchmark cell', () => {
    const bytes = runIKLatencyProbe({
      mode: 'analytic',
      chainLength: 3,
      taskCount: 16,
      seed: 7,
    });

    expect(bytes.byteLength).toBe(16 * 3 * 4);
  });

  it('measures finite μs-per-solve for a single cell', () => {
    const result = benchmarkIKLatencyCell({
      mode: 'ccd',
      chainLength: 5,
      taskCount: 64,
      seed: 11,
    });

    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.microsecondsPerSolve).toBeGreaterThanOrEqual(0);
    expect(result.outputBytes.byteLength).toBe(64 * 3 * 4);
  });

  it('builds a complete 12-cell matrix', () => {
    const cells = benchmarkIKLatencyMatrix({
      taskCount: 128,
      warmupRuns: 0,
      measuredRuns: 2,
      seed: 101,
    });

    expect(cells).toHaveLength(PAPER_7_IK_MODES.length * PAPER_7_IK_CHAIN_LENGTHS.length);
    for (const cell of cells) {
      expect(cell.medianMicrosecondsPerSolve).toBeGreaterThanOrEqual(0);
      expect(cell.runMicrosecondsPerSolve).toHaveLength(2);
    }
  });

  it('formats the matrix as markdown for the paper table', () => {
    const markdown = formatIKLatencyMarkdown(
      benchmarkIKLatencyMatrix({
        taskCount: 32,
        warmupRuns: 0,
        measuredRuns: 1,
        seed: 202,
      }),
    );

    expect(markdown).toContain('| Mode | 2 bones | 3 bones | 5 bones | 10 bones |');
    expect(markdown).toContain('| Analytic |');
    expect(markdown).toContain('| CCD |');
    expect(markdown).toContain('| FABRIK |');
  });

  it('satisfies pairwise hash equality on the canonical 12-cell subset', async () => {
    const harness = new DeterminismHarness({
      annotations: { paper: 'paper-7', suite: 'ik-latency' },
    });

    for (const mode of PAPER_7_IK_MODES) {
      for (const chainLength of PAPER_7_IK_CHAIN_LENGTHS) {
        const r1 = await harness.probe(`ik-${mode}-${chainLength}`, () =>
          runIKLatencyProbe({ mode, chainLength, taskCount: 64, seed: 500 + chainLength }),
        );
        const r2 = await harness.probe(`ik-${mode}-${chainLength}`, () =>
          runIKLatencyProbe({ mode, chainLength, taskCount: 64, seed: 500 + chainLength }),
        );
        const r3 = await harness.probe(`ik-${mode}-${chainLength}`, () =>
          runIKLatencyProbe({ mode, chainLength, taskCount: 64, seed: 500 + chainLength }),
        );

        expect(r1.error).toBeUndefined();
        expect(r2.error).toBeUndefined();
        expect(r3.error).toBeUndefined();
        expect(r1.outputHash).toBe(r2.outputHash);
        expect(r2.outputHash).toBe(r3.outputHash);
        const report = DeterminismHarness.compareResults([r1, r2, r3]);
        expect(report.divergent).toBe(false);
      }
    }
  });
});
