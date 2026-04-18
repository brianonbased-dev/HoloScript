/**
 * LIFDeterminismProbe — Paper #2 same-backend determinism test.
 *
 * Proves the MINIMUM determinism claim: three independent runs of
 * the canonical LIF probe on the SAME backend produce the SAME
 * output hash. This is the baseline the cross-backend table sits on;
 * if same-backend runs disagree, cross-backend hash-equality is
 * meaningless.
 *
 * Cross-backend runs (Chromium vs. Firefox vs. Safari × GPUs) are
 * Paper #2's submission benchmark and require browser test
 * infrastructure or multi-Dawn-config CI — out of scope here.
 *
 * This test runs under vitest with the Dawn-native WebGPU backend
 * (see ../../__tests__/setup.ts) on hardware that supports it, and
 * the mock backend otherwise. Both paths must converge — mocks are
 * deterministic by construction; real GPU determinism is the claim
 * under test.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DeterminismHarness } from '@holoscript/core';
import { GPUContext } from '../../gpu-context.js';
import {
  runLIFDeterminismProbe,
  PAPER_2_CANONICAL_CONFIG,
} from '../LIFDeterminismProbe.js';

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
