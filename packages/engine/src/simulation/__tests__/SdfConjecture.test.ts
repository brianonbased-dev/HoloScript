import { describe, expect, it } from 'vitest';
import {
  LIPSCHITZ_TOLERANCE,
  PROOF_CARRYING_SDF_V1,
  empiricalLipschitzRatio,
  generateGyroidFamily,
  generateSphereFamily,
  gyroidCandidate,
  runProofCarryingSdfConjecture,
  sphereCandidate,
} from '../SdfConjecture';

describe('Proof-carrying SDF conjecture sub-class', () => {
  it('a true-distance sphere is 1-Lipschitz (max sampled ratio ≈ 1)', () => {
    const { maxRatio, pairsSampled } = empiricalLipschitzRatio(sphereCandidate(1).node);
    expect(pairsSampled).toBeGreaterThan(0);
    expect(maxRatio).toBeLessThanOrEqual(1 + LIPSCHITZ_TOLERANCE);
  });

  it('a gyroid is NOT 1-Lipschitz (sampled ratio exceeds 1 — sound counterexample)', () => {
    const { maxRatio, witness } = empiricalLipschitzRatio(gyroidCandidate(5).node);
    expect(maxRatio).toBeGreaterThan(1 + LIPSCHITZ_TOLERANCE);
    expect(witness).not.toBeNull();
  });

  it('every sphere in the survivor family passes', () => {
    for (const c of generateSphereFamily()) {
      const { maxRatio } = empiricalLipschitzRatio(c.node);
      expect(maxRatio, c.id).toBeLessThanOrEqual(1 + LIPSCHITZ_TOLERANCE);
    }
  });

  it('every gyroid in the falsifier family is discovered as a violator', () => {
    for (const c of generateGyroidFamily()) {
      const { maxRatio } = empiricalLipschitzRatio(c.node);
      expect(maxRatio, c.id).toBeGreaterThan(1 + LIPSCHITZ_TOLERANCE);
    }
  });

  it('runProofCarryingSdfConjecture passes its gate: survivor survives + falsifier discovered', () => {
    const receipt = runProofCarryingSdfConjecture();

    expect(receipt.solverType).toBe(PROOF_CARRYING_SDF_V1);
    expect(receipt.scenarios).toHaveLength(2);

    const survivor = receipt.scenarios.find((s) => s.role === 'survivor')!;
    const falsifier = receipt.scenarios.find((s) => s.role === 'falsifier')!;

    expect(survivor.status).toBe('survived');
    expect(survivor.counterexamples).toHaveLength(0);

    expect(falsifier.status).toBe('falsified');
    expect(falsifier.counterexamples.length).toBeGreaterThan(0);
    // each counterexample carries a witnessing pair with ratio > 1
    for (const ce of falsifier.counterexamples) {
      expect(ce.witness.ratio).toBeGreaterThan(1);
    }

    expect(receipt.gate.passed).toBe(true);
  });

  it('is deterministic — identical receipt key across runs', () => {
    expect(runProofCarryingSdfConjecture().receiptKey).toBe(runProofCarryingSdfConjecture().receiptKey);
  });

  it('rejects invalid primitives', () => {
    expect(() => sphereCandidate(0)).toThrow();
    expect(() => gyroidCandidate(-1)).toThrow();
  });
});
