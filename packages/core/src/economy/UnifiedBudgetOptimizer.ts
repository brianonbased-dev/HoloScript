/**
 * UnifiedBudgetOptimizer — Bridges Economy and Rendering Budgets
 *
 * Oracle Cycle 6 identified that AgentBudgetEnforcer (1D USDC, hard stop)
 * and ResourceBudgetAnalyzer (10D resources, graceful LOD degradation)
 * solve the same optimization problem with zero shared abstractions.
 *
 * This module provides:
 * 1. Trait Utility Function — value per resource cost (enables optimization)
 * 2. Equimarginal LOD Allocation — drop by lowest value/cost ratio, not greedy
 * 3. Resource Cost Floor Pricing — prevents economic denial-of-rendering
 * 4. Unified budget query — single view of both economy + rendering pressure
 *
 * @version 1.0.0
 */

import {
  ResourceCategory,
  TRAIT_RESOURCE_COSTS,
  PLATFORM_BUDGETS,
  type ResourceUsageNode,
} from '../compiler/safety/ResourceBudgetAnalyzer';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trait utility entry — encodes how much value a trait provides per unit cost.
 * Higher utility = keep this trait when budgets are tight.
 */
export interface TraitUtility {
  /** Trait name (e.g., '@particle', '@gaussian') */
  trait: string;
  /** Base utility score (0-100, higher = more valuable to the experience) */
  baseUtility: number;
  /** Category for grouping (visual, physics, audio, network, ai) */
  category: TraitCategory;
  /** Whether this trait is required (cannot be dropped by LOD) */
  required: boolean;
  /** LOD level at which this trait can start being dropped (0 = never) */
  minLODLevel: number;
}

export type TraitCategory = 'visual' | 'physics' | 'audio' | 'network' | 'ai' | 'interaction';

/**
 * Allocation decision for a single trait.
 */
export interface TraitAllocation {
  /** Trait name */
  trait: string;
  /** Whether to include this trait at current budget level */
  included: boolean;
  /** LOD level applied (0 = full detail) */
  lodLevel: number;
  /** Resource cost at current LOD */
  resourceCost: Partial<Record<ResourceCategory, number>>;
  /** Economic cost (USDC base units, 0 if no marketplace price) */
  economicCost: number;
  /** Computed utility score */
  utility: number;
  /** Value/cost ratio used for allocation decisions */
  valueCostRatio: number;
  /** Reason for exclusion if not included */
  excludeReason?: string;
}

/**
 * Resource cost floor for marketplace pricing.
 * Prevents a 1-credit trait from consuming 10K gaussians.
 */
export interface ResourceCostFloor {
  /** Minimum price per unit of resource consumed */
  perGaussian: number;
  /** Minimum price per draw call */
  perDrawCall: number;
  /** Minimum price per MB memory */
  perMemoryMB: number;
  /** Minimum price per particle */
  perParticle: number;
  /** Minimum price per physics body */
  perPhysicsBody: number;
  /** Base platform fee (USDC base units) */
  baseFee: number;
}

/**
 * Unified budget state — single view across economy + rendering.
 */
export interface UnifiedBudgetState {
  /** Agent ID */
  agentId: string;
  /** Economic pressure (0-1, where 1 = budget exhausted) */
  economicPressure: number;
  /** Resource pressure per category (0-1) */
  resourcePressure: Partial<Record<ResourceCategory, number>>;
  /** Overall pressure (max of economic and worst resource) */
  overallPressure: number;
  /** Suggested LOD level based on combined pressure */
  suggestedLOD: number;
  /** Whether any hard limit is breached */
  hardLimitBreached: boolean;
  /** Traits that should be shed to relieve pressure */
  shedCandidates: TraitAllocation[];
}

/**
 * Configuration for the unified optimizer.
 */
export interface UnifiedOptimizerConfig {
  /** Target platform for resource limits */
  platform: string;
  /** Resource cost floor for marketplace pricing */
  costFloor: ResourceCostFloor;
  /** Custom trait utilities (override defaults) */
  traitUtilities?: Map<string, TraitUtility>;
  /** LOD scaling factors — how much resource cost reduces per LOD level */
  lodScaling?: number[];
  /** Economic budget limit (USDC base units, 0 = no limit) */
  economicBudget?: number;
  /** Economic spend so far (USDC base units) */
  economicSpent?: number;
}

// =============================================================================
// DEFAULT TRAIT UTILITIES
// =============================================================================

