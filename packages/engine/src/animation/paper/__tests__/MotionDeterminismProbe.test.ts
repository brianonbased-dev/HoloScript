import { describe, it, expect } from 'vitest';
import { DeterminismHarness } from '@holoscript/core';
import { runMotionDeterminismProbe, PAPER_P2_MOTION_CANONICAL_SPEC } from '../MotionDeterminismProbe';

describe('MotionDeterminismProbe (P2-9 substrate)', () => {
  it('produces a stable, well-formed hash for the canonical motion transition spec', async () => {
    const harness = new DeterminismHarness({
      annotations: { paper: 'P2-9', probe: 'motion-canonical' },
    });

    const result = await harness.probe('p2-9-motion-canonical', () =>
      runMotionDeterminismProbe(PAPER_P2_MOTION_CANONICAL_SPEC)
    );

    expect(result.error).toBeUndefined();
    expect(result.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
    
    // 10 steps × 2 bones × 7 floats × 4 bytes = 560 bytes
    expect(result.outputSize).toBe(560);
  });

  it('converges: 3 independent probe runs produce the same hash', async () => {
    const harness = new DeterminismHarness();

    const r1 = await harness.probe('p2-9-motion-conv', () =>
      runMotionDeterminismProbe(PAPER_P2_MOTION_CANONICAL_SPEC)
    );
    const r2 = await harness.probe('p2-9-motion-conv', () =>
      runMotionDeterminismProbe(PAPER_P2_MOTION_CANONICAL_SPEC)
    );
    const r3 = await harness.probe('p2-9-motion-conv', () =>
      runMotionDeterminismProbe(PAPER_P2_MOTION_CANONICAL_SPEC)
    );

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r2.outputHash).toBe(r3.outputHash);

    const report = DeterminismHarness.compareResults([r1, r2, r3]);
    expect(report.divergent).toBe(false);
  });
});
