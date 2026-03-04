/**
 * @fileoverview Economic Trait Definitions for HoloScript
 * @module @holoscript/std/traits
 *
 * Defines five economic primitive traits that compose with existing VR traits
 * and leverage RBAC for economic permission enforcement:
 *
 * 1. @tradeable       - Ownership, transfer, and trade settlement
 * 2. @depreciating    - Time-based value decay (hard sink mechanic)
 * 3. @bonding_curved  - Autonomous price discovery via bonding curves
 * 4. @taxable_wealth  - Progressive wealth taxation with redistribution
 * 5. @pid_controlled  - Dual-loop PID feedback for faucet/sink regulation
 *
 * These traits implement the research-proven mechanisms from:
 * - P.030.01 Dual-Loop PID Economy Controller
 * - P.030.02 Bonding Curve Marketplace
 * - P.030.03 Progressive Wealth Recycling
 * - W.031 Faucet-Sink Ratio as Master Variable
 * - W.032 Dual-Loop Feedback Control
 * - W.034 Wealth Tax > Income Tax for Gini Reduction
 * - W.035 Bonding Curves for Price Discovery
 *
 * RBAC Integration:
 * Each trait declares required permissions from the economy.* permission
 * category. The HoloScript compiler enforces these at compile time via
 * the existing AgentRBAC system.
 *
 * @version 1.0.0
 * @category economic
 */

import type { TraitDefinition } from '../types.js';

/**
 * Extended trait definition with economic-specific metadata.
 */
export interface EconomicTraitDefinition extends TraitDefinition {
  /** RBAC permissions required to use this trait */
  requiredPermissions: string[];
  /** Economic layer this trait operates at (from 9-layer architecture) */
  economicLayer: number;
  /** Composability: which other economic traits this one works with */
  composesWith: string[];
  /** Compiler hints for code generation */
  compiler_hints?: {
    requires_runtime?: string[];
    thread_safety?: 'main_thread' | 'worker_thread' | 'any';
    performance_budget_ms?: number;
  };
}

// =============================================================================
// TRAIT DEFINITIONS
// =============================================================================

/**
 * The five economic primitive traits.
 */
