import { describe, it, expect } from 'vitest';
import {
  vec3Normalize,
  vec3NormalizeInPlace,
  vec3Length,
  vec3Cross,
  vec3CrossArray,
  vec3Sub,
  vec3SubArray,
  vec3Add,
  vec3Scale,
  vec3ScaleArray,
  vec3Dot,
  vec3Distance,
  type Vec3,
} from './vec3.js';

describe('vec3 utilities', () => {
  describe('vec3Normalize', () => {
    it('normalizes a unit vector', () => {
      const v: Vec3 = [1, 0, 0];
      const result = vec3Normalize(v);
      expect(result).toEqual([1, 0, 0]);
      expect(vec3Length(result)).toBeCloseTo(1, 6);
    });

    it('normalizes a non-unit vector', () => {
      const v: Vec3 = [3, 4, 0];
      const result = vec3Normalize(v);
      expect(result).toEqual([0.6, 0.8, 0]);
      expect(vec3Length(result)).toBeCloseTo(1, 6);
    });

    it('handles zero vector', () => {
      const v: Vec3 = [0, 0, 0];
      const result = vec3Normalize(v);
      expect(result).toEqual([0, 0, 0]);
    });
  });

  describe('vec3NormalizeInPlace', () => {
    it('normalizes vector in-place and returns original length', () => {
      const v = [3, 4, 0];
      const originalLength = vec3NormalizeInPlace(v);

      expect(originalLength).toBe(5);
      expect(v).toEqual([0.6, 0.8, 0]);
      expect(Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])).toBeCloseTo(1, 6);
    });

    it('handles very small vectors', () => {
      const v = [1e-10, 1e-10, 1e-10];
      const originalLength = vec3NormalizeInPlace(v);

      expect(originalLength).toBeCloseTo(Math.sqrt(3) * 1e-10, 15);
      // Vector should remain unchanged due to threshold
      expect(v).toEqual([1e-10, 1e-10, 1e-10]);
    });
  });

  describe('vec3Length', () => {
    it('calculates length correctly', () => {
      expect(vec3Length([3, 4, 0])).toBe(5);
      expect(vec3Length([1, 1, 1])).toBeCloseTo(Math.sqrt(3), 6);
      expect(vec3Length([0, 0, 0])).toBe(0);
    });
  });

  describe('vec3Cross', () => {
    it('calculates cross product correctly', () => {
      const a: Vec3 = [1, 0, 0];
      const b: Vec3 = [0, 1, 0];
      const result = vec3Cross(a, b);
      expect(result).toEqual([0, 0, 1]);
    });

    it('handles array version', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const result = vec3CrossArray(a, b);
      expect(result).toEqual([0, 0, 1]);
    });
  });

  describe('vec3Sub', () => {
    it('subtracts vectors correctly', () => {
      const a: Vec3 = [5, 3, 1];
      const b: Vec3 = [2, 1, 1];
      expect(vec3Sub(a, b)).toEqual([3, 2, 0]);
    });

    it('handles array version', () => {
      const a = [5, 3, 1];
      const b = [2, 1, 1];
      expect(vec3SubArray(a, b)).toEqual([3, 2, 0]);
    });
  });

  describe('vec3Add', () => {
    it('adds vectors correctly', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [4, 5, 6];
      expect(vec3Add(a, b)).toEqual([5, 7, 9]);
    });
  });

  describe('vec3Scale', () => {
    it('scales vectors correctly', () => {
      const v: Vec3 = [1, 2, 3];
      expect(vec3Scale(v, 2)).toEqual([2, 4, 6]);
    });

    it('handles array version', () => {
      const v = [1, 2, 3];
      expect(vec3ScaleArray(v, 2)).toEqual([2, 4, 6]);
    });
  });

  describe('vec3Dot', () => {
    it('calculates dot product correctly', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [4, 5, 6];
      expect(vec3Dot(a, b)).toBe(32); // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    });

    it('handles perpendicular vectors', () => {
      const a: Vec3 = [1, 0, 0];
      const b: Vec3 = [0, 1, 0];
      expect(vec3Dot(a, b)).toBe(0);
    });
  });

  describe('vec3Distance', () => {
    it('calculates distance between two vectors', () => {
      const a: Vec3 = [0, 0, 0];
      const b: Vec3 = [3, 4, 0];
      expect(vec3Distance(a, b)).toBe(5);
    });

    it('handles same vector (zero distance)', () => {
      const a: Vec3 = [1, 2, 3];
      const b: Vec3 = [1, 2, 3];
      expect(vec3Distance(a, b)).toBe(0);
    });

    it('calculates 3D distance correctly', () => {
      const a: Vec3 = [1, 1, 1];
      const b: Vec3 = [4, 5, 5];
      expect(vec3Distance(a, b)).toBeCloseTo(Math.sqrt(9 + 16 + 16), 6); // sqrt(3² + 4² + 4²) = sqrt(41)
    });
  });
});
