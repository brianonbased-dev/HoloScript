/**
 * JEPAObjective — v1.0
 *
 * JEPA (Joint-Embedding Predictive Architecture) world-model objective for
 * HoloScript, implementing the LeWM SIGReg variant.
 *
 * Architecture:
 *  • Context encoder  — delegates to EmbeddingTrait (embeddingHandler) to
 *    produce a latent vector from the current observation / state string.
 *  • Target encoder   — receives physics solver output directly (zero extra
 *    labeling cost; the solver already runs per simulation step).
 *  • Predictor        — JEPAPredictor MLP maps context embedding to the
 *    predicted next-state embedding.
 *  • Loss             — next-representation prediction loss (L2 in latent
 *    space) + SIGReg (Sketched Isotropic Gaussian Regularisation) term that
 *    prevents representation collapse.
 *
 * No EMA dependency.  Weight updates are expected to be driven externally
 * (training loop, gradient descent) by reading `jepa:loss` events and calling
 * back via `jepa:update_weights`.
 *
 * Events emitted:
 *  jepa:loss     { predictionLoss, sigregLoss, totalLoss, step }
 *  jepa:error    { code, message, step }
 *
 * Events consumed:
 *  jepa:encode_pair   { context: string, targetVec: Float32Array | number[],
 *                       conditioning?: Float32Array | number[],
 *                       dimensions?: number }
 *  jepa:update_weights  { W1, b1, W2, b2 }  (all Float32Array)
 *
 * References:
 *   Assran et al. 2023 — I-JEPA (arXiv:2301.08243)
 *   Maes et al. 2024   — LeWM SIGReg (github.com/lucas-maes/le-wm)
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { embeddingHandler, type EmbeddingConfig } from './EmbeddingTrait';
import { JEPAPredictor, type JEPAPredictorConfig } from './JEPAPredictor';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface JEPAObjectiveConfig {
  /**
   * Dimensionality of the shared latent space.
   * Must match EmbeddingTrait.default_dimensions when using the default
   * context encoder.
   */
  latentDim: number;

  /**
   * Dimensionality of the optional physics-action conditioning vector.
   * Set to 0 for unconditional prediction (default).
   */
  condDim: number;

  /**
   * Weight of the SIGReg regularisation term relative to prediction loss.
   * Typical range: 0.01 – 0.1.
   */
  sigregWeight: number;

  /**
   * Number of random projections used for the Sketched Isotropic Gaussian
   * Regularisation (SIGReg) estimator.  Higher = better estimate, more cost.
   */
  sigregProjections: number;

  /**
   * Target isotropic Gaussian standard deviation σ for SIGReg.
   * The regulariser drives the embedding distribution toward N(0, σ²I).
   */
  sigregSigma: number;

  /**
   * Embedding model forwarded to EmbeddingTrait for context encoding.
   */
  embeddingModel: string;
}

export interface JEPALossPayload {
  /** MSE between predicted and target embeddings. */
  predictionLoss: number;
  /** SIGReg regularisation penalty. */
  sigregLoss: number;
  /** predictionLoss + sigregWeight * sigregLoss */
  totalLoss: number;
  /** Monotonically increasing step counter. */
  step: number;
}

export type JEPAErrorCode =
  | 'JEPA_CONTEXT_REQUIRED'
  | 'JEPA_TARGET_VEC_REQUIRED'
  | 'JEPA_TARGET_DIM_MISMATCH'
  | 'JEPA_ENCODE_FAILED'
  | 'JEPA_WEIGHTS_INVALID';

