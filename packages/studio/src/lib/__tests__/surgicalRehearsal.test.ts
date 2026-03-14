/**
 * surgicalRehearsal.test.ts — Tests for Surgical Rehearsal Engine
 *
 * Tests for 3D distance calculations, instrument tracking, and
 * surgical procedure simulation functions.
 */

import { describe, it, expect } from 'vitest';
import { distance3D, distanceToSegment, Vec3 } from '../surgicalRehearsal';

describe('surgicalRehearsal', () => {
  describe('distance3D', () => {
    it('calculates distance between two identical points', () => {
      const point = { x: 1, y: 2, z: 3 };
      expect(distance3D(point, point)).toBe(0);
    });

    it('calculates distance along x-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 0, z: 0 };
      expect(distance3D(a, b)).toBe(3);
    });

    it('calculates distance along y-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0, y: 4, z: 0 };
      expect(distance3D(a, b)).toBe(4);
    });

    it('calculates distance along z-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0, y: 0, z: 5 };
      expect(distance3D(a, b)).toBe(5);
    });

    it('calculates 3D distance using Pythagorean theorem', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      expect(distance3D(a, b)).toBe(5); // 3-4-5 right triangle
    });

    it('calculates distance with negative coordinates', () => {
      const a = { x: -1, y: -2, z: -3 };
      const b = { x: 2, y: 1, z: 1 };
      const expected = Math.sqrt((2-(-1))**2 + (1-(-2))**2 + (1-(-3))**2); // sqrt(9 + 9 + 16) = sqrt(34)
      expect(distance3D(a, b)).toBeCloseTo(expected);
    });

    it('calculates distance with decimal coordinates', () => {
      const a = { x: 1.5, y: 2.5, z: 3.5 };
      const b = { x: 4.5, y: 6.5, z: 7.5 };
      const expected = Math.sqrt(3**2 + 4**2 + 4**2); // sqrt(9 + 16 + 16) = sqrt(41)
      expect(distance3D(a, b)).toBeCloseTo(expected);
    });

    it('handles large coordinate values', () => {
      const a = { x: 1000, y: 2000, z: 3000 };
      const b = { x: 4000, y: 6000, z: 7000 };
      const expected = Math.sqrt(3000**2 + 4000**2 + 4000**2);
      expect(distance3D(a, b)).toBeCloseTo(expected);
    });

    it('calculates surgical instrument precision distances', () => {
      // Simulate instrument tip to target organ precision (millimeter scale)
      const instrumentTip = { x: 12.345, y: 23.456, z: 34.567 };
      const organTarget = { x: 12.346, y: 23.457, z: 34.568 };
      const distance = distance3D(instrumentTip, organTarget);
      
      // Distance should be very small (sub-millimeter)
      expect(distance).toBeLessThan(0.01);
      expect(distance).toBeCloseTo(0.00173, 5);
    });
  });

  describe('distanceToSegment', () => {
    it('calculates distance to segment endpoint when projection is beyond segment', () => {
      const p = { x: 0, y: 0, z: 0 };
      const a = { x: 1, y: 0, z: 0 };
      const b = { x: 2, y: 0, z: 0 };
      
      // Point projects beyond segment, so distance is to closest endpoint
      expect(distanceToSegment(p, a, b)).toBe(1);
    });

    it('handles degenerate segment (a == b)', () => {
      const p = { x: 0, y: 0, z: 0 };
      const a = { x: 1, y: 1, z: 1 };
      const b = { x: 1, y: 1, z: 1 }; // Same as a
      
      // Should return distance from p to a (or b, since they're the same)
      const expected = Math.sqrt(3); // sqrt(1^2 + 1^2 + 1^2)
      expect(distanceToSegment(p, a, b)).toBeCloseTo(expected);
    });

    it('calculates perpendicular distance to segment', () => {
      const p = { x: 0, y: 1, z: 0 };
      const a = { x: -1, y: 0, z: 0 };
      const b = { x: 1, y: 0, z: 0 };
      
      // Point is directly above the middle of horizontal segment
      expect(distanceToSegment(p, a, b)).toBe(1);
    });
  });
});