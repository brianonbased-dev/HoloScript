/**
 * ProvenanceSemiring — vector-valued property tests (paper-3 §5.2)
 *
 * Covers:
 *   - VectorValue type guards and helpers
 *   - vec-component-max, vec-component-min, vec-component-sum
 *   - vec-magnitude-max, vec-authority-weighted strategies
 *   - Commutativity of all vector strategies
 *   - Default vector rules (velocity, stressTensor, etc.)
 *   - Error cases (dimensionality mismatch, non-vector input)
 */
import { describe, it, expect } from 'vitest';
import {
  ProvenanceSemiring,
  AuthorityTier,
  isVectorValue,
  vecMagnitude,
  vecAdd,
  vecComponentMax,
  vecComponentMin,
  vecAuthorityPick,
  type TraitApplication,
  type ConflictResolutionRule,
} from '../traits/ProvenanceSemiring';

// ── Helpers ──────────────────────────────────────────────────────────────────

function semiring(rules?: ConflictResolutionRule[]): ProvenanceSemiring {
  return new ProvenanceSemiring(rules);
}

function trait(name: string, config: Record<string, unknown>, authorityLevel = 50): TraitApplication {
  return { name, config, context: { authorityLevel } };
}

// ── isVectorValue ─────────────────────────────────────────────────────────────

describe('isVectorValue', () => {
  it('returns true for a non-empty number array', () => {
    expect(isVectorValue([1, 2, 3])).toBe(true);
  });

  it('returns true for a single-element number array', () => {
    expect(isVectorValue([0])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isVectorValue([])).toBe(false);
  });

  it('returns false for non-array', () => {
    expect(isVectorValue(42)).toBe(false);
    expect(isVectorValue('hello')).toBe(false);
    expect(isVectorValue(null)).toBe(false);
  });

  it('returns false for array with non-numeric element', () => {
    expect(isVectorValue([1, 'x', 3])).toBe(false);
  });
});

// ── vecMagnitude ──────────────────────────────────────────────────────────────

describe('vecMagnitude', () => {
  it('returns 0 for zero vector', () => {
    expect(vecMagnitude([0, 0, 0])).toBe(0);
  });

  it('computes L2 magnitude correctly', () => {
    expect(vecMagnitude([3, 4])).toBeCloseTo(5);
  });

  it('handles 6-component stress tensor (Voigt notation)', () => {
    expect(vecMagnitude([1, 0, 0, 0, 0, 0])).toBeCloseTo(1);
  });
});

// ── vecAdd ────────────────────────────────────────────────────────────────────

