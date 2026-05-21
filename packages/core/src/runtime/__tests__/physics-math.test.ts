import { describe, it, expect } from 'vitest';
import { calculateArc, stepLoveRK4, integrateLove, type LoveState } from '../physics-math';

describe('calculateArc', () => {
  describe('degenerate case: start ≈ end (horizontal dist < 0.1)', () => {
    it('returns [0, speed, 0] when start equals end', () => {
      const result = calculateArc([0, 0, 0], [0, 0, 0], 5);
      expect(result).toEqual([0, 5, 0]);
    });

    it('returns [0, speed, 0] when horizontal dist < 0.1', () => {
      const result = calculateArc([0, 0, 0], [0.05, 0, 0.05], 10);
      expect(result).toEqual([0, 10, 0]);
    });
  });

  describe('normal arc calculation', () => {
    it('computes velocity for a horizontal shot (same Y)', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [10, 0, 0];
      const speed = 5;
      const [vx, vy, vz] = calculateArc(start, end, speed);

      expect(vx).toBeCloseTo(5);
      expect(vz).toBeCloseTo(0);
      expect(vy).toBeCloseTo(9.81);
    });

    it('computes velocity for a diagonal shot', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [3, 0, 4];
      const speed = 5;
      const [vx, vy, vz] = calculateArc(start, end, speed);

      expect(vx).toBeCloseTo(3);
      expect(vz).toBeCloseTo(4);
      expect(vy).toBeCloseTo(4.905);
    });

    it('accounts for positive Y displacement (shooting uphill)', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [10, 5, 0];
      const speed = 5;
      const [, vy] = calculateArc(start, end, speed);
      expect(vy).toBeCloseTo(12.31);
    });

    it('accounts for negative Y displacement (shooting downhill)', () => {
      const start: [number, number, number] = [0, 5, 0];
      const end: [number, number, number] = [10, 0, 0];
      const speed = 5;
      const [, vy] = calculateArc(start, end, speed);
      expect(vy).toBeCloseTo(7.31);
    });

    it('returns a 3-element tuple', () => {
      const result = calculateArc([0, 0, 0], [10, 0, 0], 5);
      expect(result).toHaveLength(3);
    });

    it('scales vx/vz proportionally with speed', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [10, 0, 0];

      const [vx1] = calculateArc(start, end, 5);
      const [vx2] = calculateArc(start, end, 10);

      expect(vx1).toBeCloseTo(5);
      expect(vx2).toBeCloseTo(10);
    });
  });
});

describe('love dynamics (RK4 romantic ODE for social simulation domain)', () => {
  it('stepLoveRK4 produces a new state vector without NaN or explosion', () => {
    const initial: LoveState = [0.5, 0.1, 0.6, 0.4, 0.3];
    const next = stepLoveRK4(initial, 0.1);
    expect(next.length).toBe(5);
    next.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  it('integrateLove yields a stable bondScore in [0,1] after many steps', () => {
    const initial: LoveState = [0.4, 0.2, 0.5, 0.3, 0.2];
    const { bondScore } = integrateLove(initial, 200, 0.05);
    expect(bondScore).toBeGreaterThanOrEqual(0);
    expect(bondScore).toBeLessThanOrEqual(1);
  });

  it('higher commitment and lower jealousy produce higher or equal bond scores (sanity)', () => {
    const low = integrateLove([0.3, 0.4, 0.3, 0.3, 0.2], 100).bondScore;
    const high = integrateLove([0.7, 0.05, 0.7, 0.6, 0.8], 100).bondScore;
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
