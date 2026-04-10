/**
 * surgicalRehearsal.test.ts — Tests for Surgical Rehearsal Engine
 */

import { describe, it, expect } from 'vitest';
import { distance3D, Vec3 } from '../lib/surgicalRehearsal';

describe('surgicalRehearsal', () => {
  describe('distance3D', () => {
    it('should calculate distance between two points correctly', () => {
      const pointA: Vec3 = { x: 0, y: 0, z: 0 };
      const pointB: Vec3 = { x: 3, y: 4, z: 0 };

      const result = distance3D(pointA, pointB);
      expect(result).toBe(5); // 3-4-5 triangle
    });

    it('should handle identical points', () => {
      const point: Vec3 = { x: 1, y: 2, z: 3 };

      const result = distance3D(point, point);
      expect(result).toBe(0);
    });

    it('should calculate 3D distance correctly', () => {
      const pointA: Vec3 = { x: 1, y: 1, z: 1 };
      const pointB: Vec3 = { x: 4, y: 5, z: 1 };

      const result = distance3D(pointA, pointB);
      expect(result).toBe(5); // sqrt((4-1)^2 + (5-1)^2 + (1-1)^2) = sqrt(9 + 16 + 0) = 5
    });

    it('should handle negative coordinates', () => {
      const pointA: Vec3 = { x: -1, y: -1, z: -1 };
      const pointB: Vec3 = { x: 2, y: 2, z: 2 };

      const result = distance3D(pointA, pointB);
      expect(result).toBeCloseTo(5.196, 3); // sqrt(3^2 + 3^2 + 3^2) = sqrt(27) ≈ 5.196
    });

    it('should handle decimal values', () => {
      const pointA: Vec3 = { x: 0.5, y: 1.5, z: 2.5 };
      const pointB: Vec3 = { x: 3.5, y: 4.5, z: 2.5 };

      const result = distance3D(pointA, pointB);
      expect(result).toBeCloseTo(4.243, 3); // sqrt(3^2 + 3^2 + 0^2) = sqrt(18) ≈ 4.243
    });

    it('should handle large numbers', () => {
      const pointA: Vec3 = { x: 1000, y: 2000, z: 3000 };
      const pointB: Vec3 = { x: 1001, y: 2001, z: 3001 };

      const result = distance3D(pointA, pointB);
      expect(result).toBeCloseTo(1.732, 3); // sqrt(1^2 + 1^2 + 1^2) = sqrt(3) ≈ 1.732
    });
  });
});
