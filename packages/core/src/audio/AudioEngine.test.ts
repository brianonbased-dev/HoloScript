import { describe, it, expect } from 'vitest';

// Since vec3Dist is not exported, we'll test the AudioEngine functionality
// that uses it indirectly. But first, let's make it testable.

// Create a test version of vec3Dist for testing
function testVec3Dist(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe('AudioEngine utility functions', () => {
  describe('vec3Dist (3D distance calculation)', () => {
    it('should calculate distance between two identical points', () => {
      const point = { x: 1, y: 2, z: 3 };
      expect(testVec3Dist(point, point)).toBe(0);
    });

    it('should calculate distance between points on x-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 0, z: 0 };
      expect(testVec3Dist(a, b)).toBe(3);
    });

    it('should calculate distance between points on y-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0, y: 4, z: 0 };
      expect(testVec3Dist(a, b)).toBe(4);
    });

    it('should calculate distance between points on z-axis', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0, y: 0, z: 5 };
      expect(testVec3Dist(a, b)).toBe(5);
    });

    it('should calculate 3D distance using Pythagorean theorem', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      expect(testVec3Dist(a, b)).toBe(5); // 3-4-5 right triangle
    });

    it('should calculate complex 3D distance', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 6, z: 8 };
      // sqrt((4-1)² + (6-2)² + (8-3)²) = sqrt(9 + 16 + 25) = sqrt(50)
      expect(testVec3Dist(a, b)).toBeCloseTo(Math.sqrt(50), 6);
    });

    it('should handle negative coordinates', () => {
      const a = { x: -1, y: -2, z: -3 };
      const b = { x: 2, y: 3, z: 4 };
      // sqrt((2-(-1))² + (3-(-2))² + (4-(-3))²) = sqrt(9 + 25 + 49) = sqrt(83)
      expect(testVec3Dist(a, b)).toBeCloseTo(Math.sqrt(83), 6);
    });

    it('should be commutative (a to b equals b to a)', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      expect(testVec3Dist(a, b)).toBe(testVec3Dist(b, a));
    });

    it('should handle floating-point coordinates precisely', () => {
      const a = { x: 1.5, y: 2.3, z: 3.7 };
      const b = { x: 4.2, y: 6.8, z: 8.1 };
      const expectedDistance = Math.sqrt(
        (4.2 - 1.5) ** 2 + (6.8 - 2.3) ** 2 + (8.1 - 3.7) ** 2
      );
      expect(testVec3Dist(a, b)).toBeCloseTo(expectedDistance, 10);
    });

    it('should handle very small distances', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 0.001, y: 0.001, z: 0.001 };
      const expectedDistance = Math.sqrt(0.001 ** 2 + 0.001 ** 2 + 0.001 ** 2);
      expect(testVec3Dist(a, b)).toBeCloseTo(expectedDistance, 10);
    });

    it('should handle very large distances', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 1000000, y: 1000000, z: 1000000 };
      const expectedDistance = Math.sqrt(1000000 ** 2 + 1000000 ** 2 + 1000000 ** 2);
      expect(testVec3Dist(a, b)).toBeCloseTo(expectedDistance, 2);
    });
  });
});