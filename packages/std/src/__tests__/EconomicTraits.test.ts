import { describe, it, expect } from 'vitest';
import {
  EconomicTraits,
  getEconomicTraitNames,
  getEconomicTrait,
  validateTraitComposition,
  getRequiredPermissions,
} from '../traits/EconomicTraits.js';
import type { EconomicTraitDefinition } from '../traits/EconomicTraits.js';

// =============================================================================
// TRAIT DEFINITION STRUCTURE
// =============================================================================

describe('EconomicTraits', () => {
  it('should define exactly five economic traits', () => {
    expect(Object.keys(EconomicTraits)).toHaveLength(5);
  });

  it('should include all five trait names', () => {
    const keys = Object.keys(EconomicTraits);
    expect(keys).toContain('tradeable');
    expect(keys).toContain('depreciating');
    expect(keys).toContain('bonding_curved');
    expect(keys).toContain('taxable_wealth');
    expect(keys).toContain('pid_controlled');
  });

  it('should prefix all trait names with @', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(trait.name).toMatch(/^@/);
    }
  });

  it('should have descriptions for all traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(trait.description).toBeDefined();
      expect(typeof trait.description).toBe('string');
      expect(trait.description!.length).toBeGreaterThan(10);
    }
  });

  it('should have validators for all traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(trait.validator).toBeDefined();
      expect(typeof trait.validator).toBe('function');
    }
  });

  it('should have requiredPermissions for all traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(trait.requiredPermissions).toBeDefined();
      expect(trait.requiredPermissions.length).toBeGreaterThan(0);
      for (const perm of trait.requiredPermissions) {
        expect(perm).toMatch(/^economy\./);
      }
    }
  });

  it('should have economicLayer for all traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(typeof trait.economicLayer).toBe('number');
      expect(trait.economicLayer).toBeGreaterThanOrEqual(0);
      expect(trait.economicLayer).toBeLessThanOrEqual(8);
    }
  });

  it('should have composesWith for all traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(trait.composesWith).toBeDefined();
      expect(Array.isArray(trait.composesWith)).toBe(true);
    }
  });

  it('should have compiler_hints for all traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      expect(trait.compiler_hints).toBeDefined();
      expect(trait.compiler_hints!.requires_runtime).toBeDefined();
    }
  });
});

// =============================================================================
// INDIVIDUAL TRAIT VALIDATORS
// =============================================================================

describe('@tradeable validator', () => {
  const validator = EconomicTraits.tradeable.validator!;

  it('should accept valid params with required initial_owner', () => {
    expect(validator({ initial_owner: 'player-1' })).toBe(true);
  });

  it('should reject missing initial_owner', () => {
    expect(validator({})).toBe(false);
  });

  it('should reject non-string initial_owner', () => {
    expect(validator({ initial_owner: 123 })).toBe(false);
  });

  it('should reject negative min_price', () => {
    expect(validator({ initial_owner: 'player-1', min_price: -10 })).toBe(false);
  });

  it('should accept zero min_price', () => {
    expect(validator({ initial_owner: 'player-1', min_price: 0 })).toBe(true);
  });
});

describe('@depreciating validator', () => {
  const validator = EconomicTraits.depreciating.validator!;

  it('should accept valid decay_rate', () => {
    expect(validator({ decay_rate: 0.001 })).toBe(true);
  });

  it('should reject missing decay_rate', () => {
    expect(validator({})).toBe(false);
  });

  it('should reject negative decay_rate', () => {
    expect(validator({ decay_rate: -0.01 })).toBe(false);
  });

  it('should reject decay_rate > 1', () => {
    expect(validator({ decay_rate: 1.5 })).toBe(false);
  });

  it('should accept decay_rate = 0 (no depreciation)', () => {
    expect(validator({ decay_rate: 0 })).toBe(true);
  });

  it('should reject invalid initial_condition', () => {
    expect(validator({ decay_rate: 0.001, initial_condition: 1.5 })).toBe(false);
    expect(validator({ decay_rate: 0.001, initial_condition: -0.1 })).toBe(false);
  });

  it('should reject invalid destroy_threshold', () => {
    expect(validator({ decay_rate: 0.001, destroy_threshold: 1.5 })).toBe(false);
  });
});