export const EconomicTraits: Record<string, EconomicTraitDefinition> = {

  // ---------------------------------------------------------------------------
  // 1. TRADEABLE
  // ---------------------------------------------------------------------------
  tradeable: {
    name: '@tradeable',
    description:
      'Makes a composition or node transferable between agents. Tracks ownership ' +
      'history with transaction hashes for integrity verification (P.030.04). ' +
      'Supports lock/unlock for escrow patterns and auction integration.',
    params: {
      initial_owner: {
        type: 'AgentID',
        required: true,
        description: 'The agent who initially owns this entity.',
      },
      transferable: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Whether transfers are currently allowed.',
      },
      min_price: {
        type: 'number',
        required: false,
        default: 0,
        description: 'Minimum trade price (prevents value manipulation).',
      },
      max_history: {
        type: 'number',
        required: false,
        default: 50,
        description: 'Maximum ownership history entries retained.',
      },
      requires_presence: {
        type: 'boolean',
        required: false,
        default: false,
        description:
          'VR-specific: require spatial co-location for trade (anti-exploit, Layer 7).',
      },
      presence_radius: {
        type: 'number',
        required: false,
        default: 5.0,
        description: 'Maximum distance in meters for presence-based trades.',
      },
    },
    validator: (params) => {
      if (!params.initial_owner || typeof params.initial_owner !== 'string') return false;
      if (params.min_price !== undefined && params.min_price < 0) return false;
      return true;
    },
    requiredPermissions: ['economy.trade'],
    economicLayer: 0, // Layer 0: Integrity
    composesWith: ['@depreciating', '@bonding_curved', '@taxable_wealth'],
    compiler_hints: {
      requires_runtime: ['EconomicRuntime.executeTrade', 'EconomicRuntime.verifyOwnership'],
      thread_safety: 'any',
    },
  },

  // ---------------------------------------------------------------------------
  // 2. DEPRECIATING
  // ---------------------------------------------------------------------------
  depreciating: {
    name: '@depreciating',
    description:
      'Applies time-based value decay to an entity (hard sink mechanic). ' +
      'Uses exponential decay: condition(t) = condition(0) * e^(-rate * t). ' +
      'When condition reaches destroy_threshold, the entity is consumed -- ' +
      'removing currency/value from circulation permanently (W.031).',
    params: {
      decay_rate: {
        type: 'number',
        required: true,
        description:
          'Per-second decay rate (0.0 - 1.0). E.g., 0.001 = 0.1% per second.',
      },
      initial_condition: {
        type: 'number',
        required: false,
        default: 1.0,
        description: 'Starting condition (1.0 = mint, 0.0 = destroyed).',
      },
      destroy_threshold: {
        type: 'number',
        required: false,
        default: 0.01,
        description: 'Condition level at which the entity is destroyed.',
      },
      repairable: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Whether the entity can be repaired to restore condition.',
      },
      repair_cost_multiplier: {
        type: 'number',
        required: false,
        default: 0.5,
        description: 'Repair cost as a fraction of base value per unit condition.',
      },
      emit_on_destroy: {
        type: 'string',
        required: false,
        default: 'on_entity_destroyed',
        description: 'Event emitted when condition reaches destroy threshold.',
      },
    },
    validator: (params) => {
      if (params.decay_rate === undefined || params.decay_rate < 0 || params.decay_rate > 1) return false;
      if (params.initial_condition !== undefined && (params.initial_condition < 0 || params.initial_condition > 1)) return false;
      if (params.destroy_threshold !== undefined && (params.destroy_threshold < 0 || params.destroy_threshold > 1)) return false;
      return true;
    },
    requiredPermissions: ['economy.burn'],
    economicLayer: 1, // Layer 1: Flow Control (sink side)
    composesWith: ['@tradeable', '@bonding_curved'],
    compiler_hints: {
      requires_runtime: ['EconomicRuntime.updateDepreciation', 'EconomicRuntime.destroyEntity'],
      thread_safety: 'worker_thread',
      performance_budget_ms: 0.1, // Must be fast -- called every tick
    },
  },

  // ---------------------------------------------------------------------------
  // 3. BONDING_CURVED
  // ---------------------------------------------------------------------------
  bonding_curved: {
    name: '@bonding_curved',
    description:
      'Attaches a bonding curve to a marketplace or item category for autonomous ' +
      'price discovery. Price is determined by P = f(supply) where f depends on ' +
      'curve_type. Provides continuous liquidity via reserve pool without order ' +
      'books (W.035, P.030.02). Supports spatial pricing for VR trade geography.',
    params: {
      curve_type: {
        type: 'string',
        required: false,
        default: 'exponential',
        description: 'Curve shape: linear | exponential | logarithmic | sigmoid.',
        validation: (val: any) => ['linear', 'exponential', 'logarithmic', 'sigmoid'].includes(val),
      },
      reserve_ratio: {
        type: 'number',
        required: true,
        description: 'Base price multiplier (R in the price formula).',
      },
      curve_steepness: {
        type: 'number',
        required: false,
        default: 2.0,
        description: 'Controls price sensitivity to supply changes (n in P = R * S^(1/n)).',
      },
      transaction_fee: {
        type: 'number',
        required: false,
        default: 0.02,
        description: 'Fee percentage per transaction (hard sink). Range: 0.0 - 0.5.',
      },
      initial_supply: {
        type: 'number',
        required: false,
        default: 0,
        description: 'Initial token/item supply on the curve.',
      },
      initial_reserve: {
        type: 'number',
        required: false,
        default: 0,
        description: 'Initial reserve pool balance backing the curve.',
      },
      sigmoid_k: {
        type: 'number',
        required: false,
        default: 100,
        description: 'Half-saturation constant for sigmoid curves.',
      },
      spatial_distance_factor: {
        type: 'number',
        required: false,
        default: 0.0,
        description:
          'VR spatial pricing: price multiplier per unit distance from hub. ' +
          '0.0 = no spatial effect. Creates emergent trade routes (P.030.02 ENRICHED).',
      },
    },
    validator: (params) => {
      if (params.reserve_ratio === undefined || params.reserve_ratio <= 0) return false;
      if (params.curve_steepness !== undefined && params.curve_steepness <= 0) return false;
      if (params.transaction_fee !== undefined && (params.transaction_fee < 0 || params.transaction_fee > 0.5)) return false;
      if (params.curve_type !== undefined) {
        if (!['linear', 'exponential', 'logarithmic', 'sigmoid'].includes(params.curve_type)) return false;
      }
      return true;
    },
    requiredPermissions: ['economy.set_price', 'economy.trade'],
    economicLayer: 2, // Layer 2: Price Discovery
    composesWith: ['@tradeable', '@depreciating', '@pid_controlled'],
    compiler_hints: {
      requires_runtime: [
        'EconomicRuntime.bondingCurveBuy',
        'EconomicRuntime.bondingCurveSell',
        'EconomicRuntime.getSpotPrice',
      ],
      thread_safety: 'any',
      performance_budget_ms: 1.0,
    },
  },

  // ---------------------------------------------------------------------------
  // 4. TAXABLE_WEALTH
  // ---------------------------------------------------------------------------
  taxable_wealth: {
    name: '@taxable_wealth',
    description:
      'Applies progressive logarithmic wealth taxation with optional redistribution ' +
      'to the lowest-wealth quintile (P.030.03, W.034). Tax = 0 below threshold, ' +
      'then rate = min(max_rate, log(wealth/threshold) * base_rate). Collected taxes ' +
      'are partially redistributed (UBI) and partially burned (hard sink).',
    params: {
      threshold: {
        type: 'number',
        required: true,
        description: 'Wealth level below which no tax is levied.',
      },
      base_rate: {
        type: 'number',
        required: false,
        default: 0.01,
        description: 'Base tax rate multiplied by log(wealth/threshold). Range: 0.0 - 0.1.',
      },
      max_effective_rate: {
        type: 'number',
        required: false,
        default: 0.05,
        description: 'Maximum effective tax rate cap (prevents punishing engagement).',
      },
      collection_interval: {
        type: 'string',
        required: false,
        default: 'daily',
        description: 'How often taxes are collected: hourly | daily | weekly.',
        validation: (val: any) => ['hourly', 'daily', 'weekly'].includes(val),
      },
      enable_redistribution: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Whether collected tax is redistributed to lowest-wealth players.',
      },
      redistribution_fraction: {
        type: 'number',
        required: false,
        default: 0.7,
        description:
          'Fraction of tax redistributed (remainder burned as hard sink). Range: 0.0 - 1.0.',
      },
      emit_on_collection: {
        type: 'string',
        required: false,
        default: 'on_tax_collected',
        description: 'Event emitted when taxes are collected.',
      },
      public_ledger: {
        type: 'boolean',
        required: false,
        default: true,
        description:
          'Whether tax collections and redistribution are visible in the ' +
          'economy dashboard (Layer 6: Transparency, W.038).',
      },
    },
    validator: (params) => {
      if (params.threshold === undefined || params.threshold < 0) return false;
      if (params.base_rate !== undefined && (params.base_rate < 0 || params.base_rate > 0.1)) return false;
      if (params.max_effective_rate !== undefined && (params.max_effective_rate < 0 || params.max_effective_rate > 1.0)) return false;
      if (params.redistribution_fraction !== undefined && (params.redistribution_fraction < 0 || params.redistribution_fraction > 1.0)) return false;
      return true;
    },
    requiredPermissions: ['economy.tax', 'economy.redistribute'],
    economicLayer: 4, // Layer 4: Redistribution
    composesWith: ['@tradeable', '@pid_controlled'],
    compiler_hints: {
      requires_runtime: [
        'EconomicRuntime.collectTax',
        'EconomicRuntime.redistribute',
        'EconomicRuntime.getGiniCoefficient',
      ],
      thread_safety: 'worker_thread',
      performance_budget_ms: 5.0, // Runs on collection interval, not per-frame
    },
  },

  // ---------------------------------------------------------------------------
  // 5. PID_CONTROLLED
  // ---------------------------------------------------------------------------
  pid_controlled: {
    name: '@pid_controlled',
    description:
      'Attaches a dual-loop PID feedback controller to regulate economic flow ' +
      '(P.030.01, W.032). Inner loop adjusts per-source faucet rates (fast). ' +
      'Outer loop adjusts inner setpoint based on total money supply (slow). ' +
      'Achieves <10% currency variance long-term while preserving gameplay variance.',
    params: {
      target_per_capita: {
        type: 'number',
        required: true,
        description: 'Target currency per active player (outer loop setpoint).',
      },
      inner_kp: {
        type: 'number',
        required: false,
        default: 0.5,
        description: 'Inner loop proportional gain.',
      },
      inner_ki: {
        type: 'number',
        required: false,
        default: 0.01,
        description: 'Inner loop integral gain.',
      },
      inner_kd: {
        type: 'number',
        required: false,
        default: 0.1,
        description: 'Inner loop derivative gain.',
      },
      outer_kp: {
        type: 'number',
        required: false,
        default: 0.3,
        description: 'Outer loop proportional gain.',
      },
      outer_ki: {
        type: 'number',
        required: false,
        default: 0.005,
        description: 'Outer loop integral gain.',
      },
      outer_kd: {
        type: 'number',
        required: false,
        default: 0.05,
        description: 'Outer loop derivative gain.',
      },
      update_interval: {
        type: 'number',
        required: false,
        default: 1.0,
        description: 'Controller update interval in seconds.',
      },
      faucet_min_multiplier: {
        type: 'number',
        required: false,
        default: 0.1,
        description: 'Minimum faucet rate multiplier (never fully stop rewards).',
      },
      faucet_max_multiplier: {
        type: 'number',
        required: false,
        default: 2.0,
        description: 'Maximum faucet rate multiplier.',
      },
      track_faucet_sink_ratio: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Whether to track and emit faucet/sink ratio metrics (W.031).',
      },
      emit_on_adjustment: {
        type: 'string',
        required: false,
        default: 'on_faucet_adjusted',
        description: 'Event emitted when faucet rate is adjusted.',
      },
    },
    validator: (params) => {
      if (params.target_per_capita === undefined || params.target_per_capita <= 0) return false;
      // PID gains can be any real number, but should be reasonable
      const gains = [
        params.inner_kp, params.inner_ki, params.inner_kd,
        params.outer_kp, params.outer_ki, params.outer_kd,
      ];
      for (const g of gains) {
        if (g !== undefined && (typeof g !== 'number' || isNaN(g))) return false;
      }
      if (params.update_interval !== undefined && params.update_interval <= 0) return false;
      return true;
    },
    requiredPermissions: ['economy.tune_pid', 'economy.mint', 'economy.burn'],
    economicLayer: 1, // Layer 1: Flow Control
    composesWith: ['@bonding_curved', '@taxable_wealth'],
    compiler_hints: {
      requires_runtime: [
        'EconomicRuntime.updatePID',
        'EconomicRuntime.getFaucetMultiplier',
        'EconomicRuntime.getFaucetSinkMetrics',
      ],
      thread_safety: 'worker_thread',
      performance_budget_ms: 0.5,
    },
  },
};

