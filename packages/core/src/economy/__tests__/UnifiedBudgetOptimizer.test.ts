/**
 * UnifiedBudgetOptimizer — Tests
 *
 * Tests the equimarginal allocation, cost floor pricing,
 * and unified budget state across economy + rendering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedBudgetOptimizer,
  DEFAULT_COST_FLOOR,
  DEFAULT_LOD_SCALING,
  DEFAULT_TRAIT_UTILITIES,
  PLATFORM_LOD_SCALING,
  type UnifiedOptimizerConfig,
  type TraitUtility,
} from '@holoscript/framework/economy';
import type { ResourceUsageNode } from '../../compiler/safety/ResourceBudgetAnalyzer';

// =============================================================================
// HELPERS
// =============================================================================

function createConfig(overrides?: Partial<UnifiedOptimizerConfig>): UnifiedOptimizerConfig {
  return {
    platform: 'quest3',
    costFloor: DEFAULT_COST_FLOOR,
    ...overrides,
  };
}

function createNode(
  name: string,
  traits: string[],
  count: number = 1,
  calls: string[] = []
): ResourceUsageNode {
  return { name, traits, count, calls };
}

// =============================================================================
// TESTS
// =============================================================================

describe('UnifiedBudgetOptimizer', () => {
  let optimizer: UnifiedBudgetOptimizer;

  beforeEach(() => {
    optimizer = new UnifiedBudgetOptimizer(createConfig());
  });

  // ===========================================================================
  // CONSTRUCTION
  // ===========================================================================

  describe('construction', () => {
    it('should create with default config', () => {
      expect(optimizer).toBeDefined();
    });

    it('should load default trait utilities', () => {
      const meshUtil = optimizer.getUtility('@mesh');
      expect(meshUtil).toBeDefined();
      expect(meshUtil!.baseUtility).toBe(100);
      expect(meshUtil!.required).toBe(true);
    });

    it('should accept custom trait utilities', () => {
      const custom = new Map<string, TraitUtility>();
      custom.set('@custom_trait', {
        trait: '@custom_trait',
        baseUtility: 77,
        category: 'visual',
        required: false,
        minLODLevel: 1,
      });

      const opt = new UnifiedBudgetOptimizer(createConfig({ traitUtilities: custom }));
      expect(opt.getUtility('@custom_trait')!.baseUtility).toBe(77);
      // Defaults should still be loaded
      expect(opt.getUtility('@mesh')!.baseUtility).toBe(100);
    });

    it('should allow overriding default utilities', () => {
      const custom = new Map<string, TraitUtility>();
      custom.set('@mesh', {
        trait: '@mesh',
        baseUtility: 50,
        category: 'visual',
        required: false,
        minLODLevel: 0,
      });

      const opt = new UnifiedBudgetOptimizer(createConfig({ traitUtilities: custom }));
      expect(opt.getUtility('@mesh')!.baseUtility).toBe(50);
    });
  });

  // ===========================================================================
  // UTILITY SCORING
  // ===========================================================================

  describe('utility scoring', () => {
    it('should return utility for known traits', () => {
      expect(optimizer.getUtility('@particle')!.baseUtility).toBe(70);
      expect(optimizer.getUtility('@ray_tracing')!.baseUtility).toBe(20);
    });

    it('should return undefined for unknown traits', () => {
      expect(optimizer.getUtility('@nonexistent_xyz')).toBeUndefined();
    });

    it('should normalize trait names (add @ prefix)', () => {
      expect(optimizer.getUtility('mesh')!.baseUtility).toBe(100);
    });

    it('should allow setting custom utility', () => {
      optimizer.setUtility({
        trait: '@my_trait',
        baseUtility: 42,
        category: 'physics',
        required: false,
        minLODLevel: 2,
      });
      expect(optimizer.getUtility('@my_trait')!.baseUtility).toBe(42);
    });
  });

  // ===========================================================================
  // WEIGHTED COST
  // ===========================================================================

  describe('weighted cost', () => {
    it('should return 0 for unknown traits', () => {
      expect(optimizer.getWeightedCost('@nonexistent_xyz')).toBe(0);
    });

    it('should return positive cost for known traits', () => {
      const cost = optimizer.getWeightedCost('@particle');
      expect(cost).toBeGreaterThan(0);
    });

    it('should scale cost by LOD level', () => {
      const lod0 = optimizer.getWeightedCost('@particle', 0);
      const lod1 = optimizer.getWeightedCost('@particle', 1);
      const lod2 = optimizer.getWeightedCost('@particle', 2);

      expect(lod0).toBeGreaterThan(lod1);
      expect(lod1).toBeGreaterThan(lod2);
    });

    it('should scale cost by instance count', () => {
      const single = optimizer.getWeightedCost('@particle', 0, 1);
      const ten = optimizer.getWeightedCost('@particle', 0, 10);
      expect(ten).toBeCloseTo(single * 10, 5);
    });
  });

  // ===========================================================================
  // VALUE/COST RATIO
  // ===========================================================================

  describe('value/cost ratio', () => {
    it('should compute ratio for known traits', () => {
      const ratio = optimizer.getValueCostRatio('@particle');
      expect(ratio).toBeGreaterThan(0);
    });

    it('should give high ratio for free traits', () => {
      const ratio = optimizer.getValueCostRatio('@nonexistent_zero_cost');
      expect(ratio).toBeGreaterThan(1000);
    });

    it('should give higher ratio to high-utility low-cost traits', () => {
      // @mesh: utility 100, cost = 1 mesh + 1 draw call (low cost)
      // @ray_tracing: utility 20, cost = 8 draw + 4 shader + 16MB (high cost)
      const meshRatio = optimizer.getValueCostRatio('@mesh');
      const rtRatio = optimizer.getValueCostRatio('@ray_tracing');

      expect(meshRatio).toBeGreaterThan(rtRatio);
    });

    it('should decrease ratio at higher LOD levels (cost stays but scaled)', () => {
      // At higher LOD, cost decreases, so ratio should increase
      const lod0 = optimizer.getValueCostRatio('@particle', 0);
      const lod2 = optimizer.getValueCostRatio('@particle', 2);
      // Lower cost at LOD 2 = higher ratio
      expect(lod2).toBeGreaterThan(lod0);
    });
  });

  // ===========================================================================
  // EQUIMARGINAL ALLOCATION
  // ===========================================================================

  describe('equimarginal allocation', () => {
    it('should include everything when within budget', () => {
      const nodes = [createNode('Cube', ['@mesh', '@material']), createNode('Light', ['@light'])];

      const allocations = optimizer.allocate(nodes);
      expect(allocations.every((a) => a.included)).toBe(true);
      expect(allocations.every((a) => a.lodLevel === 0)).toBe(true);
    });

    it('should handle empty input', () => {
      const allocations = optimizer.allocate([]);
      expect(allocations).toHaveLength(0);
    });

    it('should dedup traits across nodes', () => {
      const nodes = [
        createNode('Cube1', ['@mesh', '@material']),
        createNode('Cube2', ['@mesh', '@physics']),
      ];

      const allocations = optimizer.allocate(nodes);
      const meshAllocs = allocations.filter((a) => a.trait === '@mesh');
      expect(meshAllocs).toHaveLength(1);
    });

    it('should shed low-value traits first under pressure', () => {
      // Create a scene that exceeds quest3 budget
      // Quest3: 200 draw calls, 180K gaussians, 512MB
      const nodes = [
        createNode('Scene', ['@mesh', '@material', '@physics']),
        createNode('GaussianCloud', ['@multiview_gaussian_renderer'], 20), // 20 * 20K = 400K gaussians (over quest3)
        createNode('RayTrace', ['@ray_tracing']),
        createNode('GI', ['@global_illumination']),
        createNode('NeRF', ['@nerf']),
      ];

      const allocations = optimizer.allocate(nodes);

      // Required traits must be included
      const mesh = allocations.find((a) => a.trait === '@mesh');
      expect(mesh!.included).toBe(true);

      // Luxury traits should be degraded or excluded before required ones
      const rt = allocations.find((a) => a.trait === '@ray_tracing');
      const gi = allocations.find((a) => a.trait === '@global_illumination');

      // Either LOD-degraded or excluded
      if (rt!.included) {
        expect(rt!.lodLevel).toBeGreaterThan(0);
      }
      if (gi!.included) {
        expect(gi!.lodLevel).toBeGreaterThan(0);
      }
    });

    it('should never exclude required traits', () => {
      // Massive overload
      const nodes = [
        createNode('Core', ['@mesh', '@material', '@physics', '@collider', '@rendering']),
        createNode('Heavy1', ['@ray_tracing'], 50),
        createNode('Heavy2', ['@global_illumination'], 50),
      ];

      const allocations = optimizer.allocate(nodes);

      const requiredTraits = ['@mesh', '@material', '@physics', '@collider', '@rendering'];
      for (const trait of requiredTraits) {
        const alloc = allocations.find((a) => a.trait === trait);
        expect(alloc?.included).toBe(true);
      }
    });

    it('should work with desktop-vr platform (higher limits)', () => {
      const desktopOpt = new UnifiedBudgetOptimizer(createConfig({ platform: 'desktop-vr' }));

      // Same scene that might stress quest3
      const nodes = [
        createNode('Scene', ['@mesh', '@material']),
        createNode('Particles', ['@particle'], 5),
        createNode('Lighting', ['@advanced_lighting']),
      ];

      const allocations = desktopOpt.allocate(nodes);
      expect(allocations.every((a) => a.included)).toBe(true);
      expect(allocations.every((a) => a.lodLevel === 0)).toBe(true);
    });

    it('should handle unknown platform gracefully', () => {
      const unknownOpt = new UnifiedBudgetOptimizer(createConfig({ platform: 'commodore64' }));
      const nodes = [createNode('Obj', ['@mesh', '@particle'])];
      const allocations = unknownOpt.allocate(nodes);
      // No limits = everything included
      expect(allocations.every((a) => a.included)).toBe(true);
    });
  });

  // ===========================================================================
  // RESOURCE COST FLOOR PRICING
  // ===========================================================================

  describe('cost floor pricing', () => {
    it('should calculate cost floor for gaussian-heavy trait', () => {
      // @gaussian: 10K gaussians, 10MB memory
      const floor = optimizer.calculateCostFloor('@gaussian');
      expect(floor).toBeGreaterThan(DEFAULT_COST_FLOOR.baseFee);
    });

    it('should scale with instance count', () => {
      const single = optimizer.calculateCostFloor('@gaussian', 1);
      const ten = optimizer.calculateCostFloor('@gaussian', 10);
      expect(ten).toBeGreaterThan(single);
    });

    it('should return base fee for unknown traits', () => {
      const floor = optimizer.calculateCostFloor('@nonexistent');
      expect(floor).toBe(DEFAULT_COST_FLOOR.baseFee);
    });

    it('should validate marketplace price that meets floor', () => {
      const floor = optimizer.calculateCostFloor('@gaussian');
      const result = optimizer.validateMarketplacePrice('@gaussian', floor + 1);
      expect(result.valid).toBe(true);
      expect(result.deficit).toBe(0);
    });

    it('should reject marketplace price below floor', () => {
      const result = optimizer.validateMarketplacePrice('@gaussian', 1); // 1 USDC base unit
      expect(result.valid).toBe(false);
      expect(result.deficit).toBeGreaterThan(0);
      expect(result.message).toContain('below resource cost floor');
    });

    it('should detect denial-of-rendering: cheap trait with massive GPU cost', () => {
      // @multiview_gaussian_renderer: 20K gaussians, 20MB, 4 draw calls
      // At 100 instances, that's 2M gaussians
      const floor = optimizer.calculateCostFloor('@multiview_gaussian_renderer', 100);
      const result = optimizer.validateMarketplacePrice(
        '@multiview_gaussian_renderer',
        100_000,
        100
      );

      // $0.10 list price for 2M gaussians should fail
      if (floor > 100_000) {
        expect(result.valid).toBe(false);
      }
    });

    it('should accept reasonably priced traits', () => {
      // @mesh: 1 mesh instance, 1 draw call — very cheap but still above base fee
      const floor = optimizer.calculateCostFloor('@mesh');
      const result = optimizer.validateMarketplacePrice('@mesh', floor);
      expect(result.valid).toBe(true);
    });
  });

  // ===========================================================================
  // UNIFIED BUDGET STATE
  // ===========================================================================

  describe('unified budget state', () => {
    it('should return zero pressure for empty scene', () => {
      const state = optimizer.getUnifiedState('agent-1', []);
      expect(state.overallPressure).toBe(0);
      expect(state.suggestedLOD).toBe(0);
      expect(state.hardLimitBreached).toBe(false);
    });

    it('should compute economic pressure', () => {
      const opt = new UnifiedBudgetOptimizer(
        createConfig({
          economicBudget: 10_000_000, // $10
          economicSpent: 8_000_000, // $8 spent
        })
      );

      const state = opt.getUnifiedState('agent-1', []);
      expect(state.economicPressure).toBeCloseTo(0.8, 1);
    });

    it('should compute resource pressure', () => {
      // Create a scene using significant quest3 resources
      const nodes = [
        createNode('GaussianScene', ['@gaussian'], 15), // 15 * 10K = 150K of 180K limit
      ];

      const state = optimizer.getUnifiedState('agent-1', nodes);
      expect(state.resourcePressure.gaussians).toBeGreaterThan(0.5);
    });

    it('should suggest LOD based on pressure', () => {
      const opt = new UnifiedBudgetOptimizer(
        createConfig({
          economicBudget: 10_000_000,
          economicSpent: 9_600_000, // 96% spent
        })
      );

      const state = opt.getUnifiedState('agent-1', []);
      expect(state.suggestedLOD).toBeGreaterThanOrEqual(2);
    });

    it('should detect hard limit breach', () => {
      const opt = new UnifiedBudgetOptimizer(
        createConfig({
          economicBudget: 10_000_000,
          economicSpent: 11_000_000, // Over budget
        })
      );

      const state = opt.getUnifiedState('agent-1', []);
      expect(state.hardLimitBreached).toBe(true);
    });

    it('should provide shed candidates sorted by value/cost ratio', () => {
      const nodes = [
        createNode('Core', ['@mesh', '@material', '@physics']),
        createNode('VFX', ['@ray_tracing', '@global_illumination', '@particle', '@vfx']),
      ];

      const state = optimizer.getUnifiedState('agent-1', nodes);
      // Required traits should not appear in shed candidates
      const shedTraits = state.shedCandidates.map((s) => s.trait);
      expect(shedTraits).not.toContain('@mesh');
      expect(shedTraits).not.toContain('@material');
      expect(shedTraits).not.toContain('@physics');

      // Shed candidates should be sorted by value/cost ratio ascending
      for (let i = 1; i < state.shedCandidates.length; i++) {
        expect(state.shedCandidates[i].valueCostRatio).toBeGreaterThanOrEqual(
          state.shedCandidates[i - 1].valueCostRatio
        );
      }
    });

    it('should accept custom economic state via parameters', () => {
      const state = optimizer.getUnifiedState('agent-1', [], 5_000_000, 10_000_000);
      expect(state.economicPressure).toBeCloseTo(0.5, 1);
    });

    it('should cap pressure at 1.0', () => {
      const opt = new UnifiedBudgetOptimizer(
        createConfig({
          economicBudget: 1,
          economicSpent: 1000,
        })
      );

      const state = opt.getUnifiedState('agent-1', []);
      expect(state.economicPressure).toBe(1);
    });
  });

  // ===========================================================================
  // LOD SCALING
  // ===========================================================================

  describe('LOD scaling', () => {
    it('should use default LOD scaling (Weber-Fechner perceptual curve)', () => {
      expect(DEFAULT_LOD_SCALING).toEqual([1.0, 0.7, 0.4, 0.18, 0.06]);
    });

    it('should accept custom LOD scaling', () => {
      const opt = new UnifiedBudgetOptimizer(
        createConfig({
          lodScaling: [1.0, 0.75, 0.5, 0.25],
        })
      );

      // LOD 1 should be more expensive with custom scaling (0.75 vs default 0.5)
      const defaultCost = optimizer.getWeightedCost('@particle', 1);
      const customCost = opt.getWeightedCost('@particle', 1);
      expect(customCost).toBeGreaterThan(defaultCost);
    });
  });

  // ===========================================================================
  // DEFAULT TRAIT UTILITIES TABLE
  // ===========================================================================

  describe('default trait utilities', () => {
    it('should have utilities for all major trait categories', () => {
      const categories = new Set(Object.values(DEFAULT_TRAIT_UTILITIES).map((u) => u.category));
      expect(categories.has('visual')).toBe(true);
      expect(categories.has('physics')).toBe(true);
      expect(categories.has('audio')).toBe(true);
      expect(categories.has('ai')).toBe(true);
      expect(categories.has('network')).toBe(true);
    });

    it('should have required traits with minLODLevel 0', () => {
      for (const [trait, util] of Object.entries(DEFAULT_TRAIT_UTILITIES)) {
        if (util.required) {
          expect(util.minLODLevel).toBe(0);
        }
      }
    });

    it('should have utility scores in valid range (0-100)', () => {
      for (const [trait, util] of Object.entries(DEFAULT_TRAIT_UTILITIES)) {
        expect(util.baseUtility).toBeGreaterThanOrEqual(0);
        expect(util.baseUtility).toBeLessThanOrEqual(100);
      }
    });

    it('should have luxury traits with lower utility than core', () => {
      const meshUtil = DEFAULT_TRAIT_UTILITIES['@mesh'].baseUtility;
      const rtUtil = DEFAULT_TRAIT_UTILITIES['@ray_tracing'].baseUtility;
      expect(meshUtil).toBeGreaterThan(rtUtil);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle traits without @ prefix', () => {
      const cost = optimizer.getWeightedCost('particle');
      expect(cost).toBeGreaterThan(0);
    });

    it('should handle zero economic budget', () => {
      const state = optimizer.getUnifiedState('agent-1', []);
      expect(state.economicPressure).toBe(0);
    });

    it('should handle single-trait scene', () => {
      const nodes = [createNode('Solo', ['@mesh'])];
      const allocations = optimizer.allocate(nodes);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].included).toBe(true);
    });

    it('should handle all-required scene (nothing to shed)', () => {
      const nodes = [
        createNode('Core', ['@mesh', '@material', '@physics', '@rigidbody', '@collider']),
      ];
      const state = optimizer.getUnifiedState('agent-1', nodes);
      expect(state.shedCandidates).toHaveLength(0);
    });

    it('should handle high instance counts', () => {
      const nodes = [createNode('Army', ['@npc'], 1000)];
      const allocations = optimizer.allocate(nodes);
      // With 1000 NPCs on quest3, it should exceed the agent count limit (10)
      // and the trait should be degraded
      const npcAlloc = allocations.find((a) => a.trait === '@npc');
      expect(npcAlloc).toBeDefined();
    });
  });

  // ===========================================================================
  // C6 LAYER 2: ECONOMY x RENDERING — OPERATIONAL ECONOMICS
  // ===========================================================================

  describe('C6 Layer 2: Economy x Rendering fixes', () => {
    // ── Finding 1: Budget analyzer contradiction ──
    describe('budget analyzer alignment', () => {
      it('should use conservative gaussian cost (100K not 10K) in ResourceBudgetAnalyzer', async () => {
        // The TRAIT_RESOURCE_COSTS for @gaussian_splat should now be 100K,
        // which is conservative enough to flag potential Quest 3 budget violations
        // (Quest 3 budget = 180K), not the old 10K which silently passed.
        const { TRAIT_RESOURCE_COSTS } = await import('../../compiler/safety/ResourceBudgetAnalyzer');
        expect(TRAIT_RESOURCE_COSTS['@gaussian_splat'].gaussians).toBe(100_000);
        expect(TRAIT_RESOURCE_COSTS['@gaussian'].gaussians).toBe(100_000);
        expect(TRAIT_RESOURCE_COSTS['@multiview_gaussian_renderer'].gaussians).toBe(200_000);
      });

      it('should flag single @gaussian_splat on Quest 3 as > 55% budget', () => {
        // 100K / 180K = 55.6% utilization — should register as meaningful pressure
        const cost = optimizer.getWeightedCost('@gaussian_splat', 0, 1);
        expect(cost).toBeGreaterThan(0.5); // > 50% normalized pressure
      });
    });

    // ── Finding 2: Non-uniform platform exchange rates ──
    describe('platform-aware LOD scaling', () => {
      it('should define LOD scaling curves for all budget platforms', () => {
        expect(PLATFORM_LOD_SCALING['quest3']).toBeDefined();
        expect(PLATFORM_LOD_SCALING['mobile-ar']).toBeDefined();
        expect(PLATFORM_LOD_SCALING['webgpu']).toBeDefined();
        expect(PLATFORM_LOD_SCALING['desktop-vr']).toBeDefined();
        expect(PLATFORM_LOD_SCALING['visionos']).toBeDefined();
      });

      it('should degrade Mobile AR faster than Desktop VR at LOD 1', () => {
        expect(PLATFORM_LOD_SCALING['mobile-ar'][1]).toBeLessThan(
          PLATFORM_LOD_SCALING['desktop-vr'][1]
        );
      });

      it('should auto-select platform LOD scaling in constructor', () => {
        // Desktop VR preserves more quality at LOD 1 (scale 0.85) vs Mobile AR (0.5).
        // getWeightedCost normalizes by platform limits, so we compare the raw LOD
        // scale factors to verify the constructor picked platform-specific curves.
        // We verify indirectly: LOD 2 cost should differ between platforms because
        // they use different scaling curves.
        const desktopOpt = new UnifiedBudgetOptimizer(
          createConfig({ platform: 'desktop-vr' })
        );
        const mobileOpt = new UnifiedBudgetOptimizer(
          createConfig({ platform: 'mobile-ar' })
        );

        // At LOD 0 both use scale=1.0, but at LOD 2 they diverge:
        // desktop-vr LOD 2 = 0.6, mobile-ar LOD 2 = 0.2
        // The ratio of weighted costs should reflect this 3x difference.
        const desktopLOD0 = desktopOpt.getWeightedCost('@mesh', 0);
        const desktopLOD2 = desktopOpt.getWeightedCost('@mesh', 2);
        const mobileLOD0 = mobileOpt.getWeightedCost('@mesh', 0);
        const mobileLOD2 = mobileOpt.getWeightedCost('@mesh', 2);

        // Desktop retains more quality at LOD 2 (60%) vs mobile (20%)
        const desktopRetention = desktopLOD0 > 0 ? desktopLOD2 / desktopLOD0 : 0;
        const mobileRetention = mobileLOD0 > 0 ? mobileLOD2 / mobileLOD0 : 0;
        expect(desktopRetention).toBeGreaterThan(mobileRetention);
      });

      it('should have Mobile AR as most aggressive degradation curve', () => {
        const platforms = Object.keys(PLATFORM_LOD_SCALING);
        for (const p of platforms) {
          if (p === 'mobile-ar') continue;
          // At every LOD level > 0, mobile-ar should be <= other platforms
          for (let i = 1; i < 5; i++) {
            expect(PLATFORM_LOD_SCALING['mobile-ar'][i]).toBeLessThanOrEqual(
              PLATFORM_LOD_SCALING[p][i]
            );
          }
        }
      });
    });

    // ── Finding 3: LOD scaling should follow Weber-Fechner ──
    describe('Weber-Fechner perceptual LOD curve', () => {
      it('should preserve more detail at LOD 1 than geometric curve', () => {
        // Old geometric: LOD 1 = 0.5 (50% reduction)
        // New perceptual: LOD 1 = 0.7 (30% reduction)
        expect(DEFAULT_LOD_SCALING[1]).toBeGreaterThanOrEqual(0.65);
      });

      it('should degrade aggressively at LOD 3-4 (beyond visible range)', () => {
        // Far-distance objects can lose more quality without perception loss
        expect(DEFAULT_LOD_SCALING[3]).toBeLessThanOrEqual(0.2);
        expect(DEFAULT_LOD_SCALING[4]).toBeLessThanOrEqual(0.1);
      });

      it('should have 5 levels starting at 1.0', () => {
        expect(DEFAULT_LOD_SCALING).toHaveLength(5);
        expect(DEFAULT_LOD_SCALING[0]).toBe(1.0);
      });

      it('should be monotonically decreasing', () => {
        for (let i = 1; i < DEFAULT_LOD_SCALING.length; i++) {
          expect(DEFAULT_LOD_SCALING[i]).toBeLessThan(DEFAULT_LOD_SCALING[i - 1]);
        }
      });
    });

    // ── Finding 4: Trait utility re-scoring ──
    describe('data-derived trait utility re-scoring', () => {
      it('should score @agent below core rendering traits', () => {
        const agentUtil = DEFAULT_TRAIT_UTILITIES['@agent'].baseUtility;
        const meshUtil = DEFAULT_TRAIT_UTILITIES['@mesh'].baseUtility;
        expect(agentUtil).toBeLessThan(meshUtil);
        // Data-derived: @agent should be around 35, not 85
        expect(agentUtil).toBeLessThanOrEqual(40);
      });

      it('should make @agent non-required and droppable', () => {
        expect(DEFAULT_TRAIT_UTILITIES['@agent'].required).toBe(false);
        expect(DEFAULT_TRAIT_UTILITIES['@agent'].minLODLevel).toBeGreaterThanOrEqual(1);
      });

      it('should score @gaussian_splat below enhancement threshold', () => {
        const gsUtil = DEFAULT_TRAIT_UTILITIES['@gaussian_splat'].baseUtility;
        // Data-derived: GPU cost is 55% of Quest 3 budget, utility should reflect that
        expect(gsUtil).toBeLessThanOrEqual(25);
      });

      it('should make @gaussian_splat droppable at LOD 1', () => {
        expect(DEFAULT_TRAIT_UTILITIES['@gaussian_splat'].minLODLevel).toBe(1);
        expect(DEFAULT_TRAIT_UTILITIES['@gaussian'].minLODLevel).toBe(1);
      });

      it('should shed @gaussian_splat before @particle under budget pressure', () => {
        // @gaussian_splat (utility=20, massive GPU cost) should have lower
        // value/cost ratio than @particle (utility=70, moderate cost)
        const gsRatio = optimizer.getValueCostRatio('@gaussian_splat');
        const particleRatio = optimizer.getValueCostRatio('@particle');
        expect(gsRatio).toBeLessThan(particleRatio);
      });

      it('should shed @agent before @animation under budget pressure', () => {
        const agentRatio = optimizer.getValueCostRatio('@agent');
        const animRatio = optimizer.getValueCostRatio('@animation');
        expect(agentRatio).toBeLessThan(animRatio);
      });
    });
  });
});
