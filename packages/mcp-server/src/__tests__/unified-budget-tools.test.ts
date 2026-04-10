/**
 * Unified Budget MCP Tools — Tests
 *
 * Tests the 3 new economy tools added in v6.1:
 * - optimize_scene_budget
 * - validate_marketplace_pricing
 * - get_unified_budget_state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleEconomyTool, resetEconomySingletons } from '../economy-tools';

// =============================================================================
// SETUP
// =============================================================================

beforeEach(() => {
  resetEconomySingletons();
});

// =============================================================================
// optimize_scene_budget
// =============================================================================

describe('optimize_scene_budget', () => {
  it('should allocate a simple scene within budget', async () => {
    const result = (await handleEconomyTool('optimize_scene_budget', {
      platform: 'desktop-vr',
      nodes: [
        { name: 'Cube', traits: ['@mesh', '@material'] },
        { name: 'Light', traits: ['@light'] },
      ],
    })) as Record<string, unknown>;

    expect(result.platform).toBe('desktop-vr');
    const summary = result.summary as Record<string, number>;
    expect(summary.totalTraits).toBe(3);
    expect(summary.includedTraits).toBe(3);
    expect(summary.excludedTraits).toBe(0);
    expect(summary.degradedTraits).toBe(0);
  });

  it('should degrade or exclude traits under quest3 pressure', async () => {
    const result = (await handleEconomyTool('optimize_scene_budget', {
      platform: 'quest3',
      nodes: [
        { name: 'Core', traits: ['@mesh', '@material', '@physics'] },
        { name: 'Heavy', traits: ['@multiview_gaussian_renderer'], count: 20 },
        { name: 'Luxury', traits: ['@ray_tracing', '@global_illumination', '@nerf'] },
      ],
    })) as Record<string, unknown>;

    const summary = result.summary as Record<string, number>;
    // Some traits must be degraded or excluded on quest3
    expect(summary.degradedTraits + summary.excludedTraits).toBeGreaterThan(0);
    // Required traits are still included
    const allocations = result.allocations as Array<{ trait: string; included: boolean }>;
    const mesh = allocations.find((a) => a.trait === '@mesh');
    expect(mesh!.included).toBe(true);
  });

  it('should handle empty nodes', async () => {
    const result = (await handleEconomyTool('optimize_scene_budget', {
      platform: 'quest3',
      nodes: [],
    })) as Record<string, unknown>;

    const summary = result.summary as Record<string, number>;
    expect(summary.totalTraits).toBe(0);
  });

  it('should respect maxLOD parameter', async () => {
    const result = (await handleEconomyTool('optimize_scene_budget', {
      platform: 'quest3',
      nodes: [
        { name: 'Core', traits: ['@mesh'] },
        { name: 'VFX', traits: ['@particle'], count: 100 },
      ],
      maxLOD: 2,
    })) as Record<string, unknown>;

    const allocations = result.allocations as Array<{ trait: string; lodLevel: number }>;
    for (const a of allocations) {
      expect(a.lodLevel).toBeLessThanOrEqual(2);
    }
  });

  it('should default to quest3 platform', async () => {
    const result = (await handleEconomyTool('optimize_scene_budget', {
      platform: 'quest3',
      nodes: [{ name: 'Obj', traits: ['@mesh'] }],
    })) as Record<string, unknown>;

    expect(result.platform).toBe('quest3');
  });

  it('should include instance counts in allocation', async () => {
    const result = (await handleEconomyTool('optimize_scene_budget', {
      platform: 'quest3',
      nodes: [{ name: 'Forest', traits: ['@mesh', '@material'], count: 50 }],
    })) as Record<string, unknown>;

    const allocations = result.allocations as Array<{
      trait: string;
      resourceCost: Record<string, number>;
    }>;
    const meshAlloc = allocations.find((a) => a.trait === '@mesh');
    expect(meshAlloc).toBeDefined();
    // With 50 instances, mesh instances should be 50
    expect(meshAlloc!.resourceCost.meshInstances).toBe(50);
  });
});

// =============================================================================
// validate_marketplace_pricing
// =============================================================================

describe('validate_marketplace_pricing', () => {
  it('should validate a reasonably priced trait', async () => {
    const result = (await handleEconomyTool('validate_marketplace_pricing', {
      traitName: '@mesh',
      listPrice: 1_000_000, // $1.00
    })) as Record<string, unknown>;

    expect(result.valid).toBe(true);
    expect(result.deficit).toBe(0);
  });

  it('should reject an underpriced gaussian trait', async () => {
    const result = (await handleEconomyTool('validate_marketplace_pricing', {
      traitName: '@gaussian',
      listPrice: 1, // Nearly free
    })) as Record<string, unknown>;

    expect(result.valid).toBe(false);
    expect(result.deficit as number).toBeGreaterThan(0);
    expect(result.message as string).toContain('below resource cost floor');
  });

  it('should detect denial-of-rendering with high instance count', async () => {
    const result = (await handleEconomyTool('validate_marketplace_pricing', {
      traitName: '@multiview_gaussian_renderer',
      listPrice: 100_000, // $0.10
      instanceCount: 100,
    })) as Record<string, unknown>;

    // 100 instances of multiview_gaussian_renderer = 2M gaussians
    // $0.10 is way too cheap for that GPU cost
    expect(result.valid).toBe(false);
  });

  it('should include cost breakdown', async () => {
    const result = (await handleEconomyTool('validate_marketplace_pricing', {
      traitName: '@particle',
      listPrice: 500_000,
    })) as Record<string, unknown>;

    const breakdown = result.costBreakdown as Record<string, number>;
    expect(breakdown.baseFee).toBeDefined();
    expect(breakdown.resourceCost).toBeDefined();
    expect(breakdown.baseFee).toBe(100_000); // DEFAULT_COST_FLOOR.baseFee
  });

  it('should normalize trait name without @ prefix', async () => {
    const result = (await handleEconomyTool('validate_marketplace_pricing', {
      traitName: 'mesh',
      listPrice: 1_000_000,
    })) as Record<string, unknown>;

    expect(result.traitName).toBe('mesh');
    expect(result.valid).toBe(true);
  });

  it('should default instanceCount to 1', async () => {
    const result = (await handleEconomyTool('validate_marketplace_pricing', {
      traitName: '@mesh',
      listPrice: 1_000_000,
    })) as Record<string, unknown>;

    expect(result.instanceCount).toBe(1);
  });
});

// =============================================================================
// get_unified_budget_state
// =============================================================================

describe('get_unified_budget_state', () => {
  it('should return zero pressure for empty scene', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
    })) as Record<string, unknown>;

    expect(result.agentId).toBe('test-agent');
    expect(result.overallPressure).toBe(0);
    expect(result.suggestedLOD).toBe(0);
    expect(result.hardLimitBreached).toBe(false);
  });

  it('should compute economic pressure', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
      economicBudget: 10_000_000,
      economicSpent: 9_000_000,
    })) as Record<string, unknown>;

    expect(result.economicPressure as number).toBeGreaterThan(0.8);
  });

  it('should compute resource pressure from scene nodes', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
      platform: 'quest3',
      nodes: [{ name: 'GaussianScene', traits: ['@gaussian'], count: 15 }],
    })) as Record<string, unknown>;

    const rp = result.resourcePressure as Record<string, number>;
    expect(rp.gaussians).toBeGreaterThan(0.5);
  });

  it('should suggest higher LOD under high pressure', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
      economicBudget: 10_000_000,
      economicSpent: 9_800_000, // 98% spent
    })) as Record<string, unknown>;

    expect(result.suggestedLOD as number).toBeGreaterThanOrEqual(2);
  });

  it('should detect hard limit breach', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
      economicBudget: 10_000_000,
      economicSpent: 15_000_000, // Over budget
    })) as Record<string, unknown>;

    expect(result.hardLimitBreached).toBe(true);
  });

  it('should provide shed candidates excluding required traits', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
      platform: 'quest3',
      nodes: [
        { name: 'Core', traits: ['@mesh', '@material', '@physics'] },
        { name: 'VFX', traits: ['@ray_tracing', '@global_illumination', '@particle'] },
      ],
    })) as Record<string, unknown>;

    const shedCandidates = result.shedCandidates as Array<{ trait: string }>;
    const shedTraits = shedCandidates.map((s) => s.trait);
    // Required traits should never be shed candidates
    expect(shedTraits).not.toContain('@mesh');
    expect(shedTraits).not.toContain('@material');
    expect(shedTraits).not.toContain('@physics');
  });

  it('should default to quest3 platform', async () => {
    const result = (await handleEconomyTool('get_unified_budget_state', {
      agentId: 'test-agent',
      nodes: [{ name: 'Obj', traits: ['@mesh'] }],
    })) as Record<string, unknown>;

    // Should work without error (quest3 default)
    expect(result.agentId).toBe('test-agent');
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

describe('error handling', () => {
  it('should throw for unknown tool name', async () => {
    await expect(handleEconomyTool('nonexistent_economy_tool', {})).rejects.toThrow(
      'Unknown economy tool'
    );
  });
});
