import { describe, expect, it } from 'vitest';
import {
  ERDOS_STRAUS_V1,
  findEqualUnitFraction,
  findErdosStrausDecomposition,
  runErdosStrausConjecture,
  verifyErdosStraus,
} from '../NumberTheoryConjecture';

describe('Erdős–Straus number-theory conjecture sub-class', () => {
  it('verifyErdosStraus does an exact integer check', () => {
    // 4/2 = 2 = 1/1 + 1/2 + 1/2
    expect(verifyErdosStraus(2, 1, 2, 2)).toBe(true);
    // 4/3 = 1/1 + 1/4 + 1/12
    expect(verifyErdosStraus(3, 1, 4, 12)).toBe(true);
    // wrong decomposition rejected
    expect(verifyErdosStraus(3, 1, 4, 13)).toBe(false);
    // non-positive rejected
    expect(verifyErdosStraus(5, 0, 1, 1)).toBe(false);
  });

  it('finds a valid decomposition for every n in 2..100 (within bound)', () => {
    for (let n = 2; n <= 100; n++) {
      const d = findErdosStrausDecomposition(n, 4000);
      expect(d, `n=${n} should have a decomposition`).not.toBeNull();
      if (d) {
        expect(verifyErdosStraus(d.n, d.x, d.y, d.z)).toBe(true);
        expect(d.x).toBeLessThanOrEqual(d.y);
        expect(d.y).toBeLessThanOrEqual(d.z);
      }
    }
  });

  it('the equal-denominator falsifier discovers counterexamples', () => {
    // 4/n = 3/x integer only when 4 | n. n=5 (not div by 4) is a counterexample.
    expect(findEqualUnitFraction(5)).toBeNull();
    expect(findEqualUnitFraction(8)).toBe(6); // 4/8 = 1/2 = 3/6
    expect(verifyEqual(8, 6)).toBe(true);
  });

  it('runErdosStrausConjecture passes its gate: survivor survives + falsifier discovered', () => {
    const receipt = runErdosStrausConjecture({ minN: 2, maxN: 50, searchBound: 4000 });

    expect(receipt.solverType).toBe(ERDOS_STRAUS_V1);
    expect(receipt.scenarios).toHaveLength(2);

    const survivor = receipt.scenarios.find((s) => s.role === 'survivor')!;
    const falsifier = receipt.scenarios.find((s) => s.role === 'falsifier')!;

    expect(survivor.status).toBe('survived');
    expect(survivor.evaluations.every((e) => e.status === 'pass')).toBe(true);

    expect(falsifier.status).toBe('falsified');
    expect(falsifier.counterexamples.length).toBeGreaterThan(0);
    // n=5 must be among the discovered counterexamples.
    expect(falsifier.counterexamples.some((c) => c.n === 5)).toBe(true);

    expect(receipt.gate.passed).toBe(true);
    expect(receipt.gate.undecidedCount).toBe(0);
  });

  it('is deterministic — identical receipt key across runs', () => {
    const a = runErdosStrausConjecture({ minN: 2, maxN: 50 });
    const b = runErdosStrausConjecture({ minN: 2, maxN: 50 });
    expect(a.receiptKey).toBe(b.receiptKey);
  });

  it('reports undecided (not falsified) when the search bound is too tight', () => {
    // A pathological tiny bound forces honest "undecided" on hard cases.
    const receipt = runErdosStrausConjecture({ minN: 2, maxN: 50, searchBound: 3 });
    const survivor = receipt.scenarios.find((s) => s.role === 'survivor')!;
    // Absence within the bound is undecided, never a counterexample to the true conjecture.
    expect(['survived', 'undecided']).toContain(survivor.status);
    expect(survivor.counterexamples).toHaveLength(0);
  });

  it('rejects invalid ranges', () => {
    expect(() => runErdosStrausConjecture({ minN: 1, maxN: 10 })).toThrow();
    expect(() => runErdosStrausConjecture({ minN: 10, maxN: 5 })).toThrow();
  });
});

// local helper mirroring the engine's exact check for the equal-denominator form
function verifyEqual(n: number, x: number): boolean {
  return 4 * x === 3 * n;
}
