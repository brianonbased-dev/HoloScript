/**
 * OctreeLODSystem -- Production Test Suite
 *
 * Tests octree-based LOD for Gaussian splatting scenes:
 * - Initialization and configuration
 * - Anchor insertion at correct LOD levels
 * - Power-law threshold computation
 * - Camera-distance LOD selection
 * - Budget-aware level capping
 * - VR mode with avatar reservations
 * - Auto LOD level computation from scale
 * - Metrics and diagnostics
 *
 * Research references:
 *   W.032 - Octree-GS (TPAMI 2025)
 *   W.034 - VR Gaussian budget
 *   P.030.01 - Hierarchical LOD pattern
 *   P.030.05 - VR Budget Management pattern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OctreeLODSystem, GaussianAnchor, OctreeLODConfig } from '../OctreeLODSystem';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnchor(
  id: string,
  x: number,
  y: number,
  z: number,
  lodLevel: number,
  gaussianCount = 1000,
  scale = 1.0
): GaussianAnchor {
  return { id, x, y, z, scale, lodLevel, gaussianCount };
}

function makeVRConfig(): Partial<OctreeLODConfig> {
  return {
    maxDepth: 6,
    powerLawExponent: 1.5,
    baseDistance: 2.0,
    maxDistance: 200.0,
    vrMode: true,
    gaussianBudget: 180000,
    perAvatarReservation: 60000,
    maxAvatars: 3,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('OctreeLODSystem: construction & initialization', () => {
  it('constructs with default config', () => {
    const lod = new OctreeLODSystem();
    expect(lod.isInitialized()).toBe(false);
    expect(lod.getAnchorCount()).toBe(0);
  });

  it('constructs with custom config', () => {
    const lod = new OctreeLODSystem({ maxDepth: 8, powerLawExponent: 2.0 });
    const config = lod.getConfig();
    expect(config.maxDepth).toBe(8);
    expect(config.powerLawExponent).toBe(2.0);
  });

  it('initialize sets up root node and marks initialized', () => {
    const lod = new OctreeLODSystem();
    lod.initialize(0, 0, 0, 100);
    expect(lod.isInitialized()).toBe(true);
  });

  it('initializeFromBounds computes center and halfSize', () => {
    const lod = new OctreeLODSystem();
    lod.initializeFromBounds(-10, -20, -30, 10, 20, 30);
    expect(lod.isInitialized()).toBe(true);
  });

  it('clear resets all anchors', () => {
    const lod = new OctreeLODSystem();
    lod.initialize(0, 0, 0, 100);
    lod.insertAnchor(makeAnchor('a', 0, 0, 0, 0));
    lod.clear();
    expect(lod.getAnchorCount()).toBe(0);
    expect(lod.getTotalGaussianCount()).toBe(0);
  });
});

describe('OctreeLODSystem: power-law thresholds', () => {
  it('computes correct number of thresholds', () => {
    const lod = new OctreeLODSystem({ maxDepth: 4 });
    const thresholds = lod.getThresholds();
    expect(thresholds.length).toBe(4);
  });

  it('thresholds are monotonically increasing', () => {
    const lod = new OctreeLODSystem({ maxDepth: 6, powerLawExponent: 1.5 });
    const thresholds = lod.getThresholds();
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
    }
  });

  it('first threshold >= baseDistance', () => {
    const lod = new OctreeLODSystem({ baseDistance: 5.0, maxDistance: 100.0, maxDepth: 4 });
    const thresholds = lod.getThresholds();
    expect(thresholds[0]).toBeGreaterThanOrEqual(5.0);
  });

  it('last threshold <= maxDistance', () => {
    const lod = new OctreeLODSystem({ baseDistance: 2.0, maxDistance: 200.0, maxDepth: 6 });
    const thresholds = lod.getThresholds();
    expect(thresholds[thresholds.length - 1]).toBeLessThanOrEqual(200.0);
  });

  it('higher exponent produces more front-loaded thresholds', () => {
    const linear = new OctreeLODSystem({
      powerLawExponent: 1.0,
      maxDepth: 4,
      baseDistance: 2,
      maxDistance: 100,
    });
    const power = new OctreeLODSystem({
      powerLawExponent: 2.0,
      maxDepth: 4,
      baseDistance: 2,
      maxDistance: 100,
    });

    const linearT = linear.getThresholds();
    const powerT = power.getThresholds();

    // With higher exponent, early thresholds should be smaller (closer together near camera)
    expect(powerT[0]).toBeLessThan(linearT[0]);
    // Last threshold should be the same (both reach maxDistance)
    expect(Math.abs(powerT[powerT.length - 1] - linearT[linearT.length - 1])).toBeLessThan(0.001);
  });

  it('updateConfig recomputes thresholds', () => {
    const lod = new OctreeLODSystem({ maxDepth: 4, maxDistance: 100 });
    const before = [...lod.getThresholds()];
    lod.updateConfig({ maxDistance: 500 });
    const after = lod.getThresholds();
    expect(after[after.length - 1]).toBeGreaterThan(before[before.length - 1]);
  });
});

describe('OctreeLODSystem: anchor insertion', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem({ maxDepth: 6 });
    lod.initialize(0, 0, 0, 100);
  });

  it('inserts anchor and increments count', () => {
    const ok = lod.insertAnchor(makeAnchor('a0', 10, 0, 0, 0));
    expect(ok).toBe(true);
    expect(lod.getAnchorCount()).toBe(1);
  });

  it('tracks total Gaussian count', () => {
    lod.insertAnchor(makeAnchor('a0', 0, 0, 0, 0, 5000));
    lod.insertAnchor(makeAnchor('a1', 10, 0, 0, 1, 3000));
    expect(lod.getTotalGaussianCount()).toBe(8000);
  });

  it('rejects anchor outside bounds', () => {
    const ok = lod.insertAnchor(makeAnchor('out', 200, 0, 0, 0));
    expect(ok).toBe(false);
    expect(lod.getAnchorCount()).toBe(0);
  });

  it('rejects anchor with invalid LOD level (negative)', () => {
    const ok = lod.insertAnchor(makeAnchor('neg', 0, 0, 0, -1));
    expect(ok).toBe(false);
  });

  it('rejects anchor with LOD level >= maxDepth', () => {
    const ok = lod.insertAnchor(makeAnchor('high', 0, 0, 0, 6)); // maxDepth is 6
    expect(ok).toBe(false);
  });

  it('inserts anchors at different LOD levels', () => {
    lod.insertAnchor(makeAnchor('l0', 0, 0, 0, 0, 5000));
    lod.insertAnchor(makeAnchor('l2', 10, 0, 0, 2, 2000));
    lod.insertAnchor(makeAnchor('l4', 10, 10, 0, 4, 500));
    expect(lod.getAnchorCount()).toBe(3);
    expect(lod.getTotalGaussianCount()).toBe(7500);
  });

  it('returns false when not initialized', () => {
    const empty = new OctreeLODSystem();
    const ok = empty.insertAnchor(makeAnchor('a', 0, 0, 0, 0));
    expect(ok).toBe(false);
  });

  it('bulkInsert returns count of inserted anchors', () => {
    const anchors = [
      makeAnchor('b0', 0, 0, 0, 0, 1000),
      makeAnchor('b1', 10, 0, 0, 1, 800),
      makeAnchor('b2', 20, 0, 0, 2, 600),
      makeAnchor('b3', 30, 0, 0, 3, 400),
      makeAnchor('b_out', 200, 0, 0, 0, 100), // outside bounds
    ];
    const count = lod.bulkInsert(anchors);
    expect(count).toBe(4);
    expect(lod.getAnchorCount()).toBe(4);
    expect(lod.getTotalGaussianCount()).toBe(2800);
  });
});

describe('OctreeLODSystem: anchor removal', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem({ maxDepth: 4 });
    lod.initialize(0, 0, 0, 100);
    lod.insertAnchor(makeAnchor('a', 10, 0, 0, 0, 5000));
    lod.insertAnchor(makeAnchor('b', -10, 0, 0, 1, 3000));
  });

  it('removes anchor by ID and decrements counts', () => {
    const ok = lod.removeAnchor('a');
    expect(ok).toBe(true);
    expect(lod.getAnchorCount()).toBe(1);
    expect(lod.getTotalGaussianCount()).toBe(3000);
  });

  it('returns false for non-existent ID', () => {
    expect(lod.removeAnchor('nonexistent')).toBe(false);
    expect(lod.getAnchorCount()).toBe(2);
  });
});

describe('OctreeLODSystem: LOD selection — distance-based', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem({
      maxDepth: 4,
      powerLawExponent: 1.0, // linear for predictable tests
      baseDistance: 10.0,
      maxDistance: 100.0,
    });
    lod.initialize(0, 0, 0, 100);

    // Insert anchors at each LOD level
    lod.insertAnchor(makeAnchor('l0', 0, 0, 0, 0, 10000)); // coarsest
    lod.insertAnchor(makeAnchor('l1', 5, 0, 0, 1, 8000));
    lod.insertAnchor(makeAnchor('l2', -5, 0, 0, 2, 5000));
    lod.insertAnchor(makeAnchor('l3', 0, 5, 0, 3, 2000)); // finest
  });

  it('camera at scene center selects all levels', () => {
    // At distance 0, all thresholds are above camera distance
    const result = lod.selectLOD(0, 0, 0);
    expect(result.cameraDistance).toBeCloseTo(0, 1);
    expect(result.selectedLevels).toContain(0);
    expect(result.selectedLevels.length).toBeGreaterThanOrEqual(1);
    // At distance 0, all levels should be selected since all thresholds > 0
    expect(result.selectedLevels).toEqual([0, 1, 2, 3]);
    expect(result.totalGaussians).toBe(25000);
  });

  it('camera far away selects only coarsest levels', () => {
    // At distance > maxDistance, only level 0 should be selected
    const result = lod.selectLOD(0, 0, 200);
    expect(result.cameraDistance).toBeCloseTo(200, 1);
    expect(result.selectedLevels).toEqual([0]);
    expect(result.totalGaussians).toBe(10000);
  });

  it('camera at intermediate distance selects appropriate levels', () => {
    // With linear thresholds (exponent=1.0), baseDistance=10, maxDistance=100:
    // threshold[0] = 10 + (100-10)*(0.25)^1.0 = 10 + 22.5 = 32.5
    // threshold[1] = 10 + (100-10)*(0.50)^1.0 = 10 + 45 = 55.0
    // threshold[2] = 10 + (100-10)*(0.75)^1.0 = 10 + 67.5 = 77.5
    // threshold[3] = 10 + (100-10)*(1.00)^1.0 = 10 + 90 = 100.0
    //
    // At distance 40: < threshold[0]=32.5? No. So deepest = 0.
    // Wait -- re-read algorithm. Level L is visible if d < threshold[L-1] for L>0.
    // At distance 40: d < threshold[0]=32.5? No. So only level 0 visible.
    // At distance 20: d < threshold[0]=32.5? Yes -> level 1 visible.
    //                 d < threshold[1]=55.0? Yes -> level 2 visible.
    //                 BUT the algorithm breaks at the first threshold where d >= threshold.
    const result = lod.selectLOD(0, 0, 20);
    expect(result.cameraDistance).toBeCloseTo(20, 1);
    // At distance 20, which is < threshold[0]=32.5, level 1 is visible
    // Then d < threshold[1]=55? Yes -> level 2 visible
    // Then d < threshold[2]=77.5? Yes -> level 3 visible
    // All levels selected since 20 < all thresholds
    expect(result.selectedLevels).toEqual([0, 1, 2, 3]);
  });

  it('budgetCapped is false when no budget set', () => {
    const result = lod.selectLOD(0, 0, 0);
    expect(result.budgetCapped).toBe(false);
    expect(result.levelsDropped).toBe(0);
  });

  it('returns empty selection when not initialized', () => {
    const empty = new OctreeLODSystem();
    const result = empty.selectLOD(0, 0, 0);
    expect(result.selectedLevels).toHaveLength(0);
    expect(result.anchors).toHaveLength(0);
    expect(result.totalGaussians).toBe(0);
  });
});

describe('OctreeLODSystem: budget-aware selection', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem({
      maxDepth: 4,
      powerLawExponent: 1.0,
      baseDistance: 10.0,
      maxDistance: 100.0,
      gaussianBudget: 20000, // tight budget
    });
    lod.initialize(0, 0, 0, 100);

    // Total: 25000 Gaussians across 4 levels (exceeds 20000 budget)
    lod.insertAnchor(makeAnchor('l0', 0, 0, 0, 0, 10000));
    lod.insertAnchor(makeAnchor('l1', 5, 0, 0, 1, 8000));
    lod.insertAnchor(makeAnchor('l2', -5, 0, 0, 2, 5000));
    lod.insertAnchor(makeAnchor('l3', 0, 5, 0, 3, 2000));
  });

  it('drops deepest levels when over budget', () => {
    // Camera at center -> all levels selected -> 25000 > 20000
    const result = lod.selectLOD(0, 0, 0);
    expect(result.budgetCapped).toBe(true);
    expect(result.totalGaussians).toBeLessThanOrEqual(20000);
    // Should have dropped level 3 (2000) -> 23000 > 20000, drop level 2 (5000) -> 18000 <= 20000
    expect(result.selectedLevels).toEqual([0, 1]);
    expect(result.totalGaussians).toBe(18000);
    expect(result.levelsDropped).toBe(2);
  });

  it('does not drop levels when under budget', () => {
    // Camera far away -> only level 0 -> 10000 < 20000
    const result = lod.selectLOD(0, 0, 200);
    expect(result.budgetCapped).toBe(false);
    expect(result.totalGaussians).toBe(10000);
    expect(result.levelsDropped).toBe(0);
  });

  it('always keeps at least level 0', () => {
    // Extreme case: budget is very small
    lod.updateConfig({ gaussianBudget: 100 });
    const result = lod.selectLOD(0, 0, 0);
    expect(result.selectedLevels.length).toBeGreaterThanOrEqual(1);
    expect(result.selectedLevels).toContain(0);
  });
});

describe('OctreeLODSystem: VR mode with avatar reservations', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem(makeVRConfig());
    lod.initialize(0, 0, 0, 100);

    // 150K Gaussians across levels (under 180K total budget)
    lod.insertAnchor(makeAnchor('l0', 0, 0, 0, 0, 50000));
    lod.insertAnchor(makeAnchor('l1', 5, 0, 0, 1, 40000));
    lod.insertAnchor(makeAnchor('l2', -5, 0, 0, 2, 30000));
    lod.insertAnchor(makeAnchor('l3', 0, 5, 0, 3, 20000));
    lod.insertAnchor(makeAnchor('l4', 0, -5, 0, 4, 10000));
  });

  it('without avatars, full budget is available for scene', () => {
    lod.setActiveAvatars(0);
    const result = lod.selectLOD(0, 0, 0);
    expect(result.availableBudget).toBe(180000);
  });

  it('with 1 avatar, reserves 60K from budget', () => {
    lod.setActiveAvatars(1);
    const result = lod.selectLOD(0, 0, 0);
    expect(result.availableBudget).toBe(120000);
  });

  it('with 3 avatars (max), reserves 180K -> 0 available', () => {
    lod.setActiveAvatars(3);
    const result = lod.selectLOD(0, 0, 0);
    expect(result.availableBudget).toBe(0);
    // Budget is 0, but we're in VR mode so all Gaussians would exceed
    // However, the algorithm checks availableBudget > 0 before capping
    // So with 0 budget, no capping happens (avatars get the full budget)
  });

  it('avatar count is clamped to maxAvatars', () => {
    lod.setActiveAvatars(10); // exceeds maxAvatars=3
    expect(lod.getActiveAvatars()).toBe(3);
    const result = lod.selectLOD(0, 0, 0);
    expect(result.availableBudget).toBe(0);
  });

  it('selectLOD accepts avatarCount parameter override', () => {
    lod.setActiveAvatars(0);
    // Override with 2 avatars in the selectLOD call
    const result = lod.selectLOD(0, 0, 0, 2);
    // 180000 - 2*60000 = 60000 available
    expect(result.availableBudget).toBe(60000);
    // Total scene Gaussians = 150000 > 60000, so budget capping should apply
    expect(result.budgetCapped).toBe(true);
  });

  it('getAvailableSceneBudget reflects avatar reservations', () => {
    lod.setActiveAvatars(2);
    // 180000 - 2*60000 = 60000
    expect(lod.getAvailableSceneBudget()).toBe(60000);
  });

  it('getAvailableSceneBudget returns Infinity when no budget set', () => {
    const noBudget = new OctreeLODSystem({ gaussianBudget: 0 });
    expect(noBudget.getAvailableSceneBudget()).toBe(Infinity);
  });
});

describe('OctreeLODSystem: auto LOD level from scale', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem({ maxDepth: 6 });
  });

  it('largest scale maps to level 0', () => {
    expect(lod.computeLODLevelFromScale(10.0, 10.0)).toBe(0);
  });

  it('half the max scale maps to level 1', () => {
    expect(lod.computeLODLevelFromScale(5.0, 10.0)).toBe(1);
  });

  it('quarter the max scale maps to level 2', () => {
    expect(lod.computeLODLevelFromScale(2.5, 10.0)).toBe(2);
  });

  it('very small scale maps to deepest level', () => {
    expect(lod.computeLODLevelFromScale(0.001, 10.0)).toBe(5); // maxDepth - 1
  });

  it('zero scale maps to deepest level', () => {
    expect(lod.computeLODLevelFromScale(0, 10.0)).toBe(5);
  });

  it('scale larger than maxScale maps to level 0', () => {
    expect(lod.computeLODLevelFromScale(20.0, 10.0)).toBe(0);
  });
});

describe('OctreeLODSystem: metrics', () => {
  let lod: OctreeLODSystem;

  beforeEach(() => {
    lod = new OctreeLODSystem({ maxDepth: 4 });
    lod.initialize(0, 0, 0, 100);
  });

  it('returns correct totals', () => {
    lod.insertAnchor(makeAnchor('a', 0, 0, 0, 0, 5000));
    lod.insertAnchor(makeAnchor('b', 10, 0, 0, 1, 3000));
    lod.insertAnchor(makeAnchor('c', 20, 0, 0, 2, 1000));

    const metrics = lod.getMetrics();
    expect(metrics.totalAnchors).toBe(3);
    expect(metrics.totalGaussians).toBe(9000);
    expect(metrics.levels.length).toBe(4);
  });

  it('per-level stats are accurate', () => {
    lod.insertAnchor(makeAnchor('a', 0, 0, 0, 0, 5000));
    lod.insertAnchor(makeAnchor('b', 10, 0, 0, 0, 3000));
    lod.insertAnchor(makeAnchor('c', 20, 0, 0, 2, 1000));

    const metrics = lod.getMetrics();
    const level0 = metrics.levels.find((l) => l.level === 0)!;
    const level2 = metrics.levels.find((l) => l.level === 2)!;

    expect(level0.anchorCount).toBe(2);
    expect(level0.gaussianCount).toBe(8000);
    expect(level2.anchorCount).toBe(1);
    expect(level2.gaussianCount).toBe(1000);
  });

  it('actualDepth reflects populated levels', () => {
    lod.insertAnchor(makeAnchor('a', 0, 0, 0, 0, 100));
    lod.insertAnchor(makeAnchor('b', 10, 0, 0, 3, 100));

    const metrics = lod.getMetrics();
    expect(metrics.actualDepth).toBe(3);
  });

  it('activeAvatarReservations reflects setActiveAvatars', () => {
    const vrLod = new OctreeLODSystem(makeVRConfig());
    vrLod.setActiveAvatars(2);
    vrLod.initialize(0, 0, 0, 100);
    const metrics = vrLod.getMetrics();
    expect(metrics.activeAvatarReservations).toBe(2);
  });

  it('empty octree has zero metrics', () => {
    const metrics = lod.getMetrics();
    expect(metrics.totalAnchors).toBe(0);
    expect(metrics.totalGaussians).toBe(0);
  });
});

describe('OctreeLODSystem: edge cases', () => {
  it('handles single-level octree (maxDepth=1)', () => {
    const lod = new OctreeLODSystem({ maxDepth: 1 });
    lod.initialize(0, 0, 0, 100);
    lod.insertAnchor(makeAnchor('only', 0, 0, 0, 0, 5000));
    const result = lod.selectLOD(0, 0, 0);
    expect(result.selectedLevels).toEqual([0]);
    expect(result.totalGaussians).toBe(5000);
  });

  it('handles many anchors at same position', () => {
    const lod = new OctreeLODSystem({ maxDepth: 4, maxAnchorsPerNode: 4 });
    lod.initialize(0, 0, 0, 100);
    for (let i = 0; i < 20; i++) {
      lod.insertAnchor(makeAnchor(`a${i}`, 0, 0, 0, 0, 100));
    }
    expect(lod.getAnchorCount()).toBe(20);
    expect(lod.getTotalGaussianCount()).toBe(2000);
  });

  it('boundary insertion works (exactly on halfSize boundary)', () => {
    const lod = new OctreeLODSystem({ maxDepth: 4 });
    lod.initialize(0, 0, 0, 50);
    const ok = lod.insertAnchor(makeAnchor('edge', 50, 0, 0, 0));
    expect(ok).toBe(true);
  });

  it('clear then re-insert works correctly', () => {
    const lod = new OctreeLODSystem({ maxDepth: 4 });
    lod.initialize(0, 0, 0, 100);
    lod.insertAnchor(makeAnchor('first', 0, 0, 0, 0, 5000));
    lod.clear();
    lod.insertAnchor(makeAnchor('second', 10, 0, 0, 1, 3000));
    expect(lod.getAnchorCount()).toBe(1);
    expect(lod.getTotalGaussianCount()).toBe(3000);
  });

  it('VR conservative budget (100K) works', () => {
    const lod = new OctreeLODSystem({
      maxDepth: 4,
      vrMode: true,
      gaussianBudget: 100000, // conservative
      perAvatarReservation: 30000,
      maxAvatars: 2,
    });
    lod.initialize(0, 0, 0, 100);
    lod.setActiveAvatars(2);
    // Available: 100000 - 2*30000 = 40000
    expect(lod.getAvailableSceneBudget()).toBe(40000);
  });
});
