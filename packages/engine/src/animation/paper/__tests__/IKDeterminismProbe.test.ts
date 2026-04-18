import { describe, it, expect } from 'vitest';
import { DeterminismHarness } from '@holoscript/core';
import { runIKDeterminismProbe, PAPER_P2_IK_CANONICAL_SPEC } from '../IKDeterminismProbe';

describe('IKDeterminismProbe (P2-7 substrate)', () => {
  it('produces a stable, well-formed hash for the canonical IK spec', async () => {
    const harness = new DeterminismHarness({
      annotations: { paper: 'P2-7', probe: 'ik-canonical' },
    });

    const result = await harness.probe('p2-7-ik-canonical', () =>
      runIKDeterminismProbe(PAPER_P2_IK_CANONICAL_SPEC)
    );

    expect(result.error).toBeUndefined();
    expect(result.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
    // 1 chain × 4 targets × 3 floats × 4 bytes = 48 bytes
    expect(result.outputSize).toBe(48);
  });

  it('converges: 3 independent probe runs produce the same hash', async () => {
    const harness = new DeterminismHarness();

    const r1 = await harness.probe('p2-7-ik-conv', () =>
      runIKDeterminismProbe(PAPER_P2_IK_CANONICAL_SPEC)
    );
    const r2 = await harness.probe('p2-7-ik-conv', () =>
      runIKDeterminismProbe(PAPER_P2_IK_CANONICAL_SPEC)
    );
    const r3 = await harness.probe('p2-7-ik-conv', () =>
      runIKDeterminismProbe(PAPER_P2_IK_CANONICAL_SPEC)
    );

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r2.outputHash).toBe(r3.outputHash);

    const report = DeterminismHarness.compareResults([r1, r2, r3]);
    expect(report.divergent).toBe(false);
  });
});
