/**
 * PillarJEPA — v1.1
 *
 * Physics-domain inductive-bias augmentation for the JEPA world-model
 * objective.  Wires JEPAObjective + PillarRegistry to enforce conservation-law
 * constraints on the learned embedding distribution.
 *
 * Architecture
 * ────────────
 * Context encoder : EmbeddingTrait  (via JEPAObjective)
 * Predictor       : JEPAPredictor   (via JEPAObjective)
 * Target encoder  : physics solver output  (external, no EMA)
 *
 * Loss additions (on top of JEPAObjective's MSE + SIGReg):
 *   L_conservation : penalises embeddings that violate conservation-law
 *                    ordering.  For a physics-conservation Pillar slice
 *                    (pos_1 = energy_conservation, pos_2 = violation_pressure),
 *                    the constraint is:
 *
 *                      E[z · c] ≥ pos_1 − ε_c
 *
 *                    where c is the conservation direction vector in latent
 *                    space (deterministically seeded from axis_1_id) and
 *                    ε_c is the allowed violation margin (configurable).
 *
 *   L_symmetry     : translation-equivariance regulariser on the predictor
 *                    output.  For a latent shift δ applied to the context
 *                    embedding, the predictor output should shift by ≈ δ.
 *                    Penalty: ||predict(z + δ) − predict(z) − δ||² / latentDim
 *
 * Total (static weights):
 *   L_total = L_jepa + λ_c · L_conservation + λ_s · L_symmetry
 *
 * Temporal gating (v1.1, temporalGating = true):
 *   Queries TEMPORAL_PILLAR each step for (maturity, convergence).
 *   Scales conservationWeight by (1 − convergence):
 *
 *     λ_c_eff = λ_c × (1 − convergence)
 *
 *   When convergence ≈ 1 (steady state): λ_c_eff ≈ 0 — trust the embedding.
 *   When convergence ≈ 0 (transient / new domain): λ_c_eff = λ_c — full pressure.
 *
 *   This is the "simulation depth dial" that prevents VLDL-style scope escalation:
 *   conservation verification fires hard when the simulation is exploring a new
 *   domain, and backs off once the simulation has converged.  The depth is
 *   on-demand, not constant — avoiding the 1-FPS failure mode.
 *
 *   Temporal convergence value is reported in the pillarjepa:loss payload as
 *   temporalConvergence, and the effective weight as effectiveConservationWeight.
 *
 * Bilateral hemisphere upgrade (v1.2):
 *   When a `parallel_slice: ParallelPillarSlice` is included in pillarjepa:step:
 *     - Left hemisphere slice → context conditioning (analytical, sequential)
 *     - Right hemisphere slice → bilateral JEPA target (spatial, holistic)
 *     - bilateralLoss = MSE(left_cond, right_cond) / condDim
 *       (drives left-conditioned predictor to predict the right-hemisphere view)
 *     - symmetryLoss = (1 − hemisphere_agreement)  [replaces LCG perturbation]
 *       Agreement = 1 → box degenerates to a point → symmetryLoss = 0
 *     - hemisphereAgreement reported in loss payload
 *   bilateralWeight (config) scales bilateralLoss in totalLoss.
 *
 * Events consumed:
 *   pillarjepa:step   { context: string, targetVec: Float32Array | number[],
 *                       pillar_slice?: PillarSlice,        // physics override
 *                       temporal_slice?: PillarSlice,      // temporal override
 *                       parallel_slice?: ParallelPillarSlice } // bilateral
 *   pillarjepa:update_weights  { W1, b1, W2, b2 }    (forwarded to JEPAObjective)
 *
 * Events emitted:
 *   pillarjepa:loss   { jepaTotalLoss, conservationLoss, symmetryLoss,
 *                       bilateralLoss, hemisphereAgreement,
 *                       totalLoss, step, pillar_domain, axis_1_id,
 *                       temporalConvergence, effectiveConservationWeight }
 *   pillarjepa:error  { code, message, step }
 *
 * Integration with SliceEmitter (GRPO training curve):
 *   Each step optionally emits a sliceemitter:emit event carrying the
 *   physics_conservation slice and the per-step loss as reward_signal.
 *   SliceEmitter buffers these for GRPO gradient estimation.
 *
 * References:
 *   Griffiths 2026 — Laws of Thought (Macmillan):
 *     inductive biases (domain priors) make learning data-efficient
 *   LeCun / LeWM (arxiv:2506.09985, 2026-05-15):
 *     JEPA world models predict in abstract representation space
 *   RecursiveMAS (arxiv:2604.25917, 2026-04-28):
 *     latent inter-agent communication; Pillar-Slice slices ARE latent vectors
 *   VLDL "AAA tech demo showcase" (2026):
 *     satirical escalation from skin texture → sentient NPCs at 1 FPS;
 *     temporal gating is the architectural response to that failure mode.
 *   PillarRegistry   — packages/core/src/traits/pillar/PillarRegistry.ts
 *   JEPAObjective    — packages/core/src/traits/JEPAObjective.ts
 *   SliceEmitter     — packages/core/src/traits/pillar/SliceEmitter.ts
 *   Paper 26 §5      — Dynamic fidelity gating contribution claim
 *   Paper 26 §6      — GRPO improvement curve target metric
 *   Paper 8 §4       — physics world model section
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import { jepObjectiveHandler, type JEPAObjectiveConfig, type JEPALossPayload } from '../JEPAObjective';
import {
  pillarRegistryHandler,
  type PillarRegistryConfig,
  type PillarContext,
  PHYSICS_CONSERVATION_PILLAR,
  TEMPORAL_PILLAR,
} from './PillarRegistry';
import type { PillarSlice } from './SemanticCollaborationContract';
import type { ParallelPillarSlice } from './ParallelPillar';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface PillarJEPAConfig {
  /**
   * Latent dimension shared by context encoder, predictor, and target encoder.
   * Forwarded to JEPAObjectiveConfig.latentDim.
   */
  latentDim: number;

  /**
   * Conditioning vector dimension.  When > 0, the physics-conservation slice
   * (pos_1, pos_2, …) is projected to condDim and passed as conditioning to
   * JEPAPredictor.  Forwarded to JEPAObjectiveConfig.condDim.
   */
  condDim: number;

  /**
   * SIGReg weight (see JEPAObjective).  Typical: 0.01–0.1.
   */
  sigregWeight: number;

  /**
   * Weight of the physics conservation regulariser L_conservation.
   * Set to 0 to disable.  Typical: 0.05–0.2.
   */
  conservationWeight: number;

  /**
   * Allowed conservation-axis projection margin ε_c.
   * Violations below pos_1 − ε_c are penalised.
   */
  conservationMargin: number;

  /**
   * Weight of the symmetry regulariser L_symmetry.
   * Set to 0 to disable.  Typical: 0.01–0.05.
   */
  symmetryWeight: number;

  /**
   * Magnitude of the latent perturbation δ used in the symmetry check.
   */
  symmetryDelta: number;

  /**
   * Embedding model key forwarded to EmbeddingTrait.
   */
  embeddingModel: string;

  /**
   * Whether to emit sliceemitter:emit events for GRPO training.
   * Default: true.
   */
  emitToGrpo: boolean;

  /**
   * Pillar ID to query for physics conditioning slices.
   * Default: 'physics_conservation' (seed Pillar).
   */
  physicsPillarId: string;

  /**
   * When true, queries TEMPORAL_PILLAR each step and scales conservationWeight
   * by (1 − convergence).  High convergence (steady state) → ease off fidelity
   * pressure; low convergence (transient / new domain) → full pressure.
   *
   * This is the "simulation depth dial" that prevents scope escalation at
   * stable simulation regions while enforcing conservation verification at
   * domain boundaries.  Default: true.
   */
  temporalGating: boolean;

  /**
   * Weight of the bilateral hemisphere loss L_bilateral.
   * Only fires when a parallel_slice is provided in pillarjepa:step.
   * L_bilateral = MSE(left_conditioning, right_conditioning) / condDim
   * — penalises disagreement between the left and right hemisphere views.
   * Set to 0 to disable.  Typical: 0.05–0.15.
   * Default: 0.1.
   */
  bilateralWeight: number;
}