describe('vecAdd', () => {
  it('adds component-wise', () => {
    expect(vecAdd([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
  });

  it('throws on dimensionality mismatch', () => {
    expect(() => vecAdd([1, 2], [1, 2, 3])).toThrow('dimensionality mismatch');
  });
});

// ── vecComponentMax / vecComponentMin ─────────────────────────────────────────

describe('vecComponentMax', () => {
  it('picks per-component maximum', () => {
    expect(vecComponentMax([1, 5, 2], [3, 2, 4])).toEqual([3, 5, 4]);
  });

  it('is commutative', () => {
    const a = [1.5, -2, 0.3];
    const b = [-0.5, 3, 0.1];
    expect(vecComponentMax(a, b)).toEqual(vecComponentMax(b, a));
  });

  it('throws on dimensionality mismatch', () => {
    expect(() => vecComponentMax([1], [1, 2])).toThrow('dimensionality mismatch');
  });
});

describe('vecComponentMin', () => {
  it('picks per-component minimum', () => {
    expect(vecComponentMin([1, 5, 2], [3, 2, 4])).toEqual([1, 2, 2]);
  });

  it('is commutative', () => {
    const a = [1, -2, 0];
    const b = [-1, 3, 5];
    expect(vecComponentMin(a, b)).toEqual(vecComponentMin(b, a));
  });
});

// ── vecAuthorityPick ──────────────────────────────────────────────────────────

describe('vecAuthorityPick', () => {
  it('picks higher-authority vector', () => {
    const a = [1, 0, 0];
    const b = [0, 0, 1];
    expect(vecAuthorityPick(a, 2.0, b, 1.0)).toBe(a);
    expect(vecAuthorityPick(a, 1.0, b, 2.0)).toBe(b);
  });

  it('tiebreaks by magnitude when authority equal', () => {
    const small = [1, 0, 0]; // mag=1
    const large = [3, 4, 0]; // mag=5
    expect(vecAuthorityPick(small, 1.0, large, 1.0)).toBe(large);
  });

  it('is deterministic (lexicographic final tiebreak)', () => {
    const a = [1, 0]; // mag=1
    const b = [0, 1]; // mag=1
    // Should return the same vector regardless of argument order
    const r1 = vecAuthorityPick(a, 1.0, b, 1.0);
    const r2 = vecAuthorityPick(b, 1.0, a, 1.0);
    expect(r1).toEqual(r2);
  });
});

// ── ProvenanceSemiring vector strategies ──────────────────────────────────────

describe('ProvenanceSemiring — vec-component-max', () => {
  const rules: ConflictResolutionRule[] = [
    { property: 'stressTensor', strategy: 'vec-component-max' },
  ];

  it('merges two stress tensors by component-wise max', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('solver-a', { stressTensor: [10, 5, 2, 1, 0, 3] }),
      trait('solver-b', { stressTensor: [8, 9, 1, 4, 2, 0] }),
    ]);
    expect(result.config.stressTensor).toEqual([10, 9, 2, 4, 2, 3]);
  });

  it('is commutative', () => {
    const ps = semiring(rules);
    const r1 = ps.add([
      trait('a', { stressTensor: [1, 2, 3] }),
      trait('b', { stressTensor: [4, 1, 5] }),
    ]);
    const r2 = ps.add([
      trait('b', { stressTensor: [4, 1, 5] }),
      trait('a', { stressTensor: [1, 2, 3] }),
    ]);
    expect(r1.config.stressTensor).toEqual(r2.config.stressTensor);
  });

  it('records conflict in result', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('a', { stressTensor: [1, 2] }),
      trait('b', { stressTensor: [3, 0] }),
    ]);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it('throws on dimensionality mismatch', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('a', { stressTensor: [1, 2] }),
      trait('b', { stressTensor: [1, 2, 3] }),
    ]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/dimensionality mismatch/);
  });

  it('throws when non-vector value supplied to vector strategy', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('a', { stressTensor: 42 }),
      trait('b', { stressTensor: [1, 2, 3] }),
    ]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/vec-component-max requires VectorValue/);
  });
});

describe('ProvenanceSemiring — vec-component-min', () => {
  const rules: ConflictResolutionRule[] = [
    { property: 'strain', strategy: 'vec-component-min' },
  ];

  it('picks per-component minimum (conservative strain merge)', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('mesh-a', { strain: [0.5, 0.2, 0.8] }),
      trait('mesh-b', { strain: [0.3, 0.9, 0.4] }),
    ]);
    expect(result.config.strain).toEqual([0.3, 0.2, 0.4]);
  });

  it('is commutative', () => {
    const ps = semiring(rules);
    const r1 = ps.add([trait('a', { strain: [1, 2] }), trait('b', { strain: [2, 1] })]);
    const r2 = ps.add([trait('b', { strain: [2, 1] }), trait('a', { strain: [1, 2] })]);
    expect(r1.config.strain).toEqual(r2.config.strain);
  });
});

describe('ProvenanceSemiring — vec-component-sum', () => {
  const rules: ConflictResolutionRule[] = [
    { property: 'velocity', strategy: 'vec-component-sum' },
  ];

  it('sums velocity vectors from multiple force contributors', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('gravity', { velocity: [0, -9.81, 0] }),
      trait('wind', { velocity: [2.5, 0, 0] }),
    ]);
    expect(result.config.velocity).toEqual([2.5, -9.81, 0]);
  });

  it('is commutative', () => {
    const ps = semiring(rules);
    const r1 = ps.add([
      trait('a', { velocity: [1, 2, 3] }),
      trait('b', { velocity: [4, 5, 6] }),
    ]);
    const r2 = ps.add([
      trait('b', { velocity: [4, 5, 6] }),
      trait('a', { velocity: [1, 2, 3] }),
    ]);
    expect(r1.config.velocity).toEqual(r2.config.velocity);
  });

  it('accumulates across three traits', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('a', { velocity: [1, 0, 0] }),
      trait('b', { velocity: [0, 1, 0] }),
      trait('c', { velocity: [0, 0, 1] }),
    ]);
    expect(result.config.velocity).toEqual([1, 1, 1]);
  });
});

