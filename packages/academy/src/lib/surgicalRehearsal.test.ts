import { describe, it, expect } from 'vitest';
import { distance3D, distanceToSegment, Vec3 } from './surgicalRehearsal';

describe('surgicalRehearsal', () => {
  describe('distance3D', () => {
    it('should calculate distance between two identical points', () => {
      const point = { x: 1, y: 2, z: 3 };
      expect(distance3D(point, point)).toBe(0);
    });

    it('should calculate distance between points on x-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 0, z: 0 };
      expect(distance3D(a, b)).toBe(3);
    });

    it('should calculate distance between points on y-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0, y: 4, z: 0 };
      expect(distance3D(a, b)).toBe(4);
    });

    it('should calculate distance between points on z-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0, y: 0, z: 5 };
      expect(distance3D(a, b)).toBe(5);
    });

    it('should calculate 3D distance using Pythagorean theorem', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      expect(distance3D(a, b)).toBe(5); // 3-4-5 right triangle
    });

    it('should calculate complex 3D distance', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 6, z: 8 };
      // sqrt((4-1)² + (6-2)² + (8-3)²) = sqrt(9 + 16 + 25) = sqrt(50)
      expect(distance3D(a, b)).toBeCloseTo(Math.sqrt(50), 6);
    });

    it('should handle negative coordinates', () => {
      const a = { x: -1, y: -2, z: -3 };
      const b = { x: 2, y: 3, z: 4 };
      // sqrt((2-(-1))² + (3-(-2))² + (4-(-3))²) = sqrt(9 + 25 + 49) = sqrt(83)
      expect(distance3D(a, b)).toBeCloseTo(Math.sqrt(83), 6);
    });

    it('should be commutative (a to b equals b to a)', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      expect(distance3D(a, b)).toBe(distance3D(b, a));
    });
  });

  describe('distanceToSegment', () => {
    it('should calculate distance to point on segment', () => {
      const p = { x: 1, y: 1, z: 0 };
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 2, y: 2, z: 0 };
      expect(distanceToSegment(p, a, b)).toBeCloseTo(0, 6);
    });

    it('should calculate perpendicular distance to segment', () => {
      const p = { x: 1, y: 2, z: 0 };
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 2, y: 0, z: 0 };
      expect(distanceToSegment(p, a, b)).toBe(2);
    });

    it('should calculate distance to nearest endpoint when point projects outside segment', () => {
      const p = { x: 3, y: 0, z: 0 };
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 1, y: 0, z: 0 };
      expect(distanceToSegment(p, a, b)).toBe(2); // distance to point b
    });
  });
});
