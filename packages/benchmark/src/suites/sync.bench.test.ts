/**
 * @fileoverview Tests for sync benchmark utility functions
 */

import { describe, it, expect } from 'vitest';

// Extract utility functions for testing
// Generate random normalized quaternion
function randomQuat(): [number, number, number, number] {
  const x = Math.random() * 2 - 1;
  const y = Math.random() * 2 - 1;
  const z = Math.random() * 2 - 1;
  const w = Math.random() * 2 - 1;
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  return [x / len, y / len, z / len, w / len];
}

describe('Sync Benchmark Utilities', () => {
  describe('randomQuat', () => {
    it('should return a normalized quaternion', () => {
      const quat = randomQuat();
      
      // Should return array of 4 numbers
      expect(quat).toHaveLength(4);
      expect(quat.every(n => typeof n === 'number')).toBe(true);
      
      // Should be normalized (magnitude = 1)
      const [x, y, z, w] = quat;
      const magnitude = Math.sqrt(x * x + y * y + z * z + w * w);
      expect(magnitude).toBeCloseTo(1.0, 10);
    });

    it('should return valid quaternion components', () => {
      const quat = randomQuat();
      const [x, y, z, w] = quat;
      
      // All components should be finite numbers
      expect(isFinite(x)).toBe(true);
      expect(isFinite(y)).toBe(true);
      expect(isFinite(z)).toBe(true);
      expect(isFinite(w)).toBe(true);
      
      // Components should be in reasonable range after normalization
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
      expect(Math.abs(z)).toBeLessThanOrEqual(1);
      expect(Math.abs(w)).toBeLessThanOrEqual(1);
    });

    it('should generate different quaternions on multiple calls', () => {
      const quat1 = randomQuat();
      const quat2 = randomQuat();
      const quat3 = randomQuat();
      
      // Extremely unlikely that consecutive calls produce identical quaternions
      expect(quat1).not.toEqual(quat2);
      expect(quat2).not.toEqual(quat3);
      expect(quat1).not.toEqual(quat3);
    });

    it('should handle edge cases in normalization', () => {
      // Test multiple times to catch potential edge cases with random generation
      for (let i = 0; i < 100; i++) {
        const quat = randomQuat();
        const [x, y, z, w] = quat;
        
        // Ensure no NaN values
        expect(x).not.toBeNaN();
        expect(y).not.toBeNaN();
        expect(z).not.toBeNaN();
        expect(w).not.toBeNaN();
        
        // Verify normalization holds
        const magnitude = Math.sqrt(x * x + y * y + z * z + w * w);
        expect(magnitude).toBeCloseTo(1.0, 8);
      }
    });

    it('should produce unit quaternion with correct mathematical properties', () => {
      const quat = randomQuat();
      const [x, y, z, w] = quat;
      
      // Unit quaternion property: |q| = 1
      const magnitude = Math.sqrt(x * x + y * y + z * z + w * w);
      expect(magnitude).toBeCloseTo(1.0, 10);
      
      // Quaternion conjugate should also be unit
      const conjugate = [-x, -y, -z, w];
      const conjMag = Math.sqrt(conjugate[0] ** 2 + conjugate[1] ** 2 + conjugate[2] ** 2 + conjugate[3] ** 2);
      expect(conjMag).toBeCloseTo(1.0, 10);
    });
  });
});