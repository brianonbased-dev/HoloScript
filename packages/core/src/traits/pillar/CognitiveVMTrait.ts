/**
 * CognitiveVMTrait — uAAL Cognitive VM runtime.
 *
 * This is the runtime layer that USES the Pillar-Slice Framework to configure
 * agent behaviour at each tick.  The substrate (PillarRegistry, ParallelPillar,
 * PillarJEPA, etc.) provides the data model and learning objective; this trait
 * provides the execution engine.
 *
 * Architecture
 * ────────────
 * The VM runs two nested loops — mirroring the brain's hemispheric structure
 * and the RecursiveMAS dual-loop (arxiv:2604.25917):
 *
 *   Inner loop (left hemisphere, high-frequency)
 *     Runs every tick.
 *     Sources: Domain + Layer pillars (physics, rendering, solver, trait, …)
 *     Role: fast per-frame decisions — LOD, solver precision, memory window
 *     Channel: RecursiveLink inner loop
 *
 *   Outer loop (right hemisphere, low-frequency)
 *     Runs every N inner ticks (N = inner_frequency, default 10).
 *     Sources: Intent + Temporal pillars (truth_approval, steady_state, agent, …)
 *     Role: slow policy adjustments — goal priority, sycophancy guard, lifecycle
 *     Channel: RecursiveLink outer loop
 *
 * Behaviour dispatch
 * ──────────────────
 * Each pillar domain maps to a set of behaviour config fields it controls.
 * Slice coordinates (pos_1, pos_2) are translated into concrete config values
 * via domain-specific dispatch handlers.  Custom handlers can be registered
 * via `cogvm:register_dispatch`.
 *
 * BehaviourConfig is emitted on every outer tick so downstream traits (PillarJEPA,
 * SliceEmitter, UI, etc.) can observe the current agent configuration without
 * querying the VM directly.
 *
 * Lifecycle state machine
 * ───────────────────────
 * Driven by TEMPORAL_PILLAR (outer loop, pos_2 = convergence):
 *
 *   convergence < 0.2               → init       (new domain, full verification)
 *   convergence ∈ [0.2, 0.6)        → active     (warming up)
 *   convergence ∈ [0.6, 0.9)        → steady_state (converging)
 *   convergence ≥ 0.9               → stable     (fully converged)
 *   box_area > box_edge_threshold   → edge_case  (hemisphere disagreement)
 *   forced via cogvm:set_lifecycle  → shutdown
 *
 * Events consumed:
 *   cogvm:tick                  — advance the VM one step
 *     { context?: string, metadata?: Record<string, unknown> }
 *   cogvm:register_dispatch     — register custom domain handler
 *     { domain: PillarDomain, handler: DispatchHandler }
 *   cogvm:set_lifecycle         — force lifecycle transition
 *     { state: LifecycleState, reason?: string }
 *   cogvm:freeze / cogvm:unfreeze — pause / resume inner+outer loops
 *
 * Events emitted:
 *   cogvm:inner_tick            { slice, step, loop_ms }
 *   cogvm:outer_tick            { parallel_slice, behaviour, lifecycle, step, loop_ms }
 *   cogvm:lifecycle_transition  { from, to, reason, step }
 *   cogvm:dispatch_applied      { domain, before, after }
 *   cogvm:frozen / cogvm:unfrozen
 *
 * References:
 *   RecursiveMAS dual-loop   — arxiv:2604.25917 §3.2
 *   ParallelPillar           — packages/core/src/traits/pillar/ParallelPillar.ts
 *   PillarRegistry           — packages/core/src/traits/pillar/PillarRegistry.ts
 *   TEMPORAL_PILLAR          — PillarRegistry.ts TEMPORAL_PILLAR
 *   Brain lateralisation     — SemanticCollaborationContract.BrainCoord
 *   Paper 26 §4              — uAAL Cognitive VM runtime contribution
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { PillarSlice, PillarDomain } from './SemanticCollaborationContract';
import type { PillarContext } from './PillarRegistry';
import type { ParallelPillarSlice } from './ParallelPillar';
import {
  pillarRegistryHandler,
  PHYSICS_CONSERVATION_PILLAR,
  INTENT_TRUTH_APPROVAL_PILLAR,
  TEMPORAL_PILLAR,
} from './PillarRegistry';
import {
  parallelPillarHandler,
  TRUTH_PHYSICS_PARALLEL,
  TEMPORAL_LATERAL_PARALLEL,
  ENERGY_ENTROPY_PARALLEL,
  type ParallelPillarConfig,
} from './ParallelPillar';
import type { PillarRegistryConfig } from './PillarRegistry';

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle state machine
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleState =
  | 'init'         // new domain, full conservation verification
  | 'active'       // warming up, most checks enabled
  | 'steady_state' // converging, backing off verification overhead
  | 'stable'       // fully converged, minimal overhead
  | 'edge_case'    // hemisphere disagreement detected (large bounding box)
  | 'shutdown';    // agent is shutting down

/** Derive lifecycle state from temporal convergence + hemisphere agreement. */
function deriveLifecycle(
  convergence: number,
  boxArea: number,
  edgeThreshold: number,
  current: LifecycleState,
): LifecycleState {
  // Shutdown is sticky — only escapable via cogvm:set_lifecycle
  if (current === 'shutdown') return 'shutdown';
  // Edge case: hemispheres disagree significantly
  if (boxArea > edgeThreshold) return 'edge_case';
  if (convergence < 0.2)  return 'init';
  if (convergence < 0.6)  return 'active';
  if (convergence < 0.9)  return 'steady_state';
  return 'stable';
}

