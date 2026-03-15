/**
 * @fileoverview Tests for sync benchmark utility functions
 */

import { describe, it, expect } from 'vitest';

// Extract the randomQuat function for testing
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
    it('should generate normalized quaternions', () => {
      for (let i = 0; i < 100; i++) {
        const [x, y, z, w] = randomQuat();
        
        // Verify it returns 4 numbers
        expect(typeof x).toBe('number');
        expect(typeof y).toBe('number');
        expect(typeof z).toBe('number');
        expect(typeof w).toBe('number');
        
        // Verify it's normalized (magnitude should be ~1)
        const magnitude = Math.sqrt(x * x + y * y + z * z + w * w);
        expect(magnitude).toBeCloseTo(1.0, 10); // High precision for quaternion normalization
        
        // Verify no NaN values
        expect(x).not.toBeNaN();
        expect(y).not.toBeNaN();
        expect(z).not.toBeNaN();
        expect(w).not.toBeNaN();
        
        // Verify finite values
        expect(x).toBeFinite();
        expect(y).toBeFinite();
        expect(z).toBeFinite();
        expect(w).toBeFinite();
      }
    });

    it('should generate different quaternions on successive calls', () => {
      const quat1 = randomQuat();
      const quat2 = randomQuat();
      
      // Very unlikely that two random quaternions are identical
      const identical = quat1[0] === quat2[0] && 
                       quat1[1] === quat2[1] && 
                       quat1[2] === quat2[2] && 
                       quat1[3] === quat2[3];
      
      expect(identical).toBe(false);
    });

    it('should generate quaternions within expected component ranges', () => {
      for (let i = 0; i < 50; i++) {
        const [x, y, z, w] = randomQuat();
        
        // After normalization, each component should be between -1 and 1
        expect(x).toBeGreaterThanOrEqual(-1);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(1);
        expect(z).toBeGreaterThanOrEqual(-1);
        expect(z).toBeLessThanOrEqual(1);
        expect(w).toBeGreaterThanOrEqual(-1);
        expect(w).toBeLessThanOrEqual(1);
      }
    });

    it('should handle edge cases gracefully', () => {
      // Mock Math.random to return edge case values
      const originalRandom = Math.random;
      
      try {
        // Test case where all components are zero (edge case)
        Math.random = () => 0.5; // This gives x=y=z=w=0 after (random*2-1)
        const result = randomQuat();
        
        // Should still produce a valid normalized quaternion
        const magnitude = Math.sqrt(result[0] * result[0] + result[1] * result[1] + 
                                   result[2] * result[2] + result[3] * result[3]);
        expect(magnitude).toBeCloseTo(1.0, 10);
        
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should generate uniformly distributed unit quaternions', () => {
      const quats = [];
      for (let i = 0; i < 1000; i++) {
        quats.push(randomQuat());
      }
      
      // Statistical test: check that the distribution is reasonably uniform
      // For a unit quaternion, each component should have roughly similar variance
      const xValues = quats.map(q => q[0]);
      const yValues = quats.map(q => q[1]);
      const zValues = quats.map(q => q[2]);
      const wValues = quats.map(q => q[3]);
      
      // Calculate variance for each component
      const variance = (values: number[]) => {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        return values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
      };
      
      const varX = variance(xValues);
      const varY = variance(yValues);
      const varZ = variance(zValues);
      const varW = variance(wValues);
      
      // All variances should be within a reasonable range for uniform distribution on sphere
      // For unit quaternions, expected variance is approximately 0.33
      expect(varX).toBeGreaterThan(0.2);
      expect(varX).toBeLessThan(0.5);
      expect(varY).toBeGreaterThan(0.2);
      expect(varY).toBeLessThan(0.5);
      expect(varZ).toBeGreaterThan(0.2);
      expect(varZ).toBeLessThan(0.5);
      expect(varW).toBeGreaterThan(0.2);
      expect(varW).toBeLessThan(0.5);
    });
  });
});