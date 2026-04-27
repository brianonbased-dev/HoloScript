import { describe, it, expect } from 'vitest';
import { calculateArc } from '../physics-math';

describe('calculateArc', () => {
  describe('degenerate case: start ≈ end (horizontal dist < 0.1)', () => {
    it('returns [0, speed, 0] when start equals end', () => {
      const result = calculateArc([0, 0, 0], [0, 0, 0], 5);
      expect(result).toEqual([0, 5, 0]);
    });

    it('returns [0, speed, 0] when horizontal dist < 0.1', () => {
      const result = calculateArc([0, 0, 0], [0.05, 0, 0.05], 10);
      // dist ≈ 0.07 < 0.1 → degenerate
      expect(result).toEqual([0, 10, 0]);
    });
  });

  describe('normal arc calculation', () => {
    it('computes velocity for a horizontal shot (same Y)', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [10, 0, 0];
      const speed = 5;
      const [vx, vy, vz] = calculateArc(start, end, speed);

      // Horizontal distance = 10, speed = 5, t = 2
      // vx = 10 / 2 = 5
      expect(vx).toBeCloseTo(5);
      // vz = 0 (no z displacement)
      expect(vz).toBeCloseTo(0);
      // vy = 0/2 + 0.5 * 9.81 * 2 = 9.81
      expect(vy).toBeCloseTo(9.81);
    });

    it('computes velocity for a diagonal shot', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [3, 0, 4]; // dist = 5
      const speed = 5;
      const [vx, vy, vz] = calculateArc(start, end, speed);

      // t = dist/speed = 5/5 = 1
      expect(vx).toBeCloseTo(3); // dx/t = 3/1
      expect(vz).toBeCloseTo(4); // dz/t = 4/1
      // vy = 0 + 0.5 * 9.81 * 1 = 4.905
      expect(vy).toBeCloseTo(4.905);
    });

    it('accounts for positive Y displacement (shooting uphill)', () => {
      const start: [number, number, number] = [0, 0, 0];
      const end: [number, number, number] = [10, 5, 0];
      const speed = 5;
      const [, vy] = calculateArc(start, end, speed);

      // t = 10/5 = 2
      // vy = 5/2 + 0.5 * 9.81 * 2 = 2.5 + 9.81 = 12.31
      expect(vy).toBeCloseTo(12.31);
    });

    it('accounts for negative Y displacement (shooting downhill)', () => {
      const start: [number, number, number] = [0, 5, 0];
      const end: [number, number, number] = [10, 0, 0];
      const speed = 5;
      const [, vy] = calculateArc(start, end, speed);

      // t = 10/5 = 2, dy = -5
      // vy = -5/2 + 0.5 * 9.81 * 2 = -2.5 + 9.81 = 7.31
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

      // t1 = 2, vx1 = 10/2 = 5; t2 = 1, vx2 = 10/1 = 10
      expect(vx1).toBeCloseTo(5);
      expect(vx2).toBeCloseTo(10);
    });
  });
});