// =============================================================================
// TRAIT UTILITIES
// =============================================================================

/**
 * Get all trait names as an array.
 */
export function getEconomicTraitNames(): string[] {
  return Object.keys(EconomicTraits).map((k) => EconomicTraits[k].name);
}

/**
 * Look up a trait definition by its @-prefixed name.
 */
export function getEconomicTrait(name: string): EconomicTraitDefinition | undefined {
  const key = name.startsWith('@') ? name.slice(1) : name;
  return EconomicTraits[key];
}

/**
 * Validate that a set of composed traits are compatible.
 * Returns an error message if incompatible, or null if valid.
 */
export function validateTraitComposition(traitNames: string[]): string | null {
  for (const name of traitNames) {
    const trait = getEconomicTrait(name);
    if (!trait) {
      return `Unknown economic trait: ${name}`;
    }
  }

  // Check that all traits compose with each other
  for (const name of traitNames) {
    const trait = getEconomicTrait(name)!;
    for (const other of traitNames) {
      if (other === name) continue;
      const otherPrefixed = other.startsWith('@') ? other : `@${other}`;
      if (!trait.composesWith.includes(otherPrefixed)) {
        return `Trait ${trait.name} does not compose with ${otherPrefixed}`;
      }
    }
  }

  return null;
}

/**
 * Get all RBAC permissions required by a set of economic traits.
 */
export function getRequiredPermissions(traitNames: string[]): string[] {
  const permissions = new Set<string>();
  for (const name of traitNames) {
    const trait = getEconomicTrait(name);
    if (trait) {
      for (const perm of trait.requiredPermissions) {
        permissions.add(perm);
      }
    }
  }
  return Array.from(permissions).sort();
}

export default EconomicTraits;