describe('@bonding_curved validator', () => {
  const validator = EconomicTraits.bonding_curved.validator!;

  it('should accept valid reserve_ratio', () => {
    expect(validator({ reserve_ratio: 1.0 })).toBe(true);
  });

  it('should reject missing reserve_ratio', () => {
    expect(validator({})).toBe(false);
  });

  it('should reject zero reserve_ratio', () => {
    expect(validator({ reserve_ratio: 0 })).toBe(false);
  });

  it('should reject negative reserve_ratio', () => {
    expect(validator({ reserve_ratio: -1 })).toBe(false);
  });

  it('should reject invalid curve_type', () => {
    expect(validator({ reserve_ratio: 1.0, curve_type: 'quadratic' })).toBe(false);
  });

  it('should accept valid curve_type values', () => {
    expect(validator({ reserve_ratio: 1.0, curve_type: 'linear' })).toBe(true);
    expect(validator({ reserve_ratio: 1.0, curve_type: 'exponential' })).toBe(true);
    expect(validator({ reserve_ratio: 1.0, curve_type: 'logarithmic' })).toBe(true);
    expect(validator({ reserve_ratio: 1.0, curve_type: 'sigmoid' })).toBe(true);
  });

  it('should reject transaction_fee > 0.5', () => {
    expect(validator({ reserve_ratio: 1.0, transaction_fee: 0.6 })).toBe(false);
  });

  it('should reject negative transaction_fee', () => {
    expect(validator({ reserve_ratio: 1.0, transaction_fee: -0.01 })).toBe(false);
  });

  it('should reject zero curve_steepness', () => {
    expect(validator({ reserve_ratio: 1.0, curve_steepness: 0 })).toBe(false);
  });
});

describe('@taxable_wealth validator', () => {
  const validator = EconomicTraits.taxable_wealth.validator!;

  it('should accept valid threshold', () => {
    expect(validator({ threshold: 10000 })).toBe(true);
  });

  it('should reject missing threshold', () => {
    expect(validator({})).toBe(false);
  });

  it('should reject negative threshold', () => {
    expect(validator({ threshold: -100 })).toBe(false);
  });

  it('should accept zero threshold (everyone taxed)', () => {
    expect(validator({ threshold: 0 })).toBe(true);
  });

  it('should reject base_rate > 0.1', () => {
    expect(validator({ threshold: 10000, base_rate: 0.2 })).toBe(false);
  });

  it('should reject redistribution_fraction > 1.0', () => {
    expect(validator({ threshold: 10000, redistribution_fraction: 1.5 })).toBe(false);
  });

  it('should reject max_effective_rate > 1.0', () => {
    expect(validator({ threshold: 10000, max_effective_rate: 1.5 })).toBe(false);
  });
});