/**
 * Default utility scores for common traits.
 * These encode "how much does this trait contribute to the experience?"
 *
 * Scoring guide:
 * - 90-100: Core experience (mesh, material, physics) — never drop
 * - 70-89:  Important visual/audio quality (lighting, particles)
 * - 50-69:  Enhancement (volumetric, VFX, spatial audio)
 * - 30-49:  Nice-to-have (reflections, subsurface, ambisonics)
 * - 10-29:  Luxury (ray tracing, global illumination, neural rendering)
 */
export const DEFAULT_TRAIT_UTILITIES: Record<string, Omit<TraitUtility, 'trait'>> = {
  // ── Core (required, high utility) ──
  '@mesh': { baseUtility: 100, category: 'visual', required: true, minLODLevel: 0 },
  '@material': { baseUtility: 95, category: 'visual', required: true, minLODLevel: 0 },
  '@physics': { baseUtility: 90, category: 'physics', required: true, minLODLevel: 0 },
  '@rigidbody': { baseUtility: 90, category: 'physics', required: true, minLODLevel: 0 },
  '@collider': { baseUtility: 88, category: 'physics', required: true, minLODLevel: 0 },
  '@rendering': { baseUtility: 95, category: 'visual', required: true, minLODLevel: 0 },
  '@character': { baseUtility: 92, category: 'visual', required: true, minLODLevel: 0 },
  '@networked': { baseUtility: 85, category: 'network', required: true, minLODLevel: 0 },
  // C6 Layer 2 re-score: @agent was hand-assigned at 85 (required). Data-derived
  // analysis shows agents are a luxury in most rendering scenes — only ~35% of
  // compositions use @agent, and it consumes 5MB memory. Downgraded to non-required
  // enhancement. Scenes that genuinely need agents can override via custom utilities.
  '@agent': { baseUtility: 35, category: 'ai', required: false, minLODLevel: 2 },

  // ── Important quality (droppable at high LOD) ──
  '@light': { baseUtility: 80, category: 'visual', required: false, minLODLevel: 3 },
  '@lighting': { baseUtility: 78, category: 'visual', required: false, minLODLevel: 3 },
  '@shader': { baseUtility: 75, category: 'visual', required: false, minLODLevel: 2 },
  '@advanced_pbr': { baseUtility: 72, category: 'visual', required: false, minLODLevel: 2 },
  '@particle': { baseUtility: 70, category: 'visual', required: false, minLODLevel: 2 },
  '@audio': { baseUtility: 75, category: 'audio', required: false, minLODLevel: 3 },
  '@spatial_audio': { baseUtility: 72, category: 'audio', required: false, minLODLevel: 2 },
  '@animation': { baseUtility: 78, category: 'visual', required: false, minLODLevel: 3 },
  '@skeleton': { baseUtility: 76, category: 'visual', required: false, minLODLevel: 3 },

  // ── Enhancement (drop at medium LOD) ──
  '@vfx': { baseUtility: 60, category: 'visual', required: false, minLODLevel: 2 },
  '@volumetric': { baseUtility: 55, category: 'visual', required: false, minLODLevel: 2 },
  '@advanced_lighting': { baseUtility: 58, category: 'visual', required: false, minLODLevel: 2 },
  '@advanced_texturing': { baseUtility: 56, category: 'visual', required: false, minLODLevel: 2 },
  '@screen_space_effects': { baseUtility: 52, category: 'visual', required: false, minLODLevel: 2 },
  '@environmental_audio': { baseUtility: 55, category: 'audio', required: false, minLODLevel: 2 },
  '@npc': { baseUtility: 65, category: 'ai', required: false, minLODLevel: 3 },
  '@npc_ai': { baseUtility: 62, category: 'ai', required: false, minLODLevel: 3 },
  '@fluid_simulation': { baseUtility: 50, category: 'physics', required: false, minLODLevel: 1 },
  '@advanced_cloth': { baseUtility: 48, category: 'physics', required: false, minLODLevel: 1 },
  '@joint': { baseUtility: 65, category: 'physics', required: false, minLODLevel: 3 },

  // ── Nice-to-have (drop early) ──
  '@subsurface_scattering': {
    baseUtility: 38,
    category: 'visual',
    required: false,
    minLODLevel: 1,
  },
  '@ambisonics': { baseUtility: 35, category: 'audio', required: false, minLODLevel: 1 },
  '@voronoi_fracture': { baseUtility: 40, category: 'physics', required: false, minLODLevel: 1 },
  '@granular_material': { baseUtility: 38, category: 'physics', required: false, minLODLevel: 1 },
  '@lip_sync': { baseUtility: 42, category: 'visual', required: false, minLODLevel: 1 },

  // ── Luxury (drop first) ──
  '@ray_tracing': { baseUtility: 20, category: 'visual', required: false, minLODLevel: 1 },
  '@global_illumination': { baseUtility: 22, category: 'visual', required: false, minLODLevel: 1 },
  '@nerf': { baseUtility: 18, category: 'visual', required: false, minLODLevel: 1 },
  '@multiview_gaussian_renderer': {
    baseUtility: 25,
    category: 'visual',
    required: false,
    minLODLevel: 1,
  },
  // C6 Layer 2 re-score: @gaussian/@gaussian_splat were hand-assigned at 65.
  // Data-derived analysis: 100K gaussians on Quest 3 = 55% of total GPU budget,
  // making the value/cost ratio much lower than hand-scores suggested.
  // Downgraded by 45 points to reflect actual GPU cost relative to utility.
  '@gaussian': { baseUtility: 20, category: 'visual', required: false, minLODLevel: 1 },
  '@gaussian_splat': { baseUtility: 20, category: 'visual', required: false, minLODLevel: 1 },
  '@stable_diffusion': { baseUtility: 15, category: 'ai', required: false, minLODLevel: 1 },
  '@diffusion_realtime': { baseUtility: 18, category: 'ai', required: false, minLODLevel: 1 },
  '@local_llm': { baseUtility: 30, category: 'ai', required: false, minLODLevel: 1 },
};