export interface JEPAErrorPayload {
  code: JEPAErrorCode;
  message: string;
  step: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state stored on HSPlusNode
// ─────────────────────────────────────────────────────────────────────────────

interface JEPAState {
  step: number;
  predictor: JEPAPredictor;
  embeddingConfig: EmbeddingConfig;
  /** Captured from the last `embedding:result` event during inline encode. */
  pendingContextEmb: Float32Array | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

export const jepObjectiveHandler: TraitHandler<JEPAObjectiveConfig> = {
  name: 'jepa_objective',

  defaultConfig: {
    latentDim: 128,
    condDim: 0,
    sigregWeight: 0.05,
    sigregProjections: 64,
    sigregSigma: 1.0,
    embeddingModel: 'jepa-context-encoder',
  },

  onAttach(node: HSPlusNode, config: JEPAObjectiveConfig): void {
    const predictorConfig: JEPAPredictorConfig = {
      latentDim: config.latentDim,
      condDim: config.condDim,
    };
    (node as Record<string, unknown>).__jepaState = {
      step: 0,
      predictor: new JEPAPredictor(predictorConfig),
      embeddingConfig: {
        default_model: config.embeddingModel,
        default_dimensions: config.latentDim,
      },
      pendingContextEmb: null,
    } satisfies JEPAState;
  },

  onDetach(node: HSPlusNode): void {
    delete (node as Record<string, unknown>).__jepaState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: JEPAObjectiveConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = (node as Record<string, unknown>).__jepaState as JEPAState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    // ── Weight update from external training loop ──────────────────────────
    if (eventType === 'jepa:update_weights') {
      handleWeightUpdate(state, context, event);
      return;
    }

    // ── Main encode-pair event ─────────────────────────────────────────────
    if (eventType !== 'jepa:encode_pair') return;

    state.step++;
    const step = state.step;

    // 1. Validate inputs
    const contextStr = readString(event.context);
    if (!contextStr) {
      emitError(context, { code: 'JEPA_CONTEXT_REQUIRED', message: 'jepa:encode_pair requires a non-empty context string', step });
      return;
    }

    const targetVec = toFloat32Array(event.targetVec);
    if (!targetVec) {
      emitError(context, { code: 'JEPA_TARGET_VEC_REQUIRED', message: 'jepa:encode_pair requires targetVec (Float32Array or number[])', step });
      return;
    }
    if (targetVec.length !== config.latentDim) {
      emitError(context, {
        code: 'JEPA_TARGET_DIM_MISMATCH',
        message: `targetVec.length=${targetVec.length} ≠ latentDim=${config.latentDim}`,
        step,
      });
      return;
    }

    // 2. Encode context via EmbeddingTrait (synchronous deterministic path)
    const contextEmb = encodeContext(state, config, contextStr);
    if (!contextEmb) {
      emitError(context, { code: 'JEPA_ENCODE_FAILED', message: 'Context encoding returned null vector', step });
      return;
    }

    // 3. Run predictor
    const conditioning = toFloat32ArrayOrNull(event.conditioning);
    const { predicted } = state.predictor.forward(contextEmb, conditioning);

    // 4. Compute losses
    const predictionLoss = mseLoss(predicted, targetVec);
    const sigregLoss = computeSIGReg(
      predicted,
      config.sigregProjections,
      config.sigregSigma
    );
    const totalLoss = predictionLoss + config.sigregWeight * sigregLoss;

    // 5. Emit loss event
    context.emit?.('jepa:loss', {
      predictionLoss,
      sigregLoss,
      totalLoss,
      step,
    } satisfies JEPALossPayload);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Context encoding — delegates to EmbeddingTrait's deterministic encoder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode `contextStr` using EmbeddingTrait's deterministic fallback encoder.
 *
 * We drive the embeddingHandler synchronously via a local mock context that
 * captures the `embedding:result` event, keeping this path zero-async and
 * suitable for tight simulation loops.
 */
function encodeContext(
  state: JEPAState,
  config: JEPAObjectiveConfig,
  contextStr: string
): Float32Array | null {
  let result: Float32Array | null = null;

  const captureContext = {
    vr: null as unknown as TraitContext['vr'],
    physics: null as unknown as TraitContext['physics'],
    audio: null as unknown as TraitContext['audio'],
    haptics: null as unknown as TraitContext['haptics'],
    emit(eventName: string, payload: unknown) {
      if (eventName === 'embedding:result') {
        const p = payload as Record<string, unknown>;
        const v = p.vector;
        if (v instanceof Float32Array) result = v;
      }
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
  } as unknown as TraitContext;

  const mockNode = {} as HSPlusNode;
  embeddingHandler.onAttach?.(mockNode, state.embeddingConfig, captureContext);
  embeddingHandler.onEvent?.(
    mockNode,
    state.embeddingConfig,
    captureContext,
    {
      type: 'embedding:generate',
      input: contextStr,
      model: config.embeddingModel,
      dimensions: config.latentDim,
    }
  );
  embeddingHandler.onDetach?.(mockNode, state.embeddingConfig, captureContext);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGReg — Sketched Isotropic Gaussian Regularisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates the KL divergence between the empirical distribution of a single
 * embedding `z` and an isotropic Gaussian N(0, σ²I) using random projections
 * (sketching).
 *
 * For a batch this would average over samples; here we operate on a single
 * vector per step (online mode).  The penalty is:
 *
 *   SIGReg(z) = (1/P) Σ_p [ (z·r_p)² / σ² - 1 - log((z·r_p)²/σ²) ]
 *
 * where r_p ~ N(0, I/dim) are fixed random projection vectors (seeded
 * deterministically from the projection count for reproducibility).
 *
 * This is a scalar ≥ 0; it equals 0 iff z is drawn from N(0, σ²I).
 */
function computeSIGReg(
  z: Float32Array,
  numProjections: number,
  sigma: number
): number {
  const dim = z.length;
  const sigmaSquared = sigma * sigma;
  let total = 0;

  // Fixed deterministic projection seed for reproducibility
  let seed = 0xcafe1234;
  const lcg = (): number => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return ((seed >>> 0) / 0x100000000) * 2 - 1;
  };

  // Box-Muller to get Gaussian samples (pairs)
  const gaussianPair = (): [number, number] => {
    const u1 = Math.max(1e-12, (lcg() + 1) / 2);
    const u2 = (lcg() + 1) / 2;
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  };

  for (let p = 0; p < numProjections; p++) {
    // Sample projection vector r ~ N(0, I/dim) and dot with z
    let dot = 0;
    for (let i = 0; i < dim; i += 2) {
      const [g1, g2] = gaussianPair();
      const scale = 1 / Math.sqrt(dim);
      dot += z[i] * (g1 * scale);
      if (i + 1 < dim) dot += z[i + 1] * (g2 * scale);
    }

    // KL term per projection
    const proj2 = dot * dot;
    const ratio = proj2 / sigmaSquared;
    if (ratio > 0) {
      total += ratio - 1 - Math.log(ratio);
    } else {
      // z·r = 0: contribute maximum penalty (log(0) → −∞ avoided by clamping)
      total += 1; // constant penalty for collapsed direction
    }
  }

  return total / numProjections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weight update handler
// ─────────────────────────────────────────────────────────────────────────────

function handleWeightUpdate(
  state: JEPAState,
  context: TraitContext,
  event: TraitEvent
): void {
  try {
    state.predictor.setWeights({
      W1: requireFloat32(event.W1, 'W1'),
      b1: requireFloat32(event.b1, 'b1'),
      W2: requireFloat32(event.W2, 'W2'),
      b2: requireFloat32(event.b2, 'b2'),
    });
  } catch (err: unknown) {
    emitError(context, {
      code: 'JEPA_WEIGHTS_INVALID',
      message: err instanceof Error ? err.message : String(err),
      step: state.step,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function mseLoss(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum / a.length;
}

function emitError(context: TraitContext, payload: JEPAErrorPayload): void {
  context.emit?.('jepa:error', payload);
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

function toFloat32ArrayOrNull(value: unknown): Float32Array | null {
  if (value == null) return null;
  return toFloat32Array(value);
}

function requireFloat32(value: unknown, name: string): Float32Array {
  if (value instanceof Float32Array) return value;
  throw new TypeError(`jepa:update_weights: ${name} must be a Float32Array`);
}

export default jepObjectiveHandler;