describe('@pid_controlled validator', () => {
  const validator = EconomicTraits.pid_controlled.validator!;

  it('should accept valid target_per_capita', () => {
    expect(validator({ target_per_capita: 1000 })).toBe(true);
  });

  it('should reject missing target_per_capita', () => {
    expect(validator({})).toBe(false);
  });

  it('should reject zero target_per_capita', () => {
    expect(validator({ target_per_capita: 0 })).toBe(false);
  });

  it('should reject negative target_per_capita', () => {
    expect(validator({ target_per_capita: -100 })).toBe(false);
  });

  it('should reject NaN PID gains', () => {
    expect(validator({ target_per_capita: 1000, inner_kp: NaN })).toBe(false);
  });

  it('should accept negative PID gains (valid control theory)', () => {
    expect(validator({ target_per_capita: 1000, inner_kp: -0.5 })).toBe(true);
  });

  it('should reject zero update_interval', () => {
    expect(validator({ target_per_capita: 1000, update_interval: 0 })).toBe(false);
  });

  it('should reject negative update_interval', () => {
    expect(validator({ target_per_capita: 1000, update_interval: -1 })).toBe(false);
  });
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

describe('getEconomicTraitNames', () => {
  it('should return all five trait names', () => {
    const names = getEconomicTraitNames();
    expect(names).toHaveLength(5);
    expect(names).toContain('@tradeable');
    expect(names).toContain('@depreciating');
    expect(names).toContain('@bonding_curved');
    expect(names).toContain('@taxable_wealth');
    expect(names).toContain('@pid_controlled');
  });
});

describe('getEconomicTrait', () => {
  it('should find trait by @-prefixed name', () => {
    const trait = getEconomicTrait('@tradeable');
    expect(trait).toBeDefined();
    expect(trait!.name).toBe('@tradeable');
  });

  it('should find trait by unprefixed name', () => {
    const trait = getEconomicTrait('tradeable');
    expect(trait).toBeDefined();
    expect(trait!.name).toBe('@tradeable');
  });

  it('should return undefined for unknown trait', () => {
    const trait = getEconomicTrait('@unknown');
    expect(trait).toBeUndefined();
  });
});

describe('validateTraitComposition', () => {
  it('should accept compatible traits', () => {
    const result = validateTraitComposition(['@tradeable', '@depreciating']);
    expect(result).toBeNull();
  });

  it('should reject unknown traits', () => {
    const result = validateTraitComposition(['@tradeable', '@unknown']);
    expect(result).not.toBeNull();
    expect(result).toContain('Unknown');
  });

  it('should accept single trait', () => {
    const result = validateTraitComposition(['@tradeable']);
    expect(result).toBeNull();
  });

  it('should accept tradeable + bonding_curved composition', () => {
    const result = validateTraitComposition(['@tradeable', '@bonding_curved']);
    expect(result).toBeNull();
  });

  it('should accept tradeable + taxable_wealth composition', () => {
    const result = validateTraitComposition(['@tradeable', '@taxable_wealth']);
    expect(result).toBeNull();
  });

  it('should accept bonding_curved + pid_controlled composition', () => {
    const result = validateTraitComposition(['@bonding_curved', '@pid_controlled']);
    expect(result).toBeNull();
  });

  it('should reject incompatible compositions', () => {
    // depreciating does not compose with pid_controlled (and vice versa)
    const result = validateTraitComposition(['@depreciating', '@pid_controlled']);
    expect(result).not.toBeNull();
    expect(result).toContain('does not compose');
  });
});

describe('getRequiredPermissions', () => {
  it('should return unique sorted permissions', () => {
    const perms = getRequiredPermissions(['@tradeable', '@taxable_wealth']);
    expect(perms).toContain('economy.trade');
    expect(perms).toContain('economy.tax');
    expect(perms).toContain('economy.redistribute');
    // Should be sorted
    for (let i = 1; i < perms.length; i++) {
      expect(perms[i] >= perms[i - 1]).toBe(true);
    }
  });

  it('should return empty for no traits', () => {
    expect(getRequiredPermissions([])).toHaveLength(0);
  });

  it('should return empty for unknown traits', () => {
    expect(getRequiredPermissions(['@unknown'])).toHaveLength(0);
  });

  it('should deduplicate shared permissions', () => {
    // Both tradeable and bonding_curved require economy.trade
    const perms = getRequiredPermissions(['@tradeable', '@bonding_curved']);
    const tradeCount = perms.filter((p) => p === 'economy.trade').length;
    expect(tradeCount).toBe(1);
  });

  it('should aggregate all permissions for full economic stack', () => {
    const perms = getRequiredPermissions([
      '@tradeable',
      '@depreciating',
      '@bonding_curved',
      '@taxable_wealth',
      '@pid_controlled',
    ]);
    expect(perms).toContain('economy.trade');
    expect(perms).toContain('economy.burn');
    expect(perms).toContain('economy.set_price');
    expect(perms).toContain('economy.tax');
    expect(perms).toContain('economy.redistribute');
    expect(perms).toContain('economy.tune_pid');
    expect(perms).toContain('economy.mint');
  });
});

// =============================================================================
// RBAC INTEGRATION
// =============================================================================

describe('RBAC Integration', () => {
  it('should use economy.* permission namespace', () => {
    const allPerms = new Set<string>();
    for (const trait of Object.values(EconomicTraits)) {
      for (const perm of trait.requiredPermissions) {
        allPerms.add(perm);
      }
    }
    for (const perm of allPerms) {
      expect(perm.startsWith('economy.')).toBe(true);
    }
  });

  it('should not require wildcard permissions on individual traits', () => {
    for (const trait of Object.values(EconomicTraits)) {
      for (const perm of trait.requiredPermissions) {
        expect(perm).not.toBe('economy.*');
      }
    }
  });
});

// =============================================================================
// ECONOMIC LAYER ARCHITECTURE
// =============================================================================

describe('9-Layer Architecture Mapping', () => {
  it('@tradeable should be at Layer 0 (Integrity)', () => {
    expect(EconomicTraits.tradeable.economicLayer).toBe(0);
  });

  it('@depreciating should be at Layer 1 (Flow Control)', () => {
    expect(EconomicTraits.depreciating.economicLayer).toBe(1);
  });

  it('@bonding_curved should be at Layer 2 (Price Discovery)', () => {
    expect(EconomicTraits.bonding_curved.economicLayer).toBe(2);
  });

  it('@taxable_wealth should be at Layer 4 (Redistribution)', () => {
    expect(EconomicTraits.taxable_wealth.economicLayer).toBe(4);
  });

  it('@pid_controlled should be at Layer 1 (Flow Control)', () => {
    expect(EconomicTraits.pid_controlled.economicLayer).toBe(1);
  });
});