// ─────────────────────────────────────────────────────────────────────────────
// Behaviour config — what the VM configures per agent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The concrete agent behaviour settings maintained by the Cognitive VM.
 * Updated every outer tick via the pillar dispatch table.
 *
 * All fields are normalised to [0, 1] for portability.  Downstream consumers
 * (solver, renderer, planner) map to their own native ranges.
 */
export interface CognitiveVMBehaviour {
  /** Physics/solver: how precise the simulation runs (0 = fast/rough, 1 = precise) */
  solver_precision: number;
  /** Minimum conservation score before penalty fires */
  conservation_threshold: number;
  /** Rendering LOD: 0 = lowest, 1 = highest */
  lod_quality: number;
  /** Agent goal priority: 1 = urgent, 0 = opportunistic */
  goal_priority: number;
  /** Working memory window size, normalised */
  memory_window: number;
  /** Token / compute budget fraction to use */
  cost_budget: number;
  /** Exploration rate: 0 = exploit, 1 = explore */
  exploration_rate: number;
  /** Sycophancy guard threshold (truth_approval pos_2 > this → flag) */
  sycophancy_guard: number;
  /** Loop frequency multiplier from temporal convergence */
  loop_frequency_multiplier: number;
}

function defaultBehaviour(): CognitiveVMBehaviour {
  return {
    solver_precision:         0.8,
    conservation_threshold:   0.9,
    lod_quality:              0.7,
    goal_priority:            0.8,
    memory_window:            0.5,
    cost_budget:              0.6,
    exploration_rate:         0.2,
    sycophancy_guard:         0.4,
    loop_frequency_multiplier: 1.0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A dispatch handler maps a PillarSlice to a partial BehaviourConfig mutation.
 * Built-in handlers cover all seed domains.  Custom handlers can override.
 */
export type DispatchHandler = (
  slice: PillarSlice,
  current: CognitiveVMBehaviour,
) => Partial<CognitiveVMBehaviour>;

/** Built-in dispatch handlers for all seed PillarDomains. */
const BUILTIN_DISPATCH: Partial<Record<PillarDomain, DispatchHandler>> = {
  // Inner-loop (left hemisphere) dispatchers
  physics: (slice) => ({
    solver_precision:         clamp(slice.pos_1),
    conservation_threshold:   clamp(slice.pos_1 - 0.05),
  }),
  rendering: (slice) => ({
    lod_quality: clamp(slice.pos_1),
  }),
  solver: (slice, cur) => ({
    solver_precision:         clamp((cur.solver_precision + slice.pos_1) / 2),
    loop_frequency_multiplier: clamp(0.5 + slice.pos_2),
  }),
  trait: (slice) => ({
    memory_window: clamp(slice.pos_1),
  }),
  compiler: (slice) => ({
    cost_budget: clamp(slice.pos_1),
  }),
  language: (slice) => ({
    memory_window: clamp(slice.pos_1),
    cost_budget:   clamp(slice.pos_2),
  }),
  accuracy_speed: (slice) => ({
    solver_precision:  clamp(slice.pos_1),          // accuracy
    cost_budget:       clamp(1 - slice.pos_2),       // inverse of speed-pressure
  }),

  // Outer-loop (right hemisphere) dispatchers
  truth_approval: (slice) => ({
    sycophancy_guard: clamp(slice.pos_2 + 0.1),     // raise guard as approval pressure rises
  }),
  coordination: (slice) => ({
    goal_priority: clamp(slice.pos_1),
  }),
  safety_exploration: (slice) => ({
    exploration_rate:  clamp(slice.pos_2),
    sycophancy_guard:  clamp(1 - slice.pos_1 * 0.5), // lower safety → higher guard
  }),
  economics: (slice) => ({
    cost_budget:   clamp(slice.pos_1),
    goal_priority: clamp(slice.pos_2),
  }),
  agent: (slice) => ({
    goal_priority: clamp(slice.pos_1),
    memory_window: clamp(slice.pos_2),
  }),

  // Bilateral (temporal)
  steady_state: (slice) => ({
    loop_frequency_multiplier: clamp(0.3 + slice.pos_2 * 0.7), // converged → slow outer loop
    conservation_threshold:    clamp(1.0 - slice.pos_2 * 0.3), // ease threshold in steady state
  }),
  storage: (slice) => ({
    memory_window: clamp(slice.pos_1),
  }),
};

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait config
// ─────────────────────────────────────────────────────────────────────────────

export interface CognitiveVMConfig {
  /** Agent surface identifier (for RecursiveLink from field). */
  agent_id: string;
  /**
   * How many inner ticks run per one outer tick.
   * Inner = left hemisphere (fast, Domain pillars).
   * Outer = right hemisphere (slow, Intent/Temporal pillars).
   * Default: 10.
   */
  inner_frequency: number;
  /**
   * Parallel pillar ID to use for the outer loop bilateral slice.
   * Default: 'temporal_lateral_parallel' (left=lifecycle, right=convergence).
   */
  outer_parallel_id: string;
  /**
   * Parallel pillar ID to use for the inner loop bilateral check.
   * Default: 'energy_entropy_parallel' (physics left × right).
   */
  inner_parallel_id: string;
  /**
   * Box area threshold above which the VM enters edge_case lifecycle.
   * Default: 0.35 (hemispheres disagree on >35% of the unit square).
   */
  edge_case_threshold: number;
  /**
   * When true, auto-transition lifecycle based on TEMPORAL_PILLAR convergence.
   * Default: true.
   */
  lifecycle_auto_transition: boolean;
  /**
   * When true, emit cogvm:inner_tick slices as recursive_link:send events
   * so peers receive the inner loop signal.
   * Default: true.
   */
  emit_to_peers: boolean;
  /**
   * When true, emit a pillarjepa:step event on each outer tick so a co-located
   * PillarJEPA trait can learn from the bilateral slice.
   * Default: false (PillarJEPA is opt-in to avoid double-wiring).
   */
  emit_jepa_step: boolean;
  /**
   * LatentDim for the JEPA step event (only used when emit_jepa_step = true).
   * Default: 32.
   */
  jepa_latent_dim: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

interface CognitiveVMState {
  inner_tick: number;
  outer_tick: number;
  inner_counter: number;              // counts inner ticks since last outer tick
  lifecycle: LifecycleState;
  behaviour: CognitiveVMBehaviour;
  frozen: boolean;
  dispatch_table: Map<PillarDomain, DispatchHandler>;
  // Sub-nodes for delegated handlers
  registryNode: HSPlusNode;
  parallelNode: HSPlusNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function silentCtx(): TraitContext {
  return {
    emit: () => {},
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;
}

function extractField<T>(event: TraitEvent, key: string): T | undefined {
  const direct = (event as Record<string, unknown>)[key];
  if (direct !== undefined) return direct as T;
  return (event.payload as Record<string, unknown> | undefined)?.[key] as T | undefined;
}

function registryCfg(): PillarRegistryConfig {
  return { max_pillars: 512, enable_diversity_tracking: false };
}

function parallelCfg(): ParallelPillarConfig {
  return { max_parallel_pillars: 256, emit_box_area: true };
}

/** Capture a PillarSlice synchronously from the registry. */
function captureSlice(
  registryNode: HSPlusNode,
  pillar_id: string,
  pillarCtx: PillarContext,
): PillarSlice | null {
  let captured: PillarSlice | null = null;
  const cap = {
    ...silentCtx(),
    emit(name: string, payload: unknown) {
      if (name === 'pillar:slice') captured = (payload as { slice: PillarSlice }).slice;
    },
  } as unknown as TraitContext;
  pillarRegistryHandler.onEvent?.(registryNode, registryCfg(), cap, {
    type: 'pillar:generate',
    pillar_id,
    context: pillarCtx,
  });
  return captured;
}

/** Capture a ParallelPillarSlice synchronously. */
function captureParallelSlice(
  parallelNode: HSPlusNode,
  parallel_id: string,
  pillarCtx: PillarContext,
): ParallelPillarSlice | null {
  let captured: ParallelPillarSlice | null = null;
  const cap = {
    ...silentCtx(),
    emit(name: string, payload: unknown) {
      if (name === 'pillar:parallel_slice') {
        captured = (payload as { slice: ParallelPillarSlice }).slice;
      }
    },
  } as unknown as TraitContext;
  parallelPillarHandler.onEvent?.(parallelNode, parallelCfg(), cap, {
    type: 'pillar:generate_parallel',
    parallel_id,
    context: pillarCtx,
  });
  return captured;
}

/** Apply dispatch handler for a slice domain, return the before/after diff. */
function applyDispatch(
  slice: PillarSlice,
  state: CognitiveVMState,
): { before: CognitiveVMBehaviour; after: CognitiveVMBehaviour; domain: PillarDomain } {
  const domain = slice.pillar_domain;
  const handler = state.dispatch_table.get(domain) ?? BUILTIN_DISPATCH[domain];
  const before = { ...state.behaviour };
  if (handler) {
    const delta = handler(slice, state.behaviour);
    Object.assign(state.behaviour, delta);
  }
  return { before, after: { ...state.behaviour }, domain };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

export const cognitiveVMHandler: TraitHandler<CognitiveVMConfig> = {
  name: 'cognitive_vm',

  defaultConfig: {
    agent_id: 'agent_default',
    inner_frequency: 10,
    outer_parallel_id: 'temporal_lateral_parallel',
    inner_parallel_id: 'energy_entropy_parallel',
    edge_case_threshold: 0.35,
    lifecycle_auto_transition: true,
    emit_to_peers: true,
    emit_jepa_step: false,
    jepa_latent_dim: 32,
  },

  onAttach(node: HSPlusNode, _config: CognitiveVMConfig, _context: TraitContext): void {
    const registryNode = {} as HSPlusNode;
    const parallelNode = {} as HSPlusNode;

    pillarRegistryHandler.onAttach?.(registryNode, registryCfg(), silentCtx());
    parallelPillarHandler.onAttach?.(parallelNode, parallelCfg(), silentCtx());

    // Ensure seed pillars are registered (they are seeds, but be explicit)
    for (const p of [PHYSICS_CONSERVATION_PILLAR, INTENT_TRUTH_APPROVAL_PILLAR, TEMPORAL_PILLAR]) {
      pillarRegistryHandler.onEvent?.(registryNode, registryCfg(), silentCtx(), {
        type: 'pillar:register', pillar: p,
      });
    }
    for (const pp of [ENERGY_ENTROPY_PARALLEL, TRUTH_PHYSICS_PARALLEL, TEMPORAL_LATERAL_PARALLEL]) {
      parallelPillarHandler.onEvent?.(parallelNode, parallelCfg(), silentCtx(), {
        type: 'pillar:register_parallel', parallel: pp,
      });
    }

    const state: CognitiveVMState = {
      inner_tick:    0,
      outer_tick:    0,
      inner_counter: 0,
      lifecycle:     'init',
      behaviour:     defaultBehaviour(),
      frozen:        false,
      dispatch_table: new Map(),
      registryNode,
      parallelNode,
    };
    node.__cognitiveVMState = state;
  },

  onDetach(node: HSPlusNode, _config: CognitiveVMConfig, _context: TraitContext): void {
    const state = node.__cognitiveVMState as CognitiveVMState | undefined;
    if (state) {
      pillarRegistryHandler.onDetach?.(state.registryNode, registryCfg(), silentCtx());
      parallelPillarHandler.onDetach?.(state.parallelNode, parallelCfg(), silentCtx());
    }
    delete node.__cognitiveVMState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: CognitiveVMConfig,
    context: TraitContext,
    event: TraitEvent,
  ): void {
    const state = node.__cognitiveVMState as CognitiveVMState | undefined;
    if (!state) return;

    // ── cogvm:freeze / cogvm:unfreeze ─────────────────────────────────────────
    if (event.type === 'cogvm:freeze') {
      state.frozen = true;
      context.emit?.('cogvm:frozen', { step: state.inner_tick });
      return;
    }
    if (event.type === 'cogvm:unfreeze') {
      state.frozen = false;
      context.emit?.('cogvm:unfrozen', { step: state.inner_tick });
      return;
    }

    // ── cogvm:set_lifecycle ───────────────────────────────────────────────────
    if (event.type === 'cogvm:set_lifecycle') {
      const next  = extractField<LifecycleState>(event, 'state');
      const reason = extractField<string>(event, 'reason') ?? 'manual override';
      if (!next) return;
      const prev = state.lifecycle;
      state.lifecycle = next;
      if (prev !== next) {
        context.emit?.('cogvm:lifecycle_transition', {
          from: prev, to: next, reason, step: state.inner_tick,
        });
      }
      return;
    }

    // ── cogvm:register_dispatch ───────────────────────────────────────────────
    if (event.type === 'cogvm:register_dispatch') {
      const domain  = extractField<PillarDomain>(event, 'domain');
      const handler = extractField<DispatchHandler>(event, 'handler');
      if (domain && handler) state.dispatch_table.set(domain, handler);
      return;
    }

    // ── cogvm:tick ────────────────────────────────────────────────────────────
    if (event.type !== 'cogvm:tick') return;
    if (state.frozen) return;

    const userMeta = extractField<Record<string, unknown>>(event, 'metadata') ?? {};
    const userCtx  = extractField<string>(event, 'context') ?? `cogvm tick ${state.inner_tick}`;
    const t0 = Date.now();

    const pillarCtx: PillarContext = {
      layer:       'inner_loop',
      agent_id:    config.agent_id,
      timestamp_ms: t0,
      metadata:    userMeta,
    };

    // ── INNER LOOP ────────────────────────────────────────────────────────────
    // Run every tick.  Sources: Domain/Layer pillars (left hemisphere).
    state.inner_tick++;
    state.inner_counter++;

    // Generate inner bilateral slice (left = analytical domain pillar)
    const innerParallel = captureParallelSlice(
      state.parallelNode,
      config.inner_parallel_id,
      { ...pillarCtx, layer: 'inner_loop' },
    );

    // Use left hemisphere slice for inner dispatch
    const innerSlice: PillarSlice = innerParallel?.left ?? {
      axis_1_id: 'energy', axis_2_id: 'momentum',
      pos_1: 1.0, pos_2: 0.0,
      pillar_id: 'physics_conservation', pillar_domain: 'physics',
    };

    const innerDispatch = applyDispatch(innerSlice, state);
    const innerMs = Date.now() - t0;

    context.emit?.('cogvm:inner_tick', {
      slice:      innerSlice,
      step:       state.inner_tick,
      loop_ms:    innerMs,
      behaviour:  { ...state.behaviour },
      lifecycle:  state.lifecycle,
    });

    if (innerDispatch.before !== innerDispatch.after) {
      context.emit?.('cogvm:dispatch_applied', {
        domain: innerDispatch.domain,
        before: innerDispatch.before,
        after:  innerDispatch.after,
        loop:   'inner',
      });
    }

    // Emit inner slice to peers via RecursiveLink channel
    if (config.emit_to_peers) {
      context.emit?.('recursive_link:send', {
        from:  config.agent_id,
        to:    '*',
        loop:  'inner',
        slice: innerSlice,
        timestamp_ms: t0,
      });
    }

    // ── OUTER LOOP ────────────────────────────────────────────────────────────
    // Runs every inner_frequency inner ticks.
    // Sources: Intent/Temporal pillars (right hemisphere).
    if (state.inner_counter < config.inner_frequency) return;
    state.inner_counter = 0;
    state.outer_tick++;

    const outerCtx: PillarContext = {
      layer:       'outer_loop',
      agent_id:    config.agent_id,
      timestamp_ms: Date.now(),
      metadata:    userMeta,
    };

    // Generate outer bilateral slice (temporal left × temporal right)
    const outerParallel = captureParallelSlice(
      state.parallelNode,
      config.outer_parallel_id,
      outerCtx,
    );

    // Fallback outer slice (fully converged steady state)
    const outerSlice: PillarSlice = outerParallel?.right ?? {
      axis_1_id: 'convergence', axis_2_id: 'steady_state',
      pos_1: 1.0, pos_2: 1.0,
      pillar_id: TEMPORAL_PILLAR.id, pillar_domain: 'steady_state',
    };

    // Dispatch right hemisphere (outer) slice
    const outerDispatch = applyDispatch(outerSlice, state);

    // Lifecycle transition from temporal convergence + hemisphere agreement
    if (config.lifecycle_auto_transition) {
      const convergence = outerParallel?.right.pos_2 ?? 1.0;
      const boxArea     = outerParallel?.box_area    ?? 0.0;
      const prevLifecycle = state.lifecycle;
      const nextLifecycle = deriveLifecycle(
        convergence, boxArea, config.edge_case_threshold, prevLifecycle
      );
      if (nextLifecycle !== prevLifecycle) {
        state.lifecycle = nextLifecycle;
        context.emit?.('cogvm:lifecycle_transition', {
          from:        prevLifecycle,
          to:          nextLifecycle,
          reason:      `convergence=${convergence.toFixed(3)} box_area=${boxArea.toFixed(3)}`,
          step:        state.outer_tick,
        });
      }
    }

    const outerMs = Date.now() - t0;

    context.emit?.('cogvm:outer_tick', {
      parallel_slice: outerParallel,
      slice:          outerSlice,
      behaviour:      { ...state.behaviour },
      lifecycle:      state.lifecycle,
      step:           state.outer_tick,
      loop_ms:        outerMs,
    });

    if (outerDispatch.before !== outerDispatch.after) {
      context.emit?.('cogvm:dispatch_applied', {
        domain: outerDispatch.domain,
        before: outerDispatch.before,
        after:  outerDispatch.after,
        loop:   'outer',
      });
    }

    // Emit outer slice to peers
    if (config.emit_to_peers) {
      context.emit?.('recursive_link:send', {
        from:  config.agent_id,
        to:    '*',
        loop:  'outer',
        slice: outerSlice,
        timestamp_ms: Date.now(),
      });
    }

    // Optional: emit pillarjepa:step so a co-located PillarJEPA can learn
    if (config.emit_jepa_step && outerParallel) {
      context.emit?.('pillarjepa:step', {
        context:        userCtx,
        targetVec:      new Float32Array(config.jepa_latent_dim).fill(0),
        parallel_slice: outerParallel,
        temporal_slice: outerSlice,
      });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot helpers (for tests and observability)
// ─────────────────────────────────────────────────────────────────────────────

export interface CognitiveVMSnapshot {
  inner_tick:  number;
  outer_tick:  number;
  lifecycle:   LifecycleState;
  behaviour:   CognitiveVMBehaviour;
  frozen:      boolean;
}

export function getCognitiveVMSnapshot(node: HSPlusNode): CognitiveVMSnapshot | null {
  const state = (node as unknown as Record<string, unknown>).__cognitiveVMState as CognitiveVMState | undefined;
  if (!state) return null;
  return {
    inner_tick: state.inner_tick,
    outer_tick: state.outer_tick,
    lifecycle:  state.lifecycle,
    behaviour:  { ...state.behaviour },
    frozen:     state.frozen,
  };
}