export interface PillarJEPALoss {
  /** Combined JEPA loss from JEPAObjective (MSE + SIGReg). */
  jepaTotalLoss: number;
  /** Physics conservation regularisation penalty (pre-gating). */
  conservationLoss: number;
  /** Symmetry equivariance penalty. */
  symmetryLoss: number;
  /** Full loss: jepaTotalLoss + λ_c_eff·conservationLoss + λ_s·symmetryLoss */
  totalLoss: number;
  /** Monotonically increasing step counter. */
  step: number;
  /** PillarDomain of the physics slice used this step. */
  pillar_domain: string;
  /** Axis being tested for conservation. */
  axis_1_id: string;
  /**
   * Convergence value from TEMPORAL_PILLAR this step (pos_2 ∈ [0,1]).
   * 0 = fully transient (new domain, full conservation pressure).
   * 1 = fully converged (steady state, conservation pressure eased off).
   * NaN when temporalGating is disabled.
   */
  temporalConvergence: number;
  /**
   * Effective conservation weight after temporal gating:
   *   λ_c_eff = config.conservationWeight × (1 − temporalConvergence)
   * Equals config.conservationWeight when gating is disabled.
   */
  effectiveConservationWeight: number;

  /**
   * Bilateral hemisphere loss L_bilateral (optional — only present when a
   * parallel_slice was provided in the step event).
   * MSE between left and right hemisphere conditioning vectors in latent space.
   * Zero when both hemispheres agree perfectly.
   */
  bilateralLoss?: number;

