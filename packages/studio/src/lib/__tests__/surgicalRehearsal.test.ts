import { describe, it, expect } from 'vitest';
import { distance3D, type Vec3 } from '../surgicalRehearsal';

describe('surgicalRehearsal', () => {
  describe('distance3D', () => {
    it('calculates distance between two points correctly', () => {
      const pointA: Vec3 = { x: 0, y: 0, z: 0 };
      const pointB: Vec3 = { x: 3, y: 4, z: 0 };
      
      // Should be 5 (3-4-5 triangle)
      expect(distance3D(pointA, pointB)).toBe(5);
    });

    it('returns 0 for identical points', () => {
      const point: Vec3 = { x: 1.5, y: 2.7, z: -3.2 };
      
      expect(distance3D(point, point)).toBe(0);
    });

    it('handles negative coordinates correctly', () => {
      const pointA: Vec3 = { x: -1, y: -1, z: -1 };
      const pointB: Vec3 = { x: 1, y: 1, z: 1 };
      
      // Distance should be sqrt((2)^2 + (2)^2 + (2)^2) = sqrt(12) ≈ 3.464
      expect(distance3D(pointA, pointB)).toBeCloseTo(3.464, 3);
    });

    it('works with floating-point precision', () => {
      const pointA: Vec3 = { x: 0.1, y: 0.2, z: 0.3 };
      const pointB: Vec3 = { x: 0.4, y: 0.6, z: 0.9 };
      
      // Distance = sqrt(0.3^2 + 0.4^2 + 0.6^2) = sqrt(0.09 + 0.16 + 0.36) = sqrt(0.61)
      const expected = Math.sqrt(0.61);
      expect(distance3D(pointA, pointB)).toBeCloseTo(expected, 6);
    });

    it('handles large coordinate values', () => {
      const pointA: Vec3 = { x: 1000, y: 2000, z: 3000 };
      const pointB: Vec3 = { x: 1001, y: 2001, z: 3001 };
      
      // Distance = sqrt(1^2 + 1^2 + 1^2) = sqrt(3)
      expect(distance3D(pointA, pointB)).toBeCloseTo(Math.sqrt(3), 6);
    });

    it('is commutative (distance(a,b) equals distance(b,a))', () => {
      const pointA: Vec3 = { x: 5, y: -2, z: 8 };
      const pointB: Vec3 = { x: -3, y: 7, z: 1 };
      
      expect(distance3D(pointA, pointB)).toBe(distance3D(pointB, pointA));
    });

    it('handles edge case of very small distances', () => {
      const pointA: Vec3 = { x: 0, y: 0, z: 0 };
      const pointB: Vec3 = { x: 1e-10, y: 1e-10, z: 1e-10 };
      
      const expected = Math.sqrt(3) * 1e-10;
      expect(distance3D(pointA, pointB)).toBeCloseTo(expected, 15);
    });

    it('handles surgical precision coordinates (sub-millimeter)', () => {
      // Simulating precision needed for microsurgery
      const instrumentTip: Vec3 = { x: 12.345, y: 67.891, z: -23.456 };
      const targetPoint: Vec3 = { x: 12.346, y: 67.892, z: -23.455 };
      
      // Very small distance for surgical precision
      const distance = distance3D(instrumentTip, targetPoint);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.002); // Less than 2mm
    });
  });
});