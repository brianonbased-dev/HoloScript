/**
 * Vector3 Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect } from 'vitest';
import { Vector3 } from '../Vector3';

describe('Vector3', () => {
  describe('construction', () => {
    it('should create with default values', () => {
      const v = new Vector3();
      expect(v[0]).toBe(0);
      expect(v[1]).toBe(0);
      expect(v[2]).toBe(0);
    });

    it('should create with specified values', () => {
      const v = new Vector3(1, 2, 3);
      expect(v[0]).toBe(1);
      expect(v[1]).toBe(2);
      expect(v[2]).toBe(3);
    });

    it('should create from array', () => {
      const v = Vector3.fromArray([1, 2, 3]);
      expect(v[0]).toBe(1);
      expect(v[1]).toBe(2);
      expect(v[2]).toBe(3);
    });

    it('should create zero vector', () => {
      const v = Vector3.zero();
      expect(v[0]).toBe(0);
      expect(v[1]).toBe(0);
      expect(v[2]).toBe(0);
    });

    it('should create one vector', () => {
      const v = Vector3.one();
      expect(v[0]).toBe(1);
      expect(v[1]).toBe(1);
      expect(v[2]).toBe(1);
    });
  });

  describe('arithmetic', () => {
    it('should add vectors', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      const result = a.add(b);
      expect(result[0]).toBe(5);
      expect(result[1]).toBe(7);
      expect(result[2]).toBe(9);
    });

    it('should subtract vectors', () => {
      const a = new Vector3(4, 5, 6);
      const b = new Vector3(1, 2, 3);
      const result = a.subtract(b);
      expect(result[0]).toBe(3);
      expect(result[1]).toBe(3);
      expect(result[2]).toBe(3);
    });

    it('should multiply by scalar', () => {
      const v = new Vector3(1, 2, 3);
      const result = v.multiply(2);
      expect(result[0]).toBe(2);
      expect(result[1]).toBe(4);
      expect(result[2]).toBe(6);
    });

    it('should divide by scalar', () => {
      const v = new Vector3(2, 4, 6);
      const result = v.divide(2);
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(2);
      expect(result[2]).toBe(3);
    });

    it('should handle divide by zero', () => {
      const v = new Vector3(2, 4, 6);
      const result = v.divide(0);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
    });
  });

  describe('magnitude', () => {
    it('should calculate magnitude', () => {
      const v = new Vector3(3, 4, 0);
      expect(v.magnitude()).toBe(5);
    });

    it('should calculate squared magnitude', () => {
      const v = new Vector3(3, 4, 0);
      expect(v.magnitudeSquared()).toBe(25);
    });

    it('should normalize vector', () => {
      const v = new Vector3(3, 4, 0);
      const normalized = v.normalize();
      expect(normalized[0]).toBeCloseTo(0.6);
      expect(normalized[1]).toBeCloseTo(0.8);
      expect(normalized[2]).toBe(0);
      expect(normalized.magnitude()).toBeCloseTo(1);
    });

    it('should handle normalize of zero vector', () => {
      const v = Vector3.zero();
      const normalized = v.normalize();
      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBe(0);
      expect(normalized[2]).toBe(0);
    });
  });

  describe('products', () => {
    it('should calculate dot product', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      expect(a.dot(b)).toBe(32);
    });

    it('should calculate cross product', () => {
      const a = new Vector3(1, 0, 0);
      const b = new Vector3(0, 1, 0);
      const cross = a.cross(b);
      expect(cross[0]).toBe(0);
      expect(cross[1]).toBe(0);
      expect(cross[2]).toBe(1);
    });
  });

  describe('distance', () => {
    it('should calculate distance between vectors', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(3, 4, 0);
      expect(a.distanceTo(b)).toBe(5);
    });

    it('should calculate squared distance', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(3, 4, 0);
      expect(a.distanceToSquared(b)).toBe(25);
    });
  });

  describe('interpolation', () => {
    it('should lerp between vectors', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(10, 10, 10);
      const result = a.lerp(b, 0.5);
      expect(result[0]).toBe(5);
      expect(result[1]).toBe(5);
      expect(result[2]).toBe(5);
    });

    it('should lerp at t=0', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(10, 10, 10);
      const result = a.lerp(b, 0);
      expect(result.equals(a)).toBe(true);
    });

    it('should lerp at t=1', () => {
      const a = new Vector3(0, 0, 0);
      const b = new Vector3(10, 10, 10);
      const result = a.lerp(b, 1);
      expect(result.equals(b)).toBe(true);
    });
  });

  describe('clamp', () => {
    it('should clamp magnitude when exceeding max', () => {
      const v = new Vector3(10, 0, 0);
      const clamped = v.clampMagnitude(5);
      expect(clamped.magnitude()).toBeCloseTo(5);
      expect(clamped[0]).toBe(5);
    });

    it('should not clamp when within max', () => {
      const v = new Vector3(3, 0, 0);
      const clamped = v.clampMagnitude(5);
      expect(clamped[0]).toBe(3);
    });
  });

  describe('equality', () => {
    it('should check equality with epsilon', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(1.00001, 2.00001, 3.00001);
      expect(a.equals(b)).toBe(true);
    });

    it('should detect inequality', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(1.1, 2, 3);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('utility', () => {
    it('should clone vector', () => {
      const v = new Vector3(1, 2, 3);
      const clone = v.clone();
      expect(clone.equals(v)).toBe(true);
      expect(clone).not.toBe(v);
    });

    it('should convert to array', () => {
      const v = new Vector3(1, 2, 3);
      const arr = v.toArray();
      expect(arr).toEqual([1, 2, 3]);
    });

    it('should convert to string', () => {
      const v = new Vector3(1, 2, 3);
      expect(v.toString()).toBe('Vector3(1.000, 2.000, 3.000)');
    });
  });
});