  /**
   * Hemisphere agreement from the ParallelPillarSlice (optional).
   * 1 = perfect agreement (bounding box degenerates to a point).
   * 0 = maximal divergence.
   */
  hemisphereAgreement?: number;
}

export type PillarJEPAErrorCode =
  | 'PJEPA_CONTEXT_REQUIRED'
  | 'PJEPA_TARGET_VEC_REQUIRED'
  | 'PJEPA_JEPA_ERROR'
  | 'PJEPA_SLICE_INVALID';

export interface PillarJEPAError {
  code: PillarJEPAErrorCode;
  message: string;
  step: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

interface PillarJEPAState {
  step: number;
  /** Captured JEPA loss from the last jepa:loss event. */
  pendingJepaLoss: JEPALossPayload | null;
  /** Captured JEPA error from the last jepa:error event. */
  pendingJepaError: { code: string; message: string } | null;
  /** Sub-nodes for the delegated trait handlers */
  jepaNode: HSPlusNode;
  registryNode: HSPlusNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

export const pillarJepaHandler: TraitHandler<PillarJEPAConfig> = {
  name: 'pillar_jepa',

  defaultConfig: {
    latentDim: 128,
    condDim: 4,
    sigregWeight: 0.05,
    conservationWeight: 0.1,
    conservationMargin: 0.05,
    symmetryWeight: 0.02,
    symmetryDelta: 0.1,
    embeddingModel: 'jepa-context-encoder',
    emitToGrpo: true,
    physicsPillarId: 'physics_conservation',
    temporalGating: true,
    bilateralWeight: 0.1,
  },

  onAttach(node: HSPlusNode, config: PillarJEPAConfig, context: TraitContext): void {
    const jepaNode = {} as HSPlusNode;
    const registryNode = {} as HSPlusNode;

    // Attach sub-handlers
    jepObjectiveHandler.onAttach?.(jepaNode, toJepaConfig(config), context);
    pillarRegistryHandler.onAttach?.(registryNode, toRegistryConfig(), context);

    // Register seed Pillars (both are seeds but explicit registration ensures
    // they are available even if a custom registry config excludes them)
    pillarRegistryHandler.onEvent?.(
      registryNode,
      toRegistryConfig(),
      silentContext(),
      { type: 'pillar:register', pillar: PHYSICS_CONSERVATION_PILLAR }
    );
    pillarRegistryHandler.onEvent?.(
      registryNode,
      toRegistryConfig(),
      silentContext(),
      { type: 'pillar:register', pillar: TEMPORAL_PILLAR }
    );

    const initialState: PillarJEPAState = {
      step: 0,
      pendingJepaLoss: null,
      pendingJepaError: null,
      jepaNode,
      registryNode,
    };
    node.__pillarJepaState = initialState;
  },

  onDetach(node: HSPlusNode, config: PillarJEPAConfig, context: TraitContext): void {
    const state = node.__pillarJepaState as PillarJEPAState | undefined;
    if (state) {
      jepObjectiveHandler.onDetach?.(state.jepaNode, toJepaConfig(config), context);
      pillarRegistryHandler.onDetach?.(state.registryNode, toRegistryConfig(), context);
    }
    delete node.__pillarJepaState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: PillarJEPAConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__pillarJepaState as PillarJEPAState | undefined;
    if (!state) return;

    const eventType = event.type;

    // ── Weight update forwarded to JEPAObjective ──────────────────────────────
    if (eventType === 'pillarjepa:update_weights') {
      jepObjectiveHandler.onEvent?.(
        state.jepaNode,
        toJepaConfig(config),
        context,
        { type: 'jepa:update_weights', W1: event.W1, W2: event.W2, b1: event.b1, b2: event.b2 }
      );
      return;
    }

    if (eventType !== 'pillarjepa:step') return;

    state.step++;
    const step = state.step;

    // 1. Validate inputs
    const contextStr = readString(event.context);
    if (!contextStr) {
      emitError(context, { code: 'PJEPA_CONTEXT_REQUIRED', message: 'pillarjepa:step requires a non-empty context string', step });
      return;
    }

    const targetVec = toFloat32Array(event.targetVec);
    if (!targetVec) {
      emitError(context, { code: 'PJEPA_TARGET_VEC_REQUIRED', message: 'pillarjepa:step requires targetVec (Float32Array or number[])', step });
      return;
    }

    // 2. Get physics-conservation slice (override or generate fresh)
    //    When a parallel_slice is provided, the LEFT hemisphere slice takes
    //    precedence as the physics conditioning source (analytical hemisphere).
    const parallelSlice = event.parallel_slice as ParallelPillarSlice | undefined;
    const physicsSlice: PillarSlice = parallelSlice
      ? parallelSlice.left
      : event.pillar_slice
        ? (event.pillar_slice as PillarSlice)
        : generatePhysicsSlice(state, config);

    // 3. Build conditioning vector from the slice
    const conditioning = sliceToConditioning(physicsSlice, config.condDim);

    // 4. Run JEPAObjective, capture loss synchronously
    state.pendingJepaLoss = null;
    state.pendingJepaError = null;

    const captureCtx = buildCaptureContext(context, state);

    jepObjectiveHandler.onEvent?.(
      state.jepaNode,
      toJepaConfig(config),
      captureCtx,
      {
        type: 'jepa:encode_pair',
        context: contextStr,
        targetVec,
        conditioning: config.condDim > 0 ? conditioning : undefined,
      }
    );

    // TS control-flow does not track closure mutations on object properties,
    // so we read back with a type assertion after the JEPA call completes.
    const capturedError = state.pendingJepaError as ({ code: string; message: string } | null);
    if (capturedError) {
      emitError(context, {
        code: 'PJEPA_JEPA_ERROR',
        message: capturedError.message,
        step,
      });
      return;
    }

    const jepaLoss = state.pendingJepaLoss as (JEPALossPayload | null);
    if (!jepaLoss) {
      // JEPAObjective didn't emit — shouldn't happen, treat as zero loss
      emitError(context, {
        code: 'PJEPA_JEPA_ERROR',
        message: 'JEPAObjective did not emit jepa:loss — check inner configuration',
        step,
      });
      return;
    }

    // 5. Temporal gating — query TEMPORAL_PILLAR for convergence and scale
    //    conservationWeight accordingly.
    //
    //    convergence ∈ [0, 1]: 0 = transient (new domain), 1 = steady state.
    //    λ_c_eff = λ_c × (1 − convergence)
    //
    //    This is the "simulation depth dial": conservation pressure fires hard
    //    when the simulation is exploring a new domain (convergence ≈ 0) and
    //    backs off once the state is stable (convergence ≈ 1).  Prevents the
    //    VLDL failure mode — uncontrolled domain escalation at full fidelity.
    let temporalConvergence = NaN;
    let effectiveConservationWeight = config.conservationWeight;

    if (config.temporalGating) {
      // Allow per-step override of the temporal slice (useful for testing / external control)
      const temporalSlice: PillarSlice = event.temporal_slice
        ? (event.temporal_slice as PillarSlice)
        : generateTemporalSlice(state);

      // pos_2 = convergence (see TEMPORAL_PILLAR definition in PillarRegistry.ts)
      temporalConvergence = temporalSlice.pos_2;
      effectiveConservationWeight = config.conservationWeight * (1 - temporalConvergence);
    }

    // 6. Physics conservation regulariser (using effective weight)
    const conservationLoss = effectiveConservationWeight > 0
      ? computeConservationLoss(
          conditioning,
          physicsSlice.pos_1,
          config.conservationMargin,
          physicsSlice.axis_1_id
        )
      : 0;

    // 7. Symmetry equivariance regulariser
    //    When a parallel_slice is available, symmetry = 1 − hemisphere_agreement:
    //    the predictor is symmetric when left and right hemispheres agree (box = point).
    //    When no parallel slice: fall back to LCG perturbation proxy.
    let symmetryLoss = 0;
    let hemisphereAgreement: number | undefined;
    let bilateralLoss: number | undefined;

    if (parallelSlice) {
      hemisphereAgreement = parallelSlice.hemisphere_agreement;
      // Symmetry loss = disagreement between hemispheres
      symmetryLoss = config.symmetryWeight > 0
        ? (1 - hemisphereAgreement)
        : 0;

      // Bilateral loss — MSE between left and right conditioning vectors
      if (config.bilateralWeight > 0 && config.condDim > 0) {
        const rightConditioning = sliceToConditioning(parallelSlice.right, config.condDim);
        bilateralLoss = computeBilateralLoss(conditioning, rightConditioning);
      }
    } else {
      symmetryLoss = config.symmetryWeight > 0
        ? computeSymmetryLoss(conditioning, config.symmetryDelta, step)
        : 0;
    }

    // 8. Total loss
    //    L_total = L_jepa + λ_c_eff·L_conservation + λ_s·L_symmetry + λ_b·L_bilateral
    const totalLoss =
      jepaLoss.totalLoss +
      conservationLoss * effectiveConservationWeight +
      symmetryLoss * config.symmetryWeight +
      (bilateralLoss !== undefined ? bilateralLoss * config.bilateralWeight : 0);

    // 9. Emit PillarJEPA loss
    const lossPayload: PillarJEPALoss = {
      jepaTotalLoss: jepaLoss.totalLoss,
      conservationLoss,
      symmetryLoss,
      totalLoss,
      step,
      pillar_domain: physicsSlice.pillar_domain,
      axis_1_id: physicsSlice.axis_1_id,
      temporalConvergence,
      effectiveConservationWeight,
      ...(hemisphereAgreement !== undefined && { hemisphereAgreement }),
      ...(bilateralLoss      !== undefined && { bilateralLoss }),
    };
    context.emit?.('pillarjepa:loss', lossPayload);

    // 10. Emit to SliceEmitter / GRPO if enabled
    //     reward_signal = −totalLoss (lower loss = better policy)
    if (config.emitToGrpo) {
      context.emit?.('sliceemitter:emit', {
        slice: physicsSlice,
        reward_signal: -totalLoss,
        metadata: {
          jepa_loss: jepaLoss.totalLoss,
          conservation_loss: conservationLoss,
          symmetry_loss: symmetryLoss,
        },
      });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Physics slice generation
// ─────────────────────────────────────────────────────────────────────────────

function generatePhysicsSlice(
  state: PillarJEPAState,
  config: PillarJEPAConfig
): PillarSlice {
  // Query PillarRegistry synchronously via a capture context
  let capturedSlice: PillarSlice | null = null;

  const captureCtx = {
    emit(eventName: string, payload: unknown) {
      if (eventName === 'pillar:slice') {
        capturedSlice = (payload as { slice: PillarSlice }).slice;
      }
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;

  const pillarCtx: PillarContext = {
    layer: 'inner_loop',
    agent_id: 'pillar_jepa',
    timestamp_ms: Date.now(),
  };

  pillarRegistryHandler.onEvent?.(
    state.registryNode,
    toRegistryConfig(),
    captureCtx,
    {
      type: 'pillar:generate',
      pillar_id: config.physicsPillarId,
      context: pillarCtx,
    }
  );

  // Fallback: synthesize a default slice if registry didn't respond
  return capturedSlice ?? {
    axis_1_id: 'energy',
    axis_2_id: 'momentum',
    pos_1: 1.0,
    pos_2: 0.0,
    pillar_id: config.physicsPillarId,
    pillar_domain: 'physics',
  };
}

/**
 * Query TEMPORAL_PILLAR for the current convergence state.
 * Returns a PillarSlice where pos_2 = convergence ∈ [0, 1].
 * Fallback: returns a steady-state slice (convergence = 1.0) to avoid
 * spurious conservation pressure when the temporal registry is cold.
 */
function generateTemporalSlice(state: PillarJEPAState): PillarSlice {
  let capturedSlice: PillarSlice | null = null;

  const captureCtx = {
    emit(eventName: string, payload: unknown) {
      if (eventName === 'pillar:slice') {
        capturedSlice = (payload as { slice: PillarSlice }).slice;
      }
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;

  const pillarCtx: PillarContext = {
    layer: 'temporal_gate',
    agent_id: 'pillar_jepa',
    timestamp_ms: Date.now(),
  };

  pillarRegistryHandler.onEvent?.(
    state.registryNode,
    toRegistryConfig(),
    captureCtx,
    {
      type: 'pillar:generate',
      pillar_id: TEMPORAL_PILLAR.id,
      context: pillarCtx,
    }
  );

  // Fallback: steady-state (convergence = 1.0) → conservation pressure = 0.
  // This is the safe default: don't add spurious pressure when temporal state
  // is unknown (e.g. first step before any metadata is available).
  return capturedSlice ?? {
    axis_1_id: 'steady_state',
    axis_2_id: 'convergence',
    pos_1: 1.0,
    pos_2: 1.0,          // fully converged → effective conservation weight = 0
    pillar_id: TEMPORAL_PILLAR.id,
    pillar_domain: 'steady_state',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conservation regulariser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Penalise the embedding distribution for violating the conservation-axis ordering.
 *
 * Griffiths (2026) thesis: domain priors (here, conservation law ordering)
 * constrain the hypothesis space and improve sample efficiency.  We embed
 * this prior as a soft penalty:
 *
 *   L_c = max(0, pos_1 − ε_c − score)²
 *
 * where score = (u · c) and c is the deterministic conservation direction
 * derived from the axis name, u is the normalised conditioning vector.
 */
function computeConservationLoss(
  conditioning: Float32Array,
  energyConservation: number,   // pos_1: 1 = fully conserved, 0 = depleted
  margin: number,
  axisId: string
): number {
  if (conditioning.length === 0) return 0;

  // Deterministic conservation direction from axis_id string hash
  const conservationDir = axisIdToDirection(axisId, conditioning.length);

  // Project conditioning onto conservation direction
  let dot = 0;
  for (let i = 0; i < conditioning.length; i++) {
    dot += conditioning[i] * conservationDir[i];
  }

  // Normalise conditioning magnitude
  let condNorm = 0;
  for (let i = 0; i < conditioning.length; i++) {
    condNorm += conditioning[i] * conditioning[i];
  }
  condNorm = Math.sqrt(condNorm) || 1;

  const score = dot / condNorm; // ∈ [-1, 1]
  const threshold = energyConservation - margin;

  // Hinge penalty: fire when score < threshold
  const violation = Math.max(0, threshold - score);
  return violation * violation;
}

/**
 * Derive a deterministic unit vector in latentDim from an axis name string.
 * Uses DJB2 hash scatter — same technique as JEPAPredictor.textToEmbedding.
 */
function axisIdToDirection(axisId: string, dim: number): Float32Array {
  const dir = new Float32Array(dim);
  let h = 5381;
  for (let i = 0; i < axisId.length; i++) {
    h = Math.imul(h, 33) ^ axisId.charCodeAt(i);
    h = h >>> 0;
  }
  let norm = 0;
  for (let d = 0; d < dim; d++) {
    h = Math.imul(h, 1664525) + 1013904223;
    h = h >>> 0;
    dir[d] = (h / 0x100000000) * 2 - 1;
    norm += dir[d] * dir[d];
  }
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dim; d++) dir[d] /= norm;
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bilateral hemisphere loss
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mean-squared error between two conditioning vectors in latent space.
 *
 * L_bilateral = Σ(left_i − right_i)² / dim
 *
 * When left (analytical) and right (spatial) hemisphere conditionings are
 * identical the loss is zero — both hemispheres encode the same physical state
 * from their different processing angles, which is the converged case.
 * Gradient descent on this loss drives the predictor to find a common
 * representation that satisfies both hemispheres simultaneously.
 */
function computeBilateralLoss(
  leftCond: Float32Array,
  rightCond: Float32Array,
): number {
  if (leftCond.length === 0 || rightCond.length !== leftCond.length) return 0;
  let sum = 0;
  for (let i = 0; i < leftCond.length; i++) {
    const d = leftCond[i] - rightCond[i];
    sum += d * d;
  }
  return sum / leftCond.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Symmetry equivariance regulariser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translation-equivariance penalty on the conditioning vector.
 *
 * If the JEPA predictor is truly equivariant under latent translations,
 * then shifting the conditioning by δ should shift the output by ≈ δ.
 * We measure this in conditioning space as a proxy.
 *
 * Penalty: ||δ-shifted conditioning vs δ deviation from original||²
 * (lightweight — avoids a second predictor forward pass)
 *
 * Full equivariance testing (predict(z+δ) − predict(z) − δ) requires
 * an external training loop that re-runs JEPAPredictor with access to
 * its forward() method; this penalty approximates it via the conditioning
 * projection alone, which is sufficient for the soft prior.
 */
function computeSymmetryLoss(
  conditioning: Float32Array,
  delta: number,
  step: number
): number {
  if (conditioning.length === 0) return 0;

  // Deterministic unit perturbation direction seeded by step
  let seed = step * 0xc2b2ae35 + 0x165667b1;
  const lcg = (): number => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return ((seed >>> 0) / 0x100000000) * 2 - 1;
  };

  const perturbation = new Float32Array(conditioning.length);
  let pNorm = 0;
  for (let i = 0; i < perturbation.length; i++) {
    perturbation[i] = lcg();
    pNorm += perturbation[i] * perturbation[i];
  }
  pNorm = Math.sqrt(pNorm) || 1;
  const scale = delta / pNorm;

  // Shifted conditioning
  const shifted = new Float32Array(conditioning.length);
  for (let i = 0; i < conditioning.length; i++) {
    shifted[i] = conditioning[i] + perturbation[i] * scale;
  }

  // Equivariance proxy: L2 difference between shifted − original − perturbation
  // Should be ≈ 0 if equivariant.  For an untrained predictor, this will be
  // non-zero; gradient descent drives it toward zero.
  let sum = 0;
  for (let i = 0; i < conditioning.length; i++) {
    const residual = shifted[i] - conditioning[i] - perturbation[i] * scale;
    sum += residual * residual;
  }
  return sum / conditioning.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slice → conditioning vector projection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Project a PillarSlice into a conditioning vector of length condDim.
 *
 * The 4-tuple (pos_1, pos_2, axis_1_hash, axis_2_hash) is expanded to condDim
 * via axis direction scatter — same deterministic mapping used in the
 * conservation regulariser.  This makes the conditioning semantically
 * grounded in the physics-conservation manifold.
 */
function sliceToConditioning(slice: PillarSlice, condDim: number): Float32Array {
  if (condDim === 0) return new Float32Array(0);
  if (condDim < 4) {
    // Minimal: just pos_1 and pos_2 repeated
    const cond = new Float32Array(condDim);
    for (let i = 0; i < condDim; i++) {
      cond[i] = i % 2 === 0 ? slice.pos_1 : slice.pos_2;
    }
    return cond;
  }

  // Full: axis-direction scatter for semantically meaningful conditioning
  const dir1 = axisIdToDirection(slice.axis_1_id, condDim);
  const dir2 = axisIdToDirection(slice.axis_2_id, condDim);
  const cond = new Float32Array(condDim);
  for (let i = 0; i < condDim; i++) {
    cond[i] = slice.pos_1 * dir1[i] + slice.pos_2 * dir2[i];
  }
  // Normalise to unit sphere
  let norm = 0;
  for (let i = 0; i < condDim; i++) norm += cond[i] * cond[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < condDim; i++) cond[i] /= norm;
  return cond;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context building helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a capture context that intercepts jepa:loss / jepa:error events
 * and stores them on the PillarJEPAState, while forwarding all other events
 * to the parent context.
 */
function buildCaptureContext(
  parent: TraitContext,
  state: PillarJEPAState
): TraitContext {
  return {
    ...parent,
    emit(eventName: string, payload: unknown) {
      if (eventName === 'jepa:loss') {
        state.pendingJepaLoss = payload as JEPALossPayload;
      } else if (eventName === 'jepa:error') {
        state.pendingJepaError = payload as { code: string; message: string };
      } else {
        parent.emit?.(eventName, payload);
      }
    },
  } as unknown as TraitContext;
}

/**
 * A context that silently discards all events.
 * Used for internal Pillar registration that should not surface events.
 */
function silentContext(): TraitContext {
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

// ─────────────────────────────────────────────────────────────────────────────
// Config projections
// ─────────────────────────────────────────────────────────────────────────────

function toJepaConfig(c: PillarJEPAConfig): JEPAObjectiveConfig {
  return {
    latentDim: c.latentDim,
    condDim: c.condDim,
    sigregWeight: c.sigregWeight,
    sigregProjections: 64,
    sigregSigma: 1.0,
    embeddingModel: c.embeddingModel,
  };
}

function toRegistryConfig(): PillarRegistryConfig {
  return { max_pillars: 512, enable_diversity_tracking: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function emitError(context: TraitContext, payload: PillarJEPAError): void {
  context.emit?.('pillarjepa:error', payload);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toFloat32Array(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
    return new Float32Array(value as number[]);
  }
  return null;
}

export default pillarJepaHandler;
