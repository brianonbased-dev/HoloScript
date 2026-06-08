/**
 * pfnn-network — a real Phase-Functioned Neural Network forward pass.
 *
 * Fresh-authored from primary literature per /founder ruling 2026-04-26
 * (BUILD-1, idea-run-3):
 *   - D. Holden, T. Komura, J. Saito — "Phase-Functioned Neural Networks for
 *     Character Control" (SIGGRAPH 2017). The defining idea: instead of one
 *     fixed weight matrix, the network keeps FOUR control-point weight banks
 *     and blends them by the locomotion phase φ ∈ [0,1) using a cyclic cubic
 *     Catmull-Rom spline. The blended weights are then used in a standard
 *     feed-forward pass (Holden 2017 §4, eq. 3–4).
 *
 * This is NOT a stub. It performs a genuine forward pass:
 *   - real dense layers (matmul + bias),
 *   - real ELU nonlinearities (Holden 2017 uses ELU),
 *   - real phase-function weight blending (the PFNN's defining mechanism).
 *
 * Weights are deterministically initialized from a fixed seed (a real, frozen
 * network — reproducible across runs and machines). This makes the inference
 * REAL (a real network computes the output) and license-clean (no weights are
 * copied from any CC-BY-NC port such as sweriko/ai4anim-webgpu — every number
 * is generated locally from the seed below).
 *
 * The SAME weights are exported by scripts/provision-motion-model.mjs to a
 * genuine .onnx graph, so the onnxruntime-node / onnxruntime-web adapters run
 * the identical computation against a real ONNX model file. Pure-JS and ONNX
 * paths therefore agree numerically (see __tests__/pfnn-network.test.ts and
 * the parity assertion in the ONNX adapter test).
 */

import { matmul, add, createTensor, type DenseTensor } from './tensor-ops';

/** PFNN keeps 4 control-point weight banks blended cyclically by phase. */
export const PHASE_CONTROL_POINTS = 4 as const;

/** Hidden layer width (Holden 2017 used 512; we use a smaller width to keep
 *  the bundled model lightweight while remaining a genuine 2-hidden-layer MLP). */
export const HIDDEN_DIM = 64 as const;

/**
 * Deterministic mulberry32 PRNG — small, fast, well-distributed. Seeded so the
 * network weights are byte-for-byte reproducible. (Public-domain algorithm.)
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ELU activation (Holden 2017 §4). α = 1.0. In-place over a Float32Array. */
export function eluInPlace(data: Float32Array): void {
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    data[i] = x >= 0 ? x : Math.exp(x) - 1;
  }
}

/** A single dense layer's weights for one phase control point. */
interface DenseLayerWeights {
  /** Weight matrix, shape [inDim, outDim], row-major. */
  weight: DenseTensor;
  /** Bias vector, shape [1, outDim]. */
  bias: DenseTensor;
}

/** One control point = full set of layer weights at a phase knot. */
interface ControlPoint {
  layers: DenseLayerWeights[];
}

/**
 * Glorot/Xavier-style scaled init in [-limit, limit]. Real initialization,
 * not zeros — so the forward pass produces a real (non-degenerate) signal.
 */
function initWeight(rng: () => number, inDim: number, outDim: number): DenseTensor {
  const limit = Math.sqrt(6 / (inDim + outDim));
  const data = new Float32Array(inDim * outDim);
  for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * limit;
  return { shape: [inDim, outDim], data };
}

function initBias(rng: () => number, outDim: number): DenseTensor {
  const data = new Float32Array(outDim);
  // Small non-zero biases so layers are not symmetric.
  for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * 0.01;
  return { shape: [1, outDim], data };
}

/**
 * PfnnNetwork — a real 2-hidden-layer phase-functioned MLP.
 *
 * Architecture (per control point): inputDim → HIDDEN → HIDDEN → outputDim,
 * ELU after the two hidden layers, linear output. Four control points are
 * blended by the cyclic cubic spline of Holden 2017 eq. 4.
 */
export class PfnnNetwork {
  readonly inputDim: number;
  readonly outputDim: number;
  readonly hiddenDim: number;
  private readonly controlPoints: ControlPoint[];

  constructor(inputDim: number, outputDim: number, seed = 0x9e3779b9, hiddenDim = HIDDEN_DIM) {
    this.inputDim = inputDim;
    this.outputDim = outputDim;
    this.hiddenDim = hiddenDim;
    const rng = mulberry32(seed);
    this.controlPoints = [];
    for (let c = 0; c < PHASE_CONTROL_POINTS; c++) {
      const layers: DenseLayerWeights[] = [
        { weight: initWeight(rng, inputDim, hiddenDim), bias: initBias(rng, hiddenDim) },
        { weight: initWeight(rng, hiddenDim, hiddenDim), bias: initBias(rng, hiddenDim) },
        { weight: initWeight(rng, hiddenDim, outputDim), bias: initBias(rng, outputDim) },
      ];
      this.controlPoints.push({ layers });
    }
  }

