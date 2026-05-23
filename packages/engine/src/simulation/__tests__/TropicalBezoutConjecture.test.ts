import { describe, expect, it } from 'vitest';
import {
  TROPICAL_BEZOUT_V1,
  convexHull,
  degreeTriangle,
  minkowskiSum,
  mixedVolume2D,
  runTropicalBezoutConjecture,
  twiceArea,
  type LatticePoint,
} from '../TropicalBezoutConjecture';

describe('Tropical-Bézout (BKK) string-math conjecture sub-class', () => {
  it('twiceArea of the degree-d triangle is d^2 (exact integer)', () => {
    for (const d of [1, 2, 3, 5, 7]) {
      expect(twiceArea(degreeTriangle(d))).toBe(d * d);
    }
  });

  it('convexHull of T_2 ⊕ T_3 vertex-sums is the triangle T_5', () => {
    const hull = minkowskiSum(degreeTriangle(2), degreeTriangle(3));
    // T_5 has vertices (0,0),(5,0),(0,5) — 3 hull points, twiceArea 25.
    expect(hull).toHaveLength(3);
    expect(twiceArea(hull)).toBe(25);
  });

  it('convexHull discards interior and collinear points', () => {
    const pts: LatticePoint[] = [
      [0, 0],
      [1, 0],
      [2, 0], // collinear on the bottom edge
      [0, 2],
      [1, 1], // interior
      [2, 2],
    ];
    const hull = convexHull(pts);
    // hull is the square-ish boundary; interior (1,1) and collinear (1,0) excluded
    expect(hull.some((p) => p[0] === 1 && p[1] === 1)).toBe(false);
  });

  it('mixedVolume2D(T_d1, T_d2) equals classical Bézout d1·d2 — computed for real', () => {
    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = 1; d2 <= 8; d2++) {
        expect(mixedVolume2D(degreeTriangle(d1), degreeTriangle(d2)), `MV(${d1},${d2})`).toBe(
          d1 * d2,
        );
      }
    }
  });

  it('runTropicalBezoutConjecture passes its gate: survivor survives + falsifier discovered', () => {
    const receipt = runTropicalBezoutConjecture({ maxDegree: 6 });

    expect(receipt.solverType).toBe(TROPICAL_BEZOUT_V1);
    expect(receipt.scenarios).toHaveLength(2);

    const survivor = receipt.scenarios.find((s) => s.role === 'survivor')!;
    const falsifier = receipt.scenarios.find((s) => s.role === 'falsifier')!;

    expect(survivor.status).toBe('survived');
    expect(survivor.evaluations.every((e) => e.status === 'pass')).toBe(true);
    expect(survivor.counterexamples).toHaveLength(0);

    expect(falsifier.status).toBe('falsified');
    expect(falsifier.counterexamples.length).toBeGreaterThan(0);
    // (2,2) is the only pair where d1·d2 == d1+d2, so it is NOT a counterexample.
    expect(falsifier.counterexamples.some((c) => c.d1 === 2 && c.d2 === 2)).toBe(false);
    // (2,3) IS a counterexample to the false sum-claim (6 != 5).
    expect(falsifier.counterexamples.some((c) => c.d1 === 2 && c.d2 === 3)).toBe(true);

    expect(receipt.gate.passed).toBe(true);
  });

  it('is deterministic — identical receipt key across runs', () => {
    const a = runTropicalBezoutConjecture({ maxDegree: 6 });
    const b = runTropicalBezoutConjecture({ maxDegree: 6 });
    expect(a.receiptKey).toBe(b.receiptKey);
  });

  it('rejects invalid degree', () => {
    expect(() => runTropicalBezoutConjecture({ maxDegree: 0 })).toThrow();
    expect(() => degreeTriangle(0)).toThrow();
  });
});
