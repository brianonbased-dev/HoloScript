/**
 * uAALComposedAgent — v1.0
 *
 * Single deployable TraitHandler that wires the full uAAL Cognitive VM stack:
 *
 *   CognitiveVMTrait     — dual-loop runtime (inner/outer) + lifecycle SM
 *   PillarJEPA           — bilateral JEPA world-model with physics priors
 *   SliceEmitter         — GRPO training slice emission + diversity tracking
 *   LatentIntegrityLayer — Byzantine + sycophancy detection in latent space
 *
 * Internal event wiring (all synchronous, no external I/O):
 *
 *   cogvm:tick
 *     → CognitiveVM inner loop → cogvm:inner_tick + recursive_link:send(loop=inner)
 *     → (every N inner ticks) CognitiveVM outer loop
 *         → cogvm:outer_tick + recursive_link:send(loop=outer)
 *         → [intercepted] pillarjepa:step
 *             → PillarJEPA → pillarjepa:loss
 *             → PillarJEPA → sliceemitter:emit [intercepted]
 *                 → SliceEmitter → emitter:training_slice + emitter:diversity_stats
 *
 *   recursive_link:receive
 *     → LatentIntegrityLayer.checkMessage()
 *     → (if alert) uaal:integrity_alert
 *
 *   emitter:flush → SliceEmitter → emitter:buffer_flushed
 *
 * Consumer-visible events emitted:
 *   cogvm:inner_tick         { slice, step, loop_ms, behaviour, lifecycle }
 *   cogvm:outer_tick         { parallel_slice, slice, behaviour, lifecycle, step, loop_ms }
 *   cogvm:lifecycle_transition { from, to, reason, step }
 *   cogvm:dispatch_applied   { domain, before, after, loop }
 *   cogvm:frozen / cogvm:unfrozen
 *   recursive_link:send      { from, to, loop, slice, timestamp_ms }
 *   pillarjepa:loss          { jepaTotalLoss, conservationLoss, symmetryLoss, totalLoss,
 *                              bilateralLoss?, hemisphereAgreement?, step, pillar_domain,
 *                              temporalConvergence, effectiveConservationWeight }
 *   emitter:training_slice   { slice: TrainingSlice }
 *   emitter:diversity_stats  { unique_count, total_count, diversity_ratio }
 *   uaal:integrity_alert     { byzantine, sycophancy, from, domain }
 *
 * Events consumed (forwarded to sub-handlers):
 *   cogvm:tick, cogvm:freeze, cogvm:unfreeze, cogvm:set_lifecycle,
 *   cogvm:register_dispatch, emitter:flush, recursive_link:receive
 *
 * References:
 *   RecursiveMAS dual-loop   — arxiv:2604.25917 §3.2
 *   uaA2 provenance          — first shipped 2026-02-02 (W.621), 86 days prior
 *   Brain lateralisation     — SemanticCollaborationContract.BrainCoord
 *   Paper 26 §4              — uAAL Cognitive VM runtime (ICLR 2027 target)
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { PillarSlice, BrainCoord, PillarDomain } from './SemanticCollaborationContract';
import type { ParallelPillarSlice } from './ParallelPillar';
import type { CognitiveVMConfig, CognitiveVMSnapshot } from './CognitiveVMTrait';
import type { PillarJEPAConfig, PillarJEPALoss } from './PillarJEPA';
import type { SliceEmitterConfig } from './SliceEmitter';
import type { LatentIntegrityLayerConfig } from './LatentIntegrityLayer';
import type { RecursiveLinkMessage } from './RecursiveLinkTrait';

import { cognitiveVMHandler, getCognitiveVMSnapshot } from './CognitiveVMTrait';
import { pillarJepaHandler } from './PillarJEPA';
import { sliceEmitterHandler } from './SliceEmitter';
import { createLatentIntegrityLayer } from './LatentIntegrityLayer';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flat configuration for the composed agent.
 *
 * Most fields have sensible defaults; only `agent_id` is required.
 * Sub-handler configs can be partially overridden via the `overrides` object;
 * the composed agent merges them with the defaults derived from the flat fields.
 */
export interface UAALAgentConfig {
  // ── Identity ────────────────────────────────────────────────────────────────
  /** Surface identifier for this agent (used in RecursiveLink from/agent_id). */
  agent_id: string;

  // ── Cognitive VM ────────────────────────────────────────────────────────────
  /** Inner-loop ticks per outer-loop tick. Default: 10. */
  inner_frequency?: number;
  /** Emit inner/outer slices to peer agents via RecursiveLink. Default: true. */
  emit_to_peers?: boolean;
  /** Edge-case lifecycle threshold for hemisphere bounding-box area. Default: 0.35. */
  edge_case_threshold?: number;
  /** Outer parallel pillar ID. Default: 'temporal_lateral_parallel'. */
  outer_parallel_id?: string;
  /** Inner parallel pillar ID. Default: 'energy_entropy_parallel'. */
  inner_parallel_id?: string;