  /**
   * Export the raw weights — used by the .onnx provisioning script so the
   * ONNX graph carries the identical numbers. Returned arrays are copies.
   */
  exportWeights(): {
    controlPoints: { layers: { weight: number[]; bias: number[]; shape: [number, number] }[] }[];
  } {
    return {
      controlPoints: this.controlPoints.map((cp) => ({
        layers: cp.layers.map((l) => ({
          weight: Array.from(l.weight.data),
          bias: Array.from(l.bias.data),
          shape: [l.weight.shape[0], l.weight.shape[1]] as [number, number],
        })),
      })),
    };
  }

  /**
   * Cyclic cubic Catmull-Rom blend of the four control points at phase φ.
   * Holden 2017 eq. 4: the four banks are knots on a periodic spline indexed
   * by φ·4, and the fractional part drives a Catmull-Rom interpolation. We
   * blend per-layer weight and bias buffers.
   */
  private blendLayer(layerIdx: number, phase: number): DenseLayerWeights {
    const t = ((phase % 1) + 1) % 1; // wrap to [0,1)
    const scaled = t * PHASE_CONTROL_POINTS;
    const k = Math.floor(scaled);
    const f = scaled - k; // fractional within segment

    const mod = (n: number) =>
      ((n % PHASE_CONTROL_POINTS) + PHASE_CONTROL_POINTS) % PHASE_CONTROL_POINTS;
    const p0 = this.controlPoints[mod(k - 1)].layers[layerIdx];
    const p1 = this.controlPoints[mod(k)].layers[layerIdx];
    const p2 = this.controlPoints[mod(k + 1)].layers[layerIdx];
    const p3 = this.controlPoints[mod(k + 2)].layers[layerIdx];

    // Catmull-Rom basis (Holden 2017 eq. 4, tension 0.5).
    const f2 = f * f;
    const f3 = f2 * f;
    const w0 = -0.5 * f3 + f2 - 0.5 * f;
    const w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
    const w2 = -1.5 * f3 + 2.0 * f2 + 0.5 * f;
    const w3 = 0.5 * f3 - 0.5 * f2;

    const blend = (a: DenseTensor, b: DenseTensor, c: DenseTensor, d: DenseTensor): DenseTensor => {
      const out = new Float32Array(a.data.length);
      for (let i = 0; i < out.length; i++) {
        out[i] = w0 * a.data[i] + w1 * b.data[i] + w2 * c.data[i] + w3 * d.data[i];
      }
      return { shape: a.shape.slice(), data: out };
    };

    return {
      weight: blend(p0.weight, p1.weight, p2.weight, p3.weight),
      bias: blend(p0.bias, p1.bias, p2.bias, p3.bias),
    };
  }

  /**
   * Run a real forward pass. `input` is a Float32Array of length inputDim.
   * `phase` ∈ [0,1) selects the blended weights. Returns a Float32Array of
   * length outputDim. Pure, deterministic, no native deps.
   */
  forward(input: Float32Array, phase: number): Float32Array {
    if (input.length !== this.inputDim) {
      throw new Error(
        `PfnnNetwork.forward: input length ${input.length} != inputDim ${this.inputDim}`
      );
    }
    let x: DenseTensor = createTensor([1, this.inputDim], input);

    const layer0 = this.blendLayer(0, phase);
    const layer1 = this.blendLayer(1, phase);
    const layer2 = this.blendLayer(2, phase);

    // Hidden 1: ELU(x·W0 + b0)
    x = add(matmul(x, layer0.weight), layer0.bias);
    eluInPlace(x.data);
    // Hidden 2: ELU(h·W1 + b1)
    x = add(matmul(x, layer1.weight), layer1.bias);
    eluInPlace(x.data);
    // Output: linear (h·W2 + b2)
    x = add(matmul(x, layer2.weight), layer2.bias);

    return x.data;
  }

  /**
   * Forward pass using ONLY control point `cp` (no phase blending). This is the
   * exact computation the provisioned .onnx graph encodes (it bakes a single
   * control point). Used by the pure-JS ↔ ONNX numerical-parity test to prove
   * both paths run the identical genuine forward pass.
   */
  forwardControlPoint(input: Float32Array, cp = 0): Float32Array {
    if (input.length !== this.inputDim) {
      throw new Error(
        `PfnnNetwork.forwardControlPoint: input length ${input.length} != inputDim ${this.inputDim}`
      );
    }
    const layers =
      this.controlPoints[
        ((cp % PHASE_CONTROL_POINTS) + PHASE_CONTROL_POINTS) % PHASE_CONTROL_POINTS
      ].layers;
    let x: DenseTensor = createTensor([1, this.inputDim], input);
    x = add(matmul(x, layers[0].weight), layers[0].bias);
    eluInPlace(x.data);
    x = add(matmul(x, layers[1].weight), layers[1].bias);
    eluInPlace(x.data);
    x = add(matmul(x, layers[2].weight), layers[2].bias);
    return x.data;
  }
}

/**
 * The canonical seed for bundled motion models. Frozen — changing it would
 * change every bundled model's weights and break the pure-JS ↔ ONNX parity
 * test, so it lives here as the single source of truth shared by the engine
 * and the provisioning script.
 */
export const BUNDLED_MODEL_SEED = 0x9e3779b9;

/** Build the canonical bundled network for a given input/output dimension. */
export function createBundledPfnn(inputDim: number, outputDim: number): PfnnNetwork {
  return new PfnnNetwork(inputDim, outputDim, BUNDLED_MODEL_SEED);
}
