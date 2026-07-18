/**
 * LIFDeterminismProbe — Paper #2 same-backend determinism test.
 *
 * Checks that three runs through the active test context produce the same
 * final-membrane-byte hash. This is live-GPU evidence only when `GPU_LIVE` is
 * true; otherwise it checks deterministic fallback/mock plumbing.
 *
 * **Empirical cross-vendor note (2026-05-10):**
 * NVIDIA Ampere vs Intel Gen-12LP produced different membrane hashes in the
 * recorded observation. This probe does not read spike masks, so that result
 * cannot establish spike-decision parity. AMD and Apple Silicon were not run.
 *
 * This test runs under vitest with the Dawn-native WebGPU backend
 * (see ../../__tests__/setup.ts) on hardware that supports it, and
 * the mock backend otherwise. The seed- and tick-divergence assertions return
 * early when `GPU_LIVE` is false; a green fallback run must not be reported as
 * GPU parity evidence.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DeterminismHarness } from '@holoscript/core/testing';
import { GPUContext } from '../../gpu-context.js';
import { GPU_LIVE } from '../../__tests__/setup.js';
import { runLIFDeterminismProbe, PAPER_2_CANONICAL_CONFIG } from '../LIFDeterminismProbe.js';

describe('LIFDeterminismProbe (Paper #2 same-backend baseline)', () => {
  let ctx: GPUContext;

  beforeAll(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterAll(() => {
    ctx.destroy();
  });

  it('produces a stable, non-empty output hash for the canonical config', async () => {
    const harness = new DeterminismHarness({
      annotations: { paper: '2', probe: 'lif-canonical' },
    });

    const result = await harness.probe('lif-canonical', () =>
      runLIFDeterminismProbe(ctx, PAPER_2_CANONICAL_CONFIG)
    );

    expect(result.error).toBeUndefined();
    expect(result.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
    expect(result.outputSize).toBe(PAPER_2_CANONICAL_CONFIG.neuronCount * 4); // f32 per neuron
    expect(result.environment.annotations?.paper).toBe('2');
  });

  it('converges: 3 independent probe runs produce the same hash', async () => {
    const harness = new DeterminismHarness();

    const r1 = await harness.probe('lif-convergence', () =>
      runLIFDeterminismProbe(ctx, PAPER_2_CANONICAL_CONFIG)
    );
    const r2 = await harness.probe('lif-convergence', () =>
      runLIFDeterminismProbe(ctx, PAPER_2_CANONICAL_CONFIG)
    );
    const r3 = await harness.probe('lif-convergence', () =>
      runLIFDeterminismProbe(ctx, PAPER_2_CANONICAL_CONFIG)
    );

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r2.outputHash).toBe(r3.outputHash);

    const report = DeterminismHarness.compareResults([r1, r2, r3]);
    expect(report.divergent).toBe(false);
    expect(report.uniqueHashes).toBe(1);
    expect(report.summary).toMatch(/^CONVERGENT/);
  });

  it('different stimulus seeds produce different hashes', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-determinism] Skipping seed-divergence assertion: mock compute is no-op');
      return;
    }
    const harness = new DeterminismHarness();

    const r42 = await harness.probe('lif-seed-42', () =>
      runLIFDeterminismProbe(ctx, { ...PAPER_2_CANONICAL_CONFIG, stimulusSeed: 42 })
    );
    const r43 = await harness.probe('lif-seed-43', () =>
      runLIFDeterminismProbe(ctx, { ...PAPER_2_CANONICAL_CONFIG, stimulusSeed: 43 })
    );

    expect(r42.outputHash).not.toBe(r43.outputHash);
  });

  it('different tick counts produce different hashes', async () => {
    if (!GPU_LIVE) {
      console.log('[lif-determinism] Skipping tick-divergence assertion: mock compute is no-op');
      return;
    }
    const harness = new DeterminismHarness();

    const shortRun = await harness.probe('lif-ticks-10', () =>
      runLIFDeterminismProbe(ctx, { ...PAPER_2_CANONICAL_CONFIG, tickCount: 10 })
    );
    const longRun = await harness.probe('lif-ticks-100', () =>
      runLIFDeterminismProbe(ctx, { ...PAPER_2_CANONICAL_CONFIG, tickCount: 100 })
    );

    expect(shortRun.outputHash).not.toBe(longRun.outputHash);
  });

  it('rejects non-positive neuronCount', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('lif-invalid', () =>
      runLIFDeterminismProbe(ctx, { ...PAPER_2_CANONICAL_CONFIG, neuronCount: 0 })
    );
    // The probe throws; the harness captures the error.
    expect(r.error).toBeDefined();
    expect(r.outputHash.startsWith('error:')).toBe(true);
  });

  it('rejects non-positive tickCount', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('lif-invalid-ticks', () =>
      runLIFDeterminismProbe(ctx, { ...PAPER_2_CANONICAL_CONFIG, tickCount: 0 })
    );
    expect(r.error).toBeDefined();
    expect(r.outputHash.startsWith('error:')).toBe(true);
  });
});