/**
 * Default resource cost floor pricing.
 * Prevents marketplace traits from being priced below their GPU cost.
 * Prices in USDC base units (6 decimals, so 1_000_000 = $1.00).
 */
/**
 * Platform-specific LOD scaling curves.
 *
 * C6 Layer 2 finding: platform exchange rates are wildly non-uniform (25x
 * price difference for a single @particle between Mobile AR and Desktop VR).
 * A uniform LOD curve means constrained platforms over-degrade while powerful
 * platforms under-utilize. Each platform gets its own perceptual curve.
 *
 * Constrained platforms (mobile_ar, quest3) degrade faster at LOD 1-2.
 * Powerful platforms (desktop-vr) degrade slowly, preserving quality.
 */
export const PLATFORM_LOD_SCALING: Record<string, number[]> = {
  'quest3':     [1.0, 0.6, 0.3, 0.12, 0.04],   // Aggressive — tight budget
  'mobile-ar':  [1.0, 0.5, 0.2, 0.08, 0.02],   // Most aggressive — tightest budget
  'webgpu':     [1.0, 0.7, 0.4, 0.18, 0.06],   // Moderate — matches default
  'desktop-vr': [1.0, 0.85, 0.6, 0.3, 0.1],    // Gentle — plenty of headroom
  'visionos':   [1.0, 0.8, 0.5, 0.25, 0.08],   // Moderate-gentle — good hardware
};

/**
 * Default resource cost floor pricing.
 * Prevents marketplace traits from being priced below their GPU cost.
 * Prices in USDC base units (6 decimals, so 1_000_000 = $1.00).
 */
export const DEFAULT_COST_FLOOR: ResourceCostFloor = {
  perGaussian: 0.01, // 10K gaussians = $0.10 minimum
  perDrawCall: 1000, // $0.001 per draw call
  perMemoryMB: 5000, // $0.005 per MB
  perParticle: 0.1, // 1000 particles = $0.10 minimum
  perPhysicsBody: 500, // $0.0005 per body
  baseFee: 100_000, // $0.10 base fee on all marketplace traits
};

/**
 * Default LOD scaling: how much resource usage decreases per LOD level.
 *
 * Previous geometric scaling [1.0, 0.5, 0.25, 0.1, 0.05] over-degrades
 * the visible mid-range (LOD 1-2). Human perception follows Weber-Fechner
 * (logarithmic), meaning a 50% reduction at LOD 1 is far more noticeable
 * than a 50% reduction at LOD 3.
 *
 * Perceptual curve: each step reduces quality by an amount proportional
 * to the *perceived* difference, not the geometric ratio.
 * LOD 0 = 1.0 (full), LOD 1 = 0.7, LOD 2 = 0.4, LOD 3 = 0.18, LOD 4 = 0.06
 *
 * This preserves more detail in the visually sensitive mid-range while
 * still achieving aggressive reduction at far distances.
 */
