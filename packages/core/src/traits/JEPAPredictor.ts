/**
 * JEPAPredictor — v1.0
 *
 * Lightweight predictor module for the JEPA (Joint-Embedding Predictive
 * Architecture) backbone.  Given a context embedding and an optional
 * conditioning vector (e.g. a physics action / delta-state), it predicts
 * the next latent representation produced by the target encoder.
 *
 * Design constraints:
 *  • No EMA (Exponential Moving Average) dependency — the calling trait
 *    manages any weight-update schedule.
 *  • Pure TypeScript; no ONNX or GPU import at this layer.
 *  • Deterministic, seeded fallback when no learned weights are supplied
 *    (satisfies unit-test requirements without a training loop).
 *
 * Architecture (single hidden layer MLP, width = latentDim):
 *   input  : [contextEmbedding ‖ conditioning]  (latentDim + condDim)
 *   hidden : ReLU(input × W1 + b1)              (latentDim)
 *   output : hidden × W2 + b2                   (latentDim)
 *
 * References:
 *   Assran et al. 2023 — "Self-Supervised Learning from Images with a
 *   Joint-Embedding Predictive Architecture" (I-JEPA)
 *   Maes et al. 2024 — LeWM SIGReg objective (github.com/lucas-maes/le-wm)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JEPAPredictorConfig {
  /** Dimensionality of the context and target latent space. */
  latentDim: number;
  /** Dimensionality of the optional conditioning vector (0 = unconditional). */
  condDim: number;
}

export interface JEPAPredictorWeights {
  W1: Float32Array; // (latentDim + condDim) × latentDim
  b1: Float32Array; // latentDim
  W2: Float32Array; // latentDim × latentDim
  b2: Float32Array; // latentDim
}

export interface JEPAPredictorForwardResult {
  /** Predicted next-state embedding in latent space. */
  predicted: Float32Array;
  /** Pre-activation hidden layer (useful for regularisation diagnostics). */
  hidden: Float32Array;
}

// ─────────────────────────────────────────────────────────────────────────────
// JEPAPredictor class
// ─────────────────────────────────────────────────────────────────────────────

export class JEPAPredictor {
  readonly latentDim: number;
  readonly condDim: number;
  private weights: JEPAPredictorWeights;

  constructor(config: JEPAPredictorConfig, weights?: JEPAPredictorWeights) {
    if (!Number.isInteger(config.latentDim) || config.latentDim < 1) {
      throw new RangeError(`JEPAPredictor: latentDim must be a positive integer, got ${config.latentDim}`);
    }
    if (!Number.isInteger(config.condDim) || config.condDim < 0) {
      throw new RangeError(`JEPAPredictor: condDim must be a non-negative integer, got ${config.condDim}`);
    }

    this.latentDim = config.latentDim;
    this.condDim = config.condDim;
    this.weights = weights ?? initDeterministicWeights(config.latentDim, config.condDim);
  }

  /**
   * Forward pass: predict next-state embedding.
   *
   * @param contextEmb  Float32Array of length latentDim (context encoder output)
   * @param conditioning Float32Array of length condDim, or null/undefined for
   *                      unconditional prediction
   */
  forward(
    contextEmb: Float32Array,
    conditioning?: Float32Array | null
  ): JEPAPredictorForwardResult {
    const { latentDim, condDim } = this;
    const inputDim = latentDim + condDim;

    if (contextEmb.length !== latentDim) {
      throw new RangeError(
        `JEPAPredictor.forward: contextEmb.length=${contextEmb.length} ≠ latentDim=${latentDim}`
      );
    }

    // Build concatenated input vector
    const input = new Float32Array(inputDim);
    input.set(contextEmb, 0);
    if (condDim > 0) {
      const cond = conditioning ?? new Float32Array(condDim);
      if (cond.length !== condDim) {
        throw new RangeError(
          `JEPAPredictor.forward: conditioning.length=${cond.length} ≠ condDim=${condDim}`
        );
      }
      input.set(cond, latentDim);
    }

    // Hidden layer: h = ReLU(input × W1 + b1)
    const hidden = matMulVec(this.weights.W1, input, inputDim, latentDim);
    addInPlace(hidden, this.weights.b1);
    reluInPlace(hidden);

    // Output layer: out = hidden × W2 + b2
    const predicted = matMulVec(this.weights.W2, hidden, latentDim, latentDim);
    addInPlace(predicted, this.weights.b2);

    return { predicted, hidden };
  }

  /**
   * Replace weights (e.g. after an external training step or gradient update).
   * Does NOT implement EMA — callers manage weight schedule externally.
   */
  setWeights(weights: JEPAPredictorWeights): void {
    validateWeights(weights, this.latentDim, this.condDim);
    this.weights = weights;
  }

  /** Read-only access to current weights for serialisation. */
  getWeights(): Readonly<JEPAPredictorWeights> {
    return this.weights;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Matrix–vector multiply: result[i] = sum_j(matrix[i * inputDim + j] * vec[j])
 * matrix is row-major, shape (outputDim × inputDim).
 */
function matMulVec(
  matrix: Float32Array,
  vec: Float32Array,
  inputDim: number,
  outputDim: number
): Float32Array {
  const out = new Float32Array(outputDim);
  for (let i = 0; i < outputDim; i++) {
    let acc = 0;
    const base = i * inputDim;
    for (let j = 0; j < inputDim; j++) {
      acc += matrix[base + j] * vec[j];
    }
    out[i] = acc;
  }
  return out;
}

function addInPlace(a: Float32Array, b: Float32Array): void {
  for (let i = 0; i < a.length; i++) {
    a[i] += b[i];
  }
}

function reluInPlace(a: Float32Array): void {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < 0) a[i] = 0;
  }
}

/**
 * Deterministic weight initialisation using a lightweight LCG so that unit
 * tests are reproducible without a PRNG library dependency.
 * Scale follows He init (fan-in = inputDim).
 */
function initDeterministicWeights(
  latentDim: number,
  condDim: number
): JEPAPredictorWeights {
  const inputDim = latentDim + condDim;
  const scale1 = Math.sqrt(2 / inputDim);
  const scale2 = Math.sqrt(2 / latentDim);

  const W1 = new Float32Array(inputDim * latentDim);
  const b1 = new Float32Array(latentDim);
  const W2 = new Float32Array(latentDim * latentDim);
  const b2 = new Float32Array(latentDim);

  let seed = 0xdeadbeef;
  const lcg = (): number => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return ((seed >>> 0) / 0x100000000) * 2 - 1; // [-1, 1)
  };

  for (let i = 0; i < W1.length; i++) W1[i] = lcg() * scale1;
  for (let i = 0; i < W2.length; i++) W2[i] = lcg() * scale2;
  // Biases initialised to zero

  return { W1, b1, W2, b2 };
}

function validateWeights(
  w: JEPAPredictorWeights,
  latentDim: number,
  condDim: number
): void {
  const inputDim = latentDim + condDim;
  const expected = {
    W1: inputDim * latentDim,
    b1: latentDim,
    W2: latentDim * latentDim,
    b2: latentDim,
  } as const;
  for (const key of ['W1', 'b1', 'W2', 'b2'] as const) {
    if (w[key].length !== expected[key]) {
      throw new RangeError(
        `JEPAPredictor: weights.${key}.length=${w[key].length} ≠ expected ${expected[key]}`
      );
    }
  }
}