  // ── PillarJEPA ──────────────────────────────────────────────────────────────
  /** JEPA latent dimension. Default: 32. */
  jepa_latent_dim?: number;
  /** Bilateral hemisphere loss weight. Default: 0.1. */
  jepa_bilateral_weight?: number;
  /** Physics conservation regulariser weight. Default: 0.1. */
  jepa_conservation_weight?: number;
  /** Enable JEPA temporal gating (λ_c_eff = λ_c × (1−convergence)). Default: true. */
  jepa_temporal_gating?: boolean;

  // ── SliceEmitter ────────────────────────────────────────────────────────────
  /** Maximum rolling training-slice buffer. Default: 1000. */
  emitter_max_buffer?: number;
  /** Diversity alert threshold (unique/total). Default: 0.8. */
  emitter_diversity_target?: number;

  // ── LatentIntegrityLayer ────────────────────────────────────────────────────
  /** Byzantine anomaly sigma threshold. Default: 2.0. */
  byzantine_sigma?: number;
  /** Byzantine minimum history before flagging. Default: 10. */
  byzantine_min_history?: number;
  /** Sycophancy centroid drift threshold. Default: 0.4. */
  sycophancy_threshold?: number;
  /** Sycophancy minimum samples before probing. Default: 5. */
  sycophancy_min_samples?: number;
  /** Rolling window of recent slices kept for Byzantine detection. Default: 100. */
  integrity_history_size?: number;