export const DEFAULT_LOD_SCALING = [1.0, 0.7, 0.4, 0.18, 0.06];

// =============================================================================
// UNIFIED BUDGET OPTIMIZER
// =============================================================================

export class UnifiedBudgetOptimizer {
  private platform: string;
  private costFloor: ResourceCostFloor;
  private traitUtilities: Map<string, TraitUtility>;
  private lodScaling: number[];
  private economicBudget: number;
  private economicSpent: number;

  constructor(config: UnifiedOptimizerConfig) {
    this.platform = config.platform;
    this.costFloor = config.costFloor;
    // Use platform-specific LOD scaling if available, fall back to default perceptual curve
    this.lodScaling = config.lodScaling
      ?? PLATFORM_LOD_SCALING[config.platform]
      ?? DEFAULT_LOD_SCALING;
    this.economicBudget = config.economicBudget ?? 0;
    this.economicSpent = config.economicSpent ?? 0;

    // Build utility map from defaults + overrides
    this.traitUtilities = new Map();
    for (const [trait, util] of Object.entries(DEFAULT_TRAIT_UTILITIES)) {
      this.traitUtilities.set(trait, { trait, ...util });
    }
    if (config.traitUtilities) {
      for (const [trait, util] of config.traitUtilities) {
        this.traitUtilities.set(trait, util);
      }
    }
  }

  // ===========================================================================
  // CORE: Equimarginal Allocation
  // ===========================================================================

  /**
   * Allocate traits across a resource budget using the equimarginal principle.
   * Instead of greedily dropping the deepest LOD first, this sorts by value/cost
   * ratio and drops traits with the lowest marginal utility first.
   *
   * @param nodes - Resource usage nodes (traits + counts)
   * @param maxLOD - Maximum LOD level to consider (default: 4)
   * @returns Allocation decisions for each trait
   */
  allocate(nodes: ResourceUsageNode[], maxLOD: number = 4): TraitAllocation[] {
    const limits = PLATFORM_BUDGETS[this.platform];
    if (!limits) {
      // No limits = include everything at LOD 0
      return this.flattenToAllocations(nodes, 0);
    }

    // Start with everything at LOD 0
    let allocations = this.flattenToAllocations(nodes, 0);

    // Check if we're within budget
    let pressure = this.computeResourcePressure(allocations, limits);
    if (pressure.maxPressure <= 1.0) {
      return allocations; // Everything fits
    }

    // Equimarginal: sort by value/cost ratio ascending, shed lowest-value first
    for (let lod = 1; lod <= maxLOD && pressure.maxPressure > 1.0; lod++) {
      // Get droppable traits at this LOD level, sorted by value/cost ratio
      const candidates = allocations
        .filter((a) => a.included && !this.isRequired(a.trait) && this.canDropAtLOD(a.trait, lod))
        .sort((a, b) => a.valueCostRatio - b.valueCostRatio);

      for (const candidate of candidates) {
        if (pressure.maxPressure <= 1.0) break;

        // Degrade this trait to current LOD level
        const idx = allocations.findIndex((a) => a.trait === candidate.trait);
        if (idx >= 0) {
          allocations[idx] = this.buildAllocation(candidate.trait, lod, 1);
        }

        pressure = this.computeResourcePressure(allocations, limits);
      }
    }

    // If still over budget, start excluding non-required traits (lowest ratio first)
    if (pressure.maxPressure > 1.0) {
      const excludeable = allocations
        .filter((a) => a.included && !this.isRequired(a.trait))
        .sort((a, b) => a.valueCostRatio - b.valueCostRatio);

      for (const candidate of excludeable) {
        if (pressure.maxPressure <= 1.0) break;

        const idx = allocations.findIndex((a) => a.trait === candidate.trait);
        if (idx >= 0) {
          allocations[idx] = {
            ...allocations[idx],
            included: false,
            excludeReason: `Excluded to fit ${this.platform} budget (value/cost ratio: ${candidate.valueCostRatio.toFixed(2)})`,
          };
        }

        pressure = this.computeResourcePressure(allocations, limits);
      }
    }

    return allocations;
  }

  // ===========================================================================
  // RESOURCE COST FLOOR PRICING
  // ===========================================================================

