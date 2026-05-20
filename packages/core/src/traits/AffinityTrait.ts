/**
 * AffinityTrait — @affinity trait handler for the AffinityODESolver.
 *
 * Backs the `@affinity` trait in HoloScript+. Wires a scene-graph node
 * to the AffinityODESolver (Strogatz-Rinaldi relational dynamics, optional
 * Sternberg triangular state, optional Nash-equilibrium effort control).
 *
 * Factory key: `'affinity-ode'` (registered in simulation-registry.ts).
 *
 * Used by:
 *   - D.027 Brittney authority locus — relational-state substrate
 *   - D.052 ConversationDaemon — affective-state tracking per dyad
 *
 * Pattern follows SimulationTraitHandlers.ts (thermal/structural/hydraulic):
 *   onAttach  → create solver via SimulationSolverFactory
 *   onUpdate  → step solver by delta
 *   onDetach  → dispose solver
 *
 * @see AffinityODESolver (packages/engine/src/simulation/AffinityODESolver.ts)
 * @see simulation-registry.ts for factory registration
 * @see DOMAIN_COVERAGE.md Layer 1 for evidence readiness
 */

import type { TraitHandler } from './TraitTypes';
import { SimulationSolverFactory, type SimulationSolver } from './SimulationSolverFactory';

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Minimal trait-layer config — mirrors AffinityConfig in AffinityODESolver.ts
 * (core must not import engine, so we re-declare only what the trait needs).
 */
export interface AffinityTraitConfig {
  /** Unique IDs for the two agents in the dyad. Default: ['agent_R', 'agent_J'] */
  agentIds?: [string, string];
  /** Personality archetypes for each agent. Default: ['eager_beaver', 'cautious_lover'] */
  archetypes?: [string, string];
  /** Initial feeling states [R_0, J_0]. Default: [0.5, 0.5] */
  initialFeelings?: [number, number];
  /** Enable Sternberg triangular state [I, P, C]. Default: false */
  enableSternberg?: boolean;
  /** Enable Nash-equilibrium effort control. Default: false */
  enableNashEffort?: boolean;
  /** Integration time step in seconds. Default: 0.1 */
  timeStep?: number;
  /** Maximum integration time for steady-state detection. Default: undefined (unbounded) */
  maxTime?: number;
  /** Passthrough: any additional AffinityConfig fields forwarded to the solver. */
  [key: string]: unknown;
}

// ── State ─────────────────────────────────────────────────────────────────────

interface AffinityNodeState {
  solver: SimulationSolver | null;
  isRunning: boolean;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const affinityHandler: TraitHandler<AffinityTraitConfig> = {
  name: 'affinity',

  defaultConfig: {
    agentIds: ['agent_R', 'agent_J'],
    archetypes: ['eager_beaver', 'cautious_lover'],
    initialFeelings: [0.5, 0.5],
    enableSternberg: false,
    enableNashEffort: false,
    timeStep: 0.1,
  },

  onAttach(node, config, context) {
    const cfg = config ?? {};

    // Build the AffinityConfig the solver expects, synthesising from trait
    // shorthand (agentIds/archetypes) into the solver's agents array format.
    const agentIds = (cfg.agentIds as [string, string]) ?? ['agent_R', 'agent_J'];
    const archetypes = (cfg.archetypes as [string, string]) ?? ['eager_beaver', 'cautious_lover'];

    const solverConfig: Record<string, unknown> = {
      agents: [
        { id: agentIds[0], archetype: archetypes[0], dampingRate: 0.3, couplingToPartner: 0.5 },
        { id: agentIds[1], archetype: archetypes[1], dampingRate: 0.3, couplingToPartner: 0.5 },
      ],
      initialFeelings: cfg.initialFeelings ?? [0.5, 0.5],
      enableSternberg: cfg.enableSternberg ?? false,
      nashEffort: cfg.enableNashEffort
        ? {
            enabled: true,
            wellBeingWeight: 0.5,
            relationalWeight: 0.5,
            maxEffort: 1.0,
            adaptationRate: 0.1,
          }
        : { enabled: false, wellBeingWeight: 0.5, relationalWeight: 0.5, maxEffort: 1, adaptationRate: 0.1 },
      timeStep: cfg.timeStep ?? 0.1,
      maxTime: cfg.maxTime,
      // Forward any extra fields the caller added
      ...cfg,
    };

    const solver = SimulationSolverFactory.create('affinity-ode', solverConfig);

    const state: AffinityNodeState = {
      solver,
      isRunning: solver !== null,
    };

    (node as unknown as Record<string, unknown>).__affinityState = state;
    context.emit?.('affinity_create', { node, config: solverConfig, solver });
  },

  onUpdate(node, _config, _context, delta) {
    const state = (node as unknown as Record<string, unknown>).__affinityState as
      | AffinityNodeState
      | undefined;
    if (!state?.isRunning || !state.solver?.step) return;
    // delta is in ms; solver expects seconds
    state.solver.step(delta / 1000);
  },

  onDetach(node, _config, context) {
    const state = (node as unknown as Record<string, unknown>).__affinityState as
      | AffinityNodeState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as unknown as Record<string, unknown>).__affinityState;
    context.emit?.('affinity_destroy', { node });
  },
};