  // ── Advanced: full sub-config overrides ─────────────────────────────────────
  overrides?: {
    cogvm?:    Partial<CognitiveVMConfig>;
    jepa?:     Partial<PillarJEPAConfig>;
    emitter?:  Partial<SliceEmitterConfig>;
    integrity?: LatentIntegrityLayerConfig;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

interface UAALAgentState {
  // Sub-handler nodes
  cogvmNode:   HSPlusNode;
  jepaNode:    HSPlusNode;
  emitterNode: HSPlusNode;
  // Integrity layer (class-based, not a TraitHandler)
  integrityLayer: ReturnType<typeof createLatentIntegrityLayer>;
  // Rolling slice history for Byzantine detection
  recentSlices: PillarSlice[];
  historySize:  number;
  // Monotonic emitter step counter
  sim_step: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-config builders
// ─────────────────────────────────────────────────────────────────────────────

function buildCogvmConfig(cfg: UAALAgentConfig): CognitiveVMConfig {
  return {
    agent_id:                 cfg.agent_id,
    inner_frequency:          cfg.inner_frequency          ?? 10,
    outer_parallel_id:        cfg.outer_parallel_id        ?? 'temporal_lateral_parallel',
    inner_parallel_id:        cfg.inner_parallel_id        ?? 'energy_entropy_parallel',
    edge_case_threshold:      cfg.edge_case_threshold      ?? 0.35,
    lifecycle_auto_transition: true,
    emit_to_peers:            cfg.emit_to_peers            ?? true,
    emit_jepa_step:           true,   // composed agent intercepts this
    jepa_latent_dim:          cfg.jepa_latent_dim          ?? 32,
    ...cfg.overrides?.cogvm,
  };
}

function buildJepaConfig(cfg: UAALAgentConfig): PillarJEPAConfig {
  return {
    latentDim:           cfg.jepa_latent_dim          ?? 32,
    condDim:             4,
    sigregWeight:        0.05,
    conservationWeight:  cfg.jepa_conservation_weight  ?? 0.1,
    conservationMargin:  0.05,
    symmetryWeight:      0.02,
    symmetryDelta:       0.1,
    embeddingModel:      'jepa-context-encoder',
    emitToGrpo:          true,   // composed agent intercepts sliceemitter:emit
    physicsPillarId:     'physics_conservation',
    temporalGating:      cfg.jepa_temporal_gating      ?? true,
    bilateralWeight:     cfg.jepa_bilateral_weight     ?? 0.1,
    ...cfg.overrides?.jepa,
  };
}

function buildEmitterConfig(cfg: UAALAgentConfig): SliceEmitterConfig {
  return {
    emit_to_grpo:          true,
    emit_to_knowledge_store: false,
    max_buffer_size:       cfg.emitter_max_buffer        ?? 1000,
    diversity_target:      cfg.emitter_diversity_target  ?? 0.8,
    ...cfg.overrides?.emitter,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Brain coordinate derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a PillarDomain to an MNI152 brain coordinate.
 *
 * Left hemisphere (MNI x > +10):  analytical, sequential (physics, compiler, language)
 * Right hemisphere (MNI x < −10): spatial, holistic (rendering, agent, temporal)
 * Bilateral (|x| ≤ 10):           crossmodal (coordination, economics, safety)
 */
function domainToBrainCoord(domain: PillarDomain | string): BrainCoord {
  // Left-hemisphere domains (analytical, sequential)
  const leftDomains: Set<string> = new Set([
    'physics', 'compiler', 'language', 'accuracy_speed', 'solver',
  ]);
  // Right-hemisphere domains (spatial, holistic)
  const rightDomains: Set<string> = new Set([
    'rendering', 'agent', 'trait', 'safety_exploration', 'storage', 'init',
  ]);

  if (leftDomains.has(domain)) {
    // Left dorsolateral prefrontal cortex — sequential/analytical processing
    return { mni_x: 45, mni_y: 15, mni_z: 30, cortical_depth: 4, brodmann_area: 9 };
  }
  if (rightDomains.has(domain)) {
    // Right parietal / spatial processing
    return { mni_x: -45, mni_y: -30, mni_z: 40, cortical_depth: 3, brodmann_area: 40 };
  }
  // Bilateral: medial prefrontal / anterior cingulate
  return { mni_x: 0, mni_y: 25, mni_z: 30, cortical_depth: 2, brodmann_area: 32 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Silent context helper
// ─────────────────────────────────────────────────────────────────────────────

function silentCtx(): TraitContext {
  return {
    emit:                () => {},
    getState:            () => ({}),
    setState:            () => {},
    getScaleMultiplier:  () => 1,
    setScaleContext:     () => {},
    vr:      null,
    physics: null,
    audio:   null,
    haptics: null,
  } as unknown as TraitContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────────────────────

export interface UAALAgentSnapshot {
  cogvm:    CognitiveVMSnapshot | null;
  sim_step: number;
  recent_slice_count: number;
}

export function getUAALAgentSnapshot(node: HSPlusNode): UAALAgentSnapshot | null {
  const state = (node as unknown as Record<string, unknown>).__uaalAgentState as UAALAgentState | undefined;
  if (!state) return null;
  return {
    cogvm:              getCognitiveVMSnapshot(state.cogvmNode),
    sim_step:           state.sim_step,
    recent_slice_count: state.recentSlices.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

export const uAALComposedAgentHandler: TraitHandler<UAALAgentConfig> = {
  name: 'uaal_composed_agent',

  defaultConfig: {
    agent_id: 'uaal_agent',
  },

  onAttach(node: HSPlusNode, config: UAALAgentConfig, _context: TraitContext): void {
    const cogvmNode:   HSPlusNode = {} as HSPlusNode;
    const jepaNode:    HSPlusNode = {} as HSPlusNode;
    const emitterNode: HSPlusNode = {} as HSPlusNode;

    // Attach all sub-handlers
    cognitiveVMHandler.onAttach?.(cogvmNode,   buildCogvmConfig(config),   silentCtx());
    pillarJepaHandler.onAttach?.(jepaNode,     buildJepaConfig(config),    silentCtx());
    sliceEmitterHandler.onAttach?.(emitterNode, buildEmitterConfig(config), silentCtx());

    const integrityConfig = config.overrides?.integrity ?? {};
    const integrityLayer = createLatentIntegrityLayer({
      byzantine: {
        sigmaThreshold: config.byzantine_sigma       ?? 2.0,
        minHistory:     config.byzantine_min_history ?? 10,
        ...integrityConfig.byzantine,
      },
      sycophancy: {
        driftThreshold: config.sycophancy_threshold  ?? 0.4,
        minSamples:     config.sycophancy_min_samples ?? 5,
        ...integrityConfig.sycophancy,
      },
    });

    node.__uaalAgentState = {
      cogvmNode,
      jepaNode,
      emitterNode,
      integrityLayer,
      recentSlices:  [],
      historySize:   config.integrity_history_size ?? 100,
      sim_step:      0,
    } satisfies UAALAgentState;
  },

  onDetach(node: HSPlusNode, config: UAALAgentConfig, _context: TraitContext): void {
    const state = node.__uaalAgentState as UAALAgentState | undefined;
    if (state) {
      cognitiveVMHandler.onDetach?.(state.cogvmNode,   buildCogvmConfig(config),   silentCtx());
      pillarJepaHandler.onDetach?.(state.jepaNode,     buildJepaConfig(config),    silentCtx());
      sliceEmitterHandler.onDetach?.(state.emitterNode, buildEmitterConfig(config), silentCtx());
    }
    delete node.__uaalAgentState;
  },

  onUpdate(): void {},

  onEvent(
    node:    HSPlusNode,
    config:  UAALAgentConfig,
    context: TraitContext,
    event:   TraitEvent,
  ): void {
    const state = node.__uaalAgentState as UAALAgentState | undefined;
    if (!state) return;

    // ── emitter:flush — direct pass-through ──────────────────────────────────
    if (event.type === 'emitter:flush') {
      sliceEmitterHandler.onEvent?.(state.emitterNode, buildEmitterConfig(config), context, event);
      return;
    }

    // ── recursive_link:receive — LatentIntegrityLayer ─────────────────────────
    if (event.type === 'recursive_link:receive') {
      const msg = event as unknown as RecursiveLinkMessage & TraitEvent;

      // Update sycophancy centroid
      state.integrityLayer.sycophancy.observe(msg);

      // Byzantine + sycophancy check
      const result = state.integrityLayer.checkMessage(msg, state.recentSlices);

      if (result.byzantine.isAnomalous || result.sycophancy.isDrifting) {
        context.emit?.('uaal:integrity_alert', {
          byzantine:  result.byzantine,
          sycophancy: result.sycophancy,
          from:       (msg as Record<string, unknown>).from ?? 'unknown',
          domain:     msg.slice?.pillar_domain ?? 'unknown',
        });
      }

      // Track incoming slice for future Byzantine detection
      if (msg.slice) {
        state.recentSlices.push(msg.slice);
        if (state.recentSlices.length > state.historySize) {
          state.recentSlices.shift();
        }
      }
      return;
    }

    // ── All other events → CognitiveVM ───────────────────────────────────────
    //
    // Build a capture chain:
    //
    //   jepaCtx intercepts:
    //     'sliceemitter:emit' → translate to 'emitter:emit' → SliceEmitter
    //     everything else     → parent context (pass-through)
    //
    //   cogvmCtx intercepts:
    //     'pillarjepa:step'   → PillarJEPA (via jepaCtx)
    //     'recursive_link:send' → track slice for Byzantine detection, then forward
    //     everything else     → parent context (pass-through)
    //
    // The chain is synchronous: all sub-handlers complete before onEvent returns.

    const jepaConfig   = buildJepaConfig(config);
    const emitterConfig = buildEmitterConfig(config);

    const jepaCtx: TraitContext = {
      ...context,
      emit(name: string, payload: unknown): void {
        if (name === 'sliceemitter:emit') {
          // PillarJEPA's internal GRPO bridge event.
          // Translate to the SliceEmitter's consume format, adding brain_coord.
          const p = payload as { slice: PillarSlice; reward_signal?: number };
          if (p?.slice) {
            state.sim_step++;
            sliceEmitterHandler.onEvent?.(
              state.emitterNode,
              emitterConfig,
              context,             // parent context — SliceEmitter's emits go straight out
              {
                type:        'emitter:emit',
                slice:       p.slice,
                brain_coord: domainToBrainCoord(p.slice.pillar_domain),
                sim_step:    state.sim_step,
                agent_id:    config.agent_id,
              } as unknown as TraitEvent,
            );
          }
          return; // consumed internally — don't surface to parent
        }
        // Everything else (pillarjepa:loss, pillarjepa:error, …) → parent
        context.emit?.(name, payload);
      },
    } as unknown as TraitContext;

    const cogvmConfig = buildCogvmConfig(config);

    const cogvmCtx: TraitContext = {
      ...context,
      emit(name: string, payload: unknown): void {
        if (name === 'pillarjepa:step') {
          // CognitiveVM (emit_jepa_step=true) fired the JEPA step signal.
          // Route synchronously to PillarJEPA via jepaCtx.
          pillarJepaHandler.onEvent?.(
            state.jepaNode,
            jepaConfig,
            jepaCtx,
            { type: 'pillarjepa:step', ...(payload as object) } as unknown as TraitEvent,
          );
          return; // internal handoff — not surfaced to parent
        }

        if (name === 'recursive_link:send') {
          // Track outbound slices for Byzantine detection baseline
          const slice = (payload as Record<string, unknown>)?.slice as PillarSlice | undefined;
          if (slice) {
            state.recentSlices.push(slice);
            if (state.recentSlices.length > state.historySize) {
              state.recentSlices.shift();
            }
          }
          // Also forward to parent
          context.emit?.(name, payload);
          return;
        }

        // All other CognitiveVM events (inner_tick, outer_tick, lifecycle_transition,
        // dispatch_applied, frozen/unfrozen) → parent context
        context.emit?.(name, payload);
      },
    } as unknown as TraitContext;

    // Dispatch to CognitiveVM — this triggers the whole synchronous chain
    cognitiveVMHandler.onEvent?.(state.cogvmNode, cogvmConfig, cogvmCtx, event);
  },
};

export default uAALComposedAgentHandler;