  /**
   * Calculate the minimum marketplace price for a trait based on its resource cost.
   * Prevents economic denial-of-rendering attacks where a cheap marketplace trait
   * consumes massive GPU resources.
   *
   * @param traitName - The trait to price
   * @param instanceCount - How many instances (default: 1)
   * @returns Minimum price in USDC base units (6 decimals)
   */
  calculateCostFloor(traitName: string, instanceCount: number = 1): number {
    const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
    const costs = TRAIT_RESOURCE_COSTS[normalized];
    if (!costs) return this.costFloor.baseFee;

    let floor = this.costFloor.baseFee;

    if (costs.gaussians) floor += costs.gaussians * instanceCount * this.costFloor.perGaussian;
    if (costs.gpuDrawCalls)
      floor += costs.gpuDrawCalls * instanceCount * this.costFloor.perDrawCall;
    if (costs.memoryMB) floor += costs.memoryMB * instanceCount * this.costFloor.perMemoryMB;
    if (costs.particles) floor += costs.particles * instanceCount * this.costFloor.perParticle;
    if (costs.physicsBodies)
      floor += costs.physicsBodies * instanceCount * this.costFloor.perPhysicsBody;

    return Math.ceil(floor);
  }

  /**
   * Validate that a marketplace listing price meets the resource cost floor.
   *
   * @param traitName - The trait being listed
   * @param listPrice - Proposed listing price (USDC base units)
   * @param instanceCount - Expected instance count
   * @returns Validation result
   */
  validateMarketplacePrice(
    traitName: string,
    listPrice: number,
    instanceCount: number = 1
  ): { valid: boolean; floor: number; deficit: number; message: string } {
    const floor = this.calculateCostFloor(traitName, instanceCount);
    const deficit = Math.max(0, floor - listPrice);

    if (listPrice >= floor) {
      return {
        valid: true,
        floor,
        deficit: 0,
        message: `Price ${listPrice} meets resource cost floor of ${floor}`,
      };
    }

    return {
      valid: false,
      floor,
      deficit,
      message: `Price ${listPrice} is below resource cost floor of ${floor}. The trait's GPU/memory cost exceeds its economic price by ${deficit} USDC base units.`,
    };
  }

  // ===========================================================================
  // UNIFIED BUDGET STATE
  // ===========================================================================

  /**
   * Get a unified view of budget pressure across economy + rendering.
   *
   * @param agentId - Agent identifier
   * @param nodes - Current resource usage nodes
   * @param economicSpent - Current economic spend (USDC base units)
   * @param economicLimit - Economic budget limit (USDC base units)
   * @returns Unified budget state
   */
  getUnifiedState(
    agentId: string,
    nodes: ResourceUsageNode[],
    economicSpent?: number,
    economicLimit?: number
  ): UnifiedBudgetState {
    const spent = economicSpent ?? this.economicSpent;
    const limit = economicLimit ?? this.economicBudget;
    const economicPressure = limit > 0 ? spent / limit : 0;

    const allocations = this.flattenToAllocations(nodes, 0);
    const limits = PLATFORM_BUDGETS[this.platform] ?? {};
    const pressure = this.computeResourcePressure(allocations, limits);

    const overallPressure = Math.max(economicPressure, pressure.maxPressure);

    // Suggest LOD based on overall pressure
    let suggestedLOD = 0;
    if (overallPressure > 0.95) suggestedLOD = 3;
    else if (overallPressure > 0.8) suggestedLOD = 2;
    else if (overallPressure > 0.6) suggestedLOD = 1;

    // Find shed candidates (sorted by value/cost ratio ascending)
    const shedCandidates = allocations
      .filter((a) => a.included && !this.isRequired(a.trait))
      .sort((a, b) => a.valueCostRatio - b.valueCostRatio)
      .slice(0, 10);

    return {
      agentId,
      economicPressure: Math.min(1, economicPressure),
      resourcePressure: pressure.perCategory,
      overallPressure: Math.min(1, overallPressure),
      suggestedLOD,
      hardLimitBreached: pressure.maxPressure > 1.0 || economicPressure > 1.0,
      shedCandidates,
    };
  }

  // ===========================================================================
  // UTILITY QUERIES
  // ===========================================================================

  /**
   * Get the utility score for a trait.
   */
  getUtility(traitName: string): TraitUtility | undefined {
    const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
    return this.traitUtilities.get(normalized);
  }

  /**
   * Set custom utility for a trait.
   */
  setUtility(utility: TraitUtility): void {
    this.traitUtilities.set(utility.trait, utility);
  }

