/**
 * @fileoverview SimulationLab Trait Definition for HoloScript
 * @module @holoscript/std/traits
 *
 * Defines the @simulation_lab trait that enables hypothesis testing
 * on any HoloScript composition. Attach this trait to run parameter sweeps,
 * collect metrics across N epochs, and produce statistical results.
 *
 * Composes with all economic traits for economy stress testing.
 *
 * @version 1.0.0
 * @category simulation
 */

import type { TraitDefinition } from '../types.js';

/**
 * Extended trait definition with simulation-specific metadata.
 */
export interface SimulationTraitDefinition extends TraitDefinition {
  /** Compiler hints for batch execution */
  compiler_hints?: {
    requires_runtime?: string[];
    thread_safety?: 'main_thread' | 'worker_thread' | 'any';
    performance_budget_ms?: number;
    batch_mode?: boolean;
  };
  /** Which economic/VR traits this composes with */
  composesWith: string[];
}

// =============================================================================
// TRAIT DEFINITION
// =============================================================================

/**
 * The SimulationLab trait.
 */
export const SimulationLabTraits: Record<string, SimulationTraitDefinition> = {
  simulation_lab: {
    name: '@simulation_lab',
    description:
      'Attaches scientific hypothesis testing to any HoloScript composition. ' +
      'Enables parameter sweeps, multi-epoch execution, statistical analysis, ' +
      'and exportable results. The universe gets one sample — HoloScript gives ' +
      'you infinite. Results are marketplace-sellable as verified simulation data.',
    params: {
      hypothesis: {
        type: 'string',
        required: true,
        description: 'Human-readable hypothesis description.',
      },
      null_hypothesis: {
        type: 'string',
        required: false,
        default: '',
        description: 'Formal null hypothesis (H0). Auto-generated if empty.',
      },
      alternative_hypothesis: {
        type: 'string',
        required: false,
        default: '',
        description: 'Formal alternative hypothesis (H1). Auto-generated if empty.',
      },
      direction: {
        type: 'string',
        required: false,
        default: 'different',
        description: 'Expected direction of effect: greater | less | different | equal.',
      },
      epochs: {
        type: 'number',
        required: false,
        default: 1000,
        description: 'Number of simulation runs per parameter combination. More = higher power.',
      },
      seed_start: {
        type: 'number',
        required: false,
        default: 0,
        description: 'Starting seed for reproducibility. Seeds increment per epoch.',
      },
      confidence_level: {
        type: 'number',
        required: false,
        default: 0.95,
        description: 'Confidence level for statistical tests (0.0 - 1.0). Default 0.95 = α=0.05.',
      },
      metrics: {
        type: 'string[]',
        required: true,
        description:
          'List of metric names to collect each epoch. Must match emitted metric events.',
      },
      statistical_test: {
        type: 'string',
        required: false,
        default: 'auto',
        description:
          'Statistical test to use: t_test | mann_whitney_u | chi_squared | auto. ' +
          'Auto selects based on data distribution.',
      },
      export_training_data: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Whether to export results as training data for DataForge pipeline.',
      },
      marketplace_publishable: {
        type: 'boolean',
        required: false,
        default: false,
        description:
          'Whether to package results for marketplace listing as verified simulation data.',
      },
      max_duration_ms: {
        type: 'number',
        required: false,
        default: 300000,
        description:
          'Maximum wall-clock time for the entire experiment (5 min default). ' +
          'Prevents runaway simulations.',
      },
      worker_count: {
        type: 'number',
        required: false,
        default: 4,
        description: 'Number of parallel workers for epoch execution.',
      },
    },
    validator: (params) => {
      if (!params.hypothesis || typeof params.hypothesis !== 'string') return false;
      if (!params.metrics || !Array.isArray(params.metrics) || params.metrics.length === 0)
        return false;
      if (params.epochs !== undefined && (params.epochs < 1 || params.epochs > 1000000))
        return false;
      if (
        params.confidence_level !== undefined &&
        (params.confidence_level <= 0 || params.confidence_level >= 1)
      )
        return false;
      if (params.direction !== undefined) {
        if (!['greater', 'less', 'different', 'equal'].includes(params.direction)) return false;
      }
      if (params.statistical_test !== undefined) {
        if (!['t_test', 'mann_whitney_u', 'chi_squared', 'auto'].includes(params.statistical_test))
          return false;
      }
      return true;
    },
    composesWith: [
      '@tradeable',
      '@depreciating',
      '@bonding_curved',
      '@taxable_wealth',
      '@pid_controlled',
    ],
    compiler_hints: {
      requires_runtime: [
        'SimulationRuntime.runExperiment',
        'SimulationRuntime.collectMetrics',
        'SimulationRuntime.runStatisticalTest',
        'SimulationRuntime.exportResults',
      ],
      thread_safety: 'worker_thread',
      performance_budget_ms: 300000, // Experiment budget, not per-frame
      batch_mode: true,
    },
  },
};

// =============================================================================
// TRAIT UTILITIES
// =============================================================================

/**
 * Get all simulation trait names.
 */
export function getSimulationTraitNames(): string[] {
  return Object.keys(SimulationLabTraits).map((k) => SimulationLabTraits[k].name);
}

/**
 * Look up a simulation trait definition by name.
 */
export function getSimulationTrait(name: string): SimulationTraitDefinition | undefined {
  const key = name.startsWith('@') ? name.slice(1) : name;
  return SimulationLabTraits[key];
}

export default SimulationLabTraits;
