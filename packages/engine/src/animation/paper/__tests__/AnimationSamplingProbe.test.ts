/**
 * AnimationSamplingProbe — P2-0 substrate determinism test.
 *
 * Proves the minimum claim P2-0 depends on: `AnimClip.sample(t)`
 * produces byte-identical output across independent runs of the same
 * input spec. Retargeting determinism across backends is the full
 * paper claim and requires a retargeter (not yet shipped). This
 * probe validates the substrate.
 *
 * Same pattern as Paper #2 LIFDeterminismProbe:
 *   - DeterminismHarness from @holoscript/core
 *   - A frozen canonical spec the paper cites
 *   - 3 independent runs must converge to the same hash
 *   - Different specs must produce different hashes
 */

import { describe, it, expect } from 'vitest';
import { DeterminismHarness } from '@holoscript/core';
import {
  runAnimationSamplingProbe,
  PAPER_P2_0_CANONICAL_SPEC,
} from '../AnimationSamplingProbe';

describe('AnimationSamplingProbe (P2-0 substrate)', () => {
  it('produces a stable, well-formed hash for the canonical spec', async () => {
    const harness = new DeterminismHarness({
      annotations: { paper: 'P2-0', probe: 'animation-sampling-canonical' },
    });

    const result = await harness.probe('p2-0-canonical', () =>
      runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC)
    );

    expect(result.error).toBeUndefined();
    expect(result.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
    // 4 tracks × 100 samples × 4 bytes (f32) = 1600 bytes
    expect(result.outputSize).toBe(
      PAPER_P2_0_CANONICAL_SPEC.clipSpec.tracks.length *
        PAPER_P2_0_CANONICAL_SPEC.sampleTimes.length *
        4
    );
    expect(result.environment.annotations?.paper).toBe('P2-0');
  });

  it('converges: 3 independent probe runs produce the same hash', async () => {
    const harness = new DeterminismHarness();

    const r1 = await harness.probe('p2-0-convergence', () =>
      runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC)
    );
    const r2 = await harness.probe('p2-0-convergence', () =>
      runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC)
    );
    const r3 = await harness.probe('p2-0-convergence', () =>
      runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC)
    );

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r2.outputHash).toBe(r3.outputHash);

    const report = DeterminismHarness.compareResults([r1, r2, r3]);
    expect(report.divergent).toBe(false);
    expect(report.uniqueHashes).toBe(1);
    expect(report.summary).toMatch(/^CONVERGENT/);
  });

  it('different interpolation modes produce different hashes', async () => {
    const harness = new DeterminismHarness();

    const linear = await harness.probe('p2-0-linear', () =>
      runAnimationSamplingProbe({
        ...PAPER_P2_0_CANONICAL_SPEC,
        clipSpec: { ...PAPER_P2_0_CANONICAL_SPEC.clipSpec, interpolation: 'linear' },
      })
    );
    const step = await harness.probe('p2-0-step', () =>
      runAnimationSamplingProbe({
        ...PAPER_P2_0_CANONICAL_SPEC,
        clipSpec: { ...PAPER_P2_0_CANONICAL_SPEC.clipSpec, interpolation: 'step' },
      })
    );

    expect(linear.outputHash).not.toBe(step.outputHash);
  });

  it('different sample times produce different hashes', async () => {
    const harness = new DeterminismHarness();

    const denseSchedule = await harness.probe('p2-0-dense', () =>
      runAnimationSamplingProbe({
        ...PAPER_P2_0_CANONICAL_SPEC,
        sampleTimes: Array.from({ length: 50 }, (_, i) => (i / 49) * 2.0),
      })
    );
    const canonical = await harness.probe('p2-0-canonical-100', () =>
      runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC)
    );

    expect(denseSchedule.outputHash).not.toBe(canonical.outputHash);
  });

  it('same spec with reordered tracks produces a DIFFERENT hash (order matters)', async () => {
    // Intentional: output byte order follows spec track order. A
    // reorder is a different probe, and the hash must reflect that.
    // If the hash were track-order-invariant, the paper would
    // implicitly claim retargeting is commutative across track
    // ordering — which is not what the underlying engine does.
    const harness = new DeterminismHarness();

    const canonical = await harness.probe('p2-0-order-a', () =>
      runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC)
    );
    const reordered = await harness.probe('p2-0-order-b', () =>
      runAnimationSamplingProbe({
        ...PAPER_P2_0_CANONICAL_SPEC,
        clipSpec: {
          ...PAPER_P2_0_CANONICAL_SPEC.clipSpec,
          tracks: [...PAPER_P2_0_CANONICAL_SPEC.clipSpec.tracks].reverse(),
        },
      })
    );

    expect(canonical.outputHash).not.toBe(reordered.outputHash);
  });

  it('empty sample schedule yields a zero-byte output', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('p2-0-empty', () =>
      runAnimationSamplingProbe({
        ...PAPER_P2_0_CANONICAL_SPEC,
        sampleTimes: [],
      })
    );
    expect(r.outputSize).toBe(0);
    // Hash of empty input is still well-formed (sha256:<hex>).
    expect(r.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
  });
});
