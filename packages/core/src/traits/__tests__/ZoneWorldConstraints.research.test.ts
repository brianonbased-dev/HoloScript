/**
 * ZoneWorldConstraints Research Implementation Tests
 *
 * Tests for AVBD population budget (W.SIG25.01) and PhysicsBudgetMode.
 */

import { describe, it, expect } from 'vitest';
import {
  AVBD_POPULATION_BUDGET,
  type PhysicsBudgetMode,
} from '../ZoneWorldConstraints';

// =============================================================================
// AVBD_POPULATION_BUDGET (W.SIG25.01)
// =============================================================================

describe('AVBD_POPULATION_BUDGET', () => {
  it('defines all 3 physics budget modes', () => {
    const modes: PhysicsBudgetMode[] = ['conservative', 'avbd', 'unlimited'];
    for (const mode of modes) {
      expect(AVBD_POPULATION_BUDGET[mode]).toBeDefined();
      expect(AVBD_POPULATION_BUDGET[mode].maxPerZone).toBeDefined();
      expect(AVBD_POPULATION_BUDGET[mode].maxPerWorld).toBeDefined();
    }
  });

  it('conservative mode has 500 per zone, 5000 per world', () => {
    expect(AVBD_POPULATION_BUDGET.conservative.maxPerZone).toBe(500);
    expect(AVBD_POPULATION_BUDGET.conservative.maxPerWorld).toBe(5000);
  });

  it('avbd mode allows 10K per zone, 1M per world', () => {
    expect(AVBD_POPULATION_BUDGET.avbd.maxPerZone).toBe(10_000);
    expect(AVBD_POPULATION_BUDGET.avbd.maxPerWorld).toBe(1_000_000);
  });

  it('unlimited mode uses Infinity', () => {
    expect(AVBD_POPULATION_BUDGET.unlimited.maxPerZone).toBe(Infinity);
    expect(AVBD_POPULATION_BUDGET.unlimited.maxPerWorld).toBe(Infinity);
  });

  it('avbd caps are higher than conservative', () => {
    expect(AVBD_POPULATION_BUDGET.avbd.maxPerZone)
      .toBeGreaterThan(AVBD_POPULATION_BUDGET.conservative.maxPerZone);
    expect(AVBD_POPULATION_BUDGET.avbd.maxPerWorld)
      .toBeGreaterThan(AVBD_POPULATION_BUDGET.conservative.maxPerWorld);
  });

  it('world cap is always >= zone cap × 10 for bounded modes', () => {
    expect(AVBD_POPULATION_BUDGET.conservative.maxPerWorld)
      .toBeGreaterThanOrEqual(AVBD_POPULATION_BUDGET.conservative.maxPerZone * 10);
    expect(AVBD_POPULATION_BUDGET.avbd.maxPerWorld)
      .toBeGreaterThanOrEqual(AVBD_POPULATION_BUDGET.avbd.maxPerZone * 10);
  });
});
