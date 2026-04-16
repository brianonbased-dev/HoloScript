import { describe, it, expect } from 'vitest';
import { EconomicTraits, getEconomicTraitNames } from '../EconomicTraits.js';

describe('EconomicTraits', () => {
  it('should export standard economic traits', () => {
    expect(EconomicTraits).toBeDefined();
    expect(EconomicTraits.tradeable).toBeDefined();
    expect(EconomicTraits.depreciating).toBeDefined();
  });

  it('should allow getting trait names', () => {
    const names = getEconomicTraitNames();
    expect(names).toContain('@tradeable');
    expect(names.length).toBeGreaterThan(0);
  });
});
