import { describe, it, expect } from 'vitest';
import * as ecPrims from '../EconomicPrimitives.js';

describe('EconomicPrimitives', () => {
  it('should have calculating helpers', () => {
    expect(ecPrims.calculateDepreciation).toBeDefined();
    expect(ecPrims.calculateDepreciation(1.0, 0.0001, 0)).toBe(1.0);
  });

  it('should export bonding curve formulas', () => {
    expect(ecPrims.bondingCurvePrice).toBeDefined();
    expect(ecPrims.bondingCurvePrice(10, 1.0, 2.0, 'linear')).toBe(10);
  });
});