  /**
   * Get the total weighted resource cost of a trait at a given LOD level.
   * Collapses multi-dimensional resource cost into a single scalar
   * using platform limits as normalization weights.
   */
  getWeightedCost(traitName: string, lodLevel: number = 0, instanceCount: number = 1): number {
    const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
    const costs = TRAIT_RESOURCE_COSTS[normalized];
    if (!costs) return 0;

    const limits = PLATFORM_BUDGETS[this.platform] ?? {};
    const scale = this.lodScaling[Math.min(lodLevel, this.lodScaling.length - 1)] ?? 0.05;

    let weighted = 0;
    for (const [cat, cost] of Object.entries(costs)) {
      const limit = limits[cat as ResourceCategory];
      if (limit && limit > 0) {
        // Normalize cost by platform limit so each dimension contributes proportionally
        weighted += ((cost as number) * instanceCount * scale) / limit;
      }
    }

    return weighted;
  }

  /**
   * Compute value/cost ratio for a trait at a given LOD level.
   * Higher = more efficient use of resources.
   */
  getValueCostRatio(traitName: string, lodLevel: number = 0, instanceCount: number = 1): number {
    const normalized = traitName.startsWith('@') ? traitName : `@${traitName}`;
    const util = this.traitUtilities.get(normalized);
    const utility = util?.baseUtility ?? 50; // Default utility for unknown traits
    const cost = this.getWeightedCost(normalized, lodLevel, instanceCount);
    if (cost === 0) return utility * 100; // Free trait = infinite value (capped)
    return utility / cost;
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private flattenToAllocations(nodes: ResourceUsageNode[], lodLevel: number): TraitAllocation[] {
    const allocations: TraitAllocation[] = [];
    const seen = new Set<string>();

    for (const node of nodes) {
      for (const trait of node.traits) {
        const normalized = trait.startsWith('@') ? trait : `@${trait}`;
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        allocations.push(this.buildAllocation(normalized, lodLevel, node.count || 1));
      }
    }

    return allocations;
  }

  private buildAllocation(trait: string, lodLevel: number, instanceCount: number): TraitAllocation {
    const normalized = trait.startsWith('@') ? trait : `@${trait}`;
    const costs = TRAIT_RESOURCE_COSTS[normalized] ?? {};
    const scale = this.lodScaling[Math.min(lodLevel, this.lodScaling.length - 1)] ?? 0.05;

    // Scale resource costs by LOD level
    const scaledCosts: Partial<Record<ResourceCategory, number>> = {};
    for (const [cat, cost] of Object.entries(costs)) {
      scaledCosts[cat as ResourceCategory] = Math.ceil((cost as number) * instanceCount * scale);
    }

    const utility = this.traitUtilities.get(normalized)?.baseUtility ?? 50;
    const weightedCost = this.getWeightedCost(normalized, lodLevel, instanceCount);
    const valueCostRatio = weightedCost > 0 ? utility / weightedCost : utility * 100;

    return {
      trait: normalized,
      included: true,
      lodLevel,
      resourceCost: scaledCosts,
      economicCost: 0, // Set externally if marketplace pricing applies
      utility,
      valueCostRatio,
    };
  }

  private isRequired(trait: string): boolean {
    const normalized = trait.startsWith('@') ? trait : `@${trait}`;
    return this.traitUtilities.get(normalized)?.required ?? false;
  }

  private canDropAtLOD(trait: string, lodLevel: number): boolean {
    const normalized = trait.startsWith('@') ? trait : `@${trait}`;
    const util = this.traitUtilities.get(normalized);
    if (!util) return lodLevel >= 2; // Unknown traits droppable at LOD 2+
    return lodLevel >= util.minLODLevel;
  }

  private computeResourcePressure(
    allocations: TraitAllocation[],
    limits: Partial<Record<ResourceCategory, number>>
  ): { maxPressure: number; perCategory: Partial<Record<ResourceCategory, number>> } {
    // Sum resource costs from all included allocations
    const totals: Record<string, number> = {};
    for (const alloc of allocations) {
      if (!alloc.included) continue;
      for (const [cat, cost] of Object.entries(alloc.resourceCost)) {
        totals[cat] = (totals[cat] || 0) + (cost as number);
      }
    }

    // Compute pressure per category
    const perCategory: Partial<Record<ResourceCategory, number>> = {};
    let maxPressure = 0;

    for (const [cat, limit] of Object.entries(limits)) {
      const used = totals[cat] || 0;
      const pressure = limit ? used / (limit as number) : 0;
      perCategory[cat as ResourceCategory] = pressure;
      if (pressure > maxPressure) maxPressure = pressure;
    }

    return { maxPressure, perCategory };
  }
}