describe('ProvenanceSemiring — vec-magnitude-max', () => {
  const rules: ConflictResolutionRule[] = [
    { property: 'displacementField', strategy: 'vec-magnitude-max' },
  ];

  it('picks vector with larger magnitude', () => {
    const ps = semiring(rules);
    const result = ps.add([
      trait('coarse', { displacementField: [1, 0, 0] }),   // mag=1
      trait('fine',   { displacementField: [3, 4, 0] }),   // mag=5
    ]);
    expect(result.config.displacementField).toEqual([3, 4, 0]);
  });

  it('is commutative', () => {
    const ps = semiring(rules);
    const r1 = ps.add([
      trait('a', { displacementField: [3, 4, 0] }),
      trait('b', { displacementField: [1, 0, 0] }),
    ]);
    const r2 = ps.add([
      trait('b', { displacementField: [1, 0, 0] }),
      trait('a', { displacementField: [3, 4, 0] }),
    ]);
    expect(r1.config.displacementField).toEqual(r2.config.displacementField);
  });

  it('uses source-name lexicographic tiebreak for equal magnitudes', () => {
    const ps = semiring(rules);
    const r1 = ps.add([
      trait('alpha', { displacementField: [1, 0, 0] }),
      trait('beta',  { displacementField: [0, 1, 0] }),
    ]);
    const r2 = ps.add([
      trait('beta',  { displacementField: [0, 1, 0] }),
      trait('alpha', { displacementField: [1, 0, 0] }),
    ]);
    expect(r1.config.displacementField).toEqual(r2.config.displacementField);
  });
});

describe('ProvenanceSemiring — vec-authority-weighted', () => {
  const rules: ConflictResolutionRule[] = [
    { property: 'forceField', strategy: 'vec-authority-weighted' },
  ];

  it('picks higher-authority vector', () => {
    const ps = semiring(rules);
    const result = ps.add([
      { name: 'npc-agent', config: { forceField: [1, 0, 0] }, context: { authorityLevel: AuthorityTier.AGENT } },
      { name: 'founder',   config: { forceField: [0, 0, 5] }, context: { authorityLevel: AuthorityTier.FOUNDER } },
    ]);
    expect(result.config.forceField).toEqual([0, 0, 5]);
  });

  it('is commutative', () => {
    const ps = semiring(rules);
    const r1 = ps.add([
      { name: 'high', config: { forceField: [1, 2, 3] }, context: { authorityLevel: 80 } },
      { name: 'low',  config: { forceField: [9, 9, 9] }, context: { authorityLevel: 20 } },
    ]);
    const r2 = ps.add([
      { name: 'low',  config: { forceField: [9, 9, 9] }, context: { authorityLevel: 20 } },
      { name: 'high', config: { forceField: [1, 2, 3] }, context: { authorityLevel: 80 } },
    ]);
    expect(r1.config.forceField).toEqual(r2.config.forceField);
  });
});

// ── Default vector rules ──────────────────────────────────────────────────────

describe('ProvenanceSemiring — default vector rules', () => {
  it('velocity uses vec-component-sum by default', () => {
    const ps = new ProvenanceSemiring(); // default rules
    const result = ps.add([
      trait('gravity', { velocity: [0, -9, 0] }),
      trait('thruster', { velocity: [0, 5, 0] }),
    ]);
    expect(result.config.velocity).toEqual([0, -4, 0]);
  });

  it('stressTensor uses vec-component-max by default', () => {
    const ps = new ProvenanceSemiring();
    const result = ps.add([
      trait('static', { stressTensor: [100, 50, 20, 10, 5, 30] }),
      trait('dynamic', { stressTensor: [80, 90, 15, 40, 2, 0] }),
    ]);
    expect(result.config.stressTensor).toEqual([100, 90, 20, 40, 5, 30]);
  });

  it('displacementField uses vec-magnitude-max by default', () => {
    const ps = new ProvenanceSemiring();
    const result = ps.add([
      trait('small', { displacementField: [1, 0, 0] }),
      trait('large', { displacementField: [0, 3, 4] }), // mag=5
    ]);
    expect(result.config.displacementField).toEqual([0, 3, 4]);
  });
});
