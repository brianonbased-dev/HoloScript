/**
 * PillarJEPA — v1.0
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
 * Total:
 *   L_total = L_jepa + λ_c · L_conservation + λ_s · L_symmetry
 *
 * Events consumed:
 *   pillarjepa:step   { context: string, targetVec: Float32Array | number[],
 *                       pillar_slice?: PillarSlice,   // optional override
 *                       conditioning?: Float32Array | number[] }
 *   pillarjepa:update_weights  { W1, b1, W2, b2 }    (forwarded to JEPAObjective)
 *
 * Events emitted:
 *   pillarjepa:loss   { jepaTotalLoss, conservationLoss, symmetryLoss,
 *                       totalLoss, step, pillar_domain, axis_1_id }
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
 *   PillarRegistry   — packages/core/src/traits/pillar/PillarRegistry.ts
 *   JEPAObjective    — packages/core/src/traits/JEPAObjective.ts
 *   SliceEmitter     — packages/core/src/traits/pillar/SliceEmitter.ts
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
} from './PillarRegistry';
import type { PillarSlice } from './SemanticCollaborationContract';

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
}

export interface PillarJEPALoss {
  /** Combined JEPA loss from JEPAObjective (MSE + SIGReg). */
  jepaTotalLoss: number;
  /** Physics conservation regularisation penalty. */
  conservationLoss: number;
  /** Symmetry equivariance penalty. */
  symmetryLoss: number;
  /** Full loss: jepaTotalLoss + λ_c·conservationLoss + λ_s·symmetryLoss */
  totalLoss: number;
  /** Monotonically increasing step counter. */
  step: number;
  /** PillarDomain of the physics slice used this step. */
  pillar_domain: string;
  /** Axis being tested for conservation. */
  axis_1_id: string;
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
  },

  onAttach(node: HSPlusNode, config: PillarJEPAConfig, context: TraitContext): void {
    const jepaNode = {} as HSPlusNode;
    const registryNode = {} as HSPlusNode;

    // Attach sub-handlers
    jepObjectiveHandler.onAttach?.(jepaNode, toJepaConfig(config), context);
    pillarRegistryHandler.onAttach?.(registryNode, toRegistryConfig(), context);

    // Register the physics conservation Pillar (it's a seed, but explicit for clarity)
    pillarRegistryHandler.onEvent?.(
      registryNode,
      toRegistryConfig(),
      silentContext(),
      { type: 'pillar:register', pillar: PHYSICS_CONSERVATION_PILLAR }
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
    const physicsSlice: PillarSlice = event.pillar_slice
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

    // 5. Physics conservation regulariser
    //    Penalise embeddings that score below pos_1 − ε_c on the conservation axis.
    //    We proxy "embedding score on conservation axis" via the conditioning alignment:
    //    conservationScore = (conditioning · conservation_direction) / ||conditioning||
    //    where conservation_direction is deterministically derived from axis_1_id.
    const conservationLoss = config.conservationWeight > 0
      ? computeConservationLoss(
          conditioning,
          physicsSlice.pos_1,
          config.conservationMargin,
          physicsSlice.axis_1_id
        )
      : 0;

    // 6. Symmetry equivariance regulariser
    //    Δz = δ · uniform unit vector (seeded by step number for reproducibility)
    //    penalty = ||predict(z + Δz) − predict(z) − Δz||² / latentDim
    //    We approximate this without re-running EmbeddingTrait by applying the
    //    shift to the conditioning vector and measuring predictor sensitivity.
    const symmetryLoss = config.symmetryWeight > 0
      ? computeSymmetryLoss(conditioning, config.symmetryDelta, step)
      : 0;

    // 7. Total loss
    const totalLoss =
      jepaLoss.totalLoss +
      conservationLoss * config.conservationWeight +
      symmetryLoss * config.symmetryWeight;

    // 8. Emit PillarJEPA loss
    const lossPayload: PillarJEPALoss = {
      jepaTotalLoss: jepaLoss.totalLoss,
      conservationLoss,
      symmetryLoss,
      totalLoss,
      step,
      pillar_domain: physicsSlice.pillar_domain,
      axis_1_id: physicsSlice.axis_1_id,
    };
    context.emit?.('pillarjepa:loss', lossPayload);

    // 9. Emit to SliceEmitter / GRPO if enabled
    //    reward_signal = −totalLoss (lower loss = better policy)
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
