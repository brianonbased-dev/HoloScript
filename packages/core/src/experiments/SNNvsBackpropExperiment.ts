/**
 * SNNvsBackpropExperiment.ts
 *
 * Experimental framework for comparing Spiking Neural Network (SNN) vs
 * Backpropagation confabulation rates per RFC-0042.
 *
 * Background (from research/2026-03-10):
 *   - Confabulation is architecturally inevitable in LLMs (W.061)
 *   - Backpropagation minimizes loss on training distribution, producing
 *     statistically plausible but factually ungrounded outputs (W.062)
 *   - Forward-Forward, Cascaded-Forward, and Mono-Forward algorithms
 *     use local learning rules and MAY reduce confabulation (W.066)
 *   - SNN with local STDP learning is biologically plausible and
 *     avoids global error propagation entirely
 *
 * This framework measures:
 *   1. Hallucination rate (confabulated vs grounded outputs)
 *   2. Confidence calibration (expected vs observed accuracy)
 *   3. Semantic coherence (output consistency score)
 *   4. Statistical significance (paired t-test, Cohen's d, CI)
 *
 * @module experiments
 * @see RFC-0042 (@snn trait)
 * @see research/2026-03-10_confabulation-volkswagen-effect-backpropagation.md
 * @version 1.0.0
 * @package @holoscript/examples
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Neuron model supported by the experiment framework.
 * LIF is the primary model per RFC-0042; Izhikevich planned for Phase 2.
 */
export type NeuronModel = 'lif' | 'izhikevich' | 'hodgkin-huxley';

/**
 * Learning rule for the SNN arm of the experiment.
 * STDP is the canonical local learning rule; backprop is the baseline.
 */
export type LearningRule = 'stdp' | 'rstdp' | 'backprop' | 'forward-forward';

/**
 * Input distribution shape for generating test stimuli.
 */
export type InputDistribution = 'uniform' | 'gaussian' | 'poisson' | 'natural-image';

/**
 * Configurable parameters for the experiment.
 */
export interface ExperimentConfig {
  /** Human-readable experiment name */
  name: string;

  /** Unique experiment ID for reproducibility tracking */
  experimentId: string;

  /** Random seed for deterministic reproduction */
  seed: number;

  // --- Network Architecture ---

  /** Number of input neurons / features */
  inputSize: number;

  /** Hidden layer sizes (array for multi-layer) */
  hiddenSizes: number[];

  /** Number of output neurons / classes */
  outputSize: number;

  /** Neuron model for SNN arm (ignored for backprop arm) */
  neuronModel: NeuronModel;

  // --- Training Parameters ---

  /** Learning rule for SNN arm */
  snnLearningRule: LearningRule;

  /** Learning rate for backprop arm */
  backpropLearningRate: number;

  /** Number of training epochs */
  epochs: number;

  /** Batch size for backprop arm (SNN processes spikes individually) */
  batchSize: number;

  // --- Stimulus Parameters ---

  /** Input distribution for test stimuli */
  inputDistribution: InputDistribution;

  /** Temperature parameter controlling output randomness (0=deterministic, 1=maximum) */
  temperature: number;

  /** Number of test trials per condition */
  trialsPerCondition: number;

  // --- SNN-specific Parameters ---

  /** Membrane time constant (ms) for LIF model */
  tauM: number;

  /** Voltage threshold (mV) for LIF model */
  vThreshold: number;

  /** Reset voltage (mV) for LIF model */
  vReset: number;

  /** Simulation timestep (ms) */
  dt: number;

  /** Simulation duration per trial (ms) */
  trialDuration: number;

  // --- Confabulation Detection ---

  /** Confidence threshold below which outputs are flagged as uncertain */
  confidenceThreshold: number;

  /** Semantic coherence threshold (0-1) below which outputs are flagged */
  coherenceThreshold: number;
}

/**
 * Single trial result from either arm of the experiment.
 */
export interface TrialResult {
  /** Trial index within the experiment */
  trialIndex: number;

  /** Which arm produced this result */
  arm: 'snn' | 'backprop';

  /** Input stimulus identifier */
  stimulusId: string;

  /** Raw output vector (probabilities or spike rates) */
  outputVector: number[];

  /** Predicted class / category */
  prediction: number;

  /** Ground truth class / category */
  groundTruth: number;

  /** Model's confidence in its prediction (0-1) */
  confidence: number;

  /** Whether the prediction was correct */
  correct: boolean;

  /** Whether this output was flagged as a confabulation */
  confabulated: boolean;

  /** Semantic coherence score for this output (0-1) */
  coherenceScore: number;

  /** Execution time for this trial (ms) */
  executionTimeMs: number;

  /** Spike count (SNN only) */
  spikeCount?: number;

  /** Mean membrane voltage at output (SNN only) */
  meanMembraneVoltage?: number;
}

/**
 * Confabulation detection metrics aggregated over all trials.
 */
export interface ConfabulationMetrics {
  /** Total number of trials */
  totalTrials: number;

  /** Number of correct predictions */
  correctPredictions: number;

  /** Number of incorrect predictions */
  incorrectPredictions: number;

  /** Overall accuracy (0-1) */
  accuracy: number;

  /** Hallucination rate: fraction of confident-but-wrong outputs */
  hallucinationRate: number;

  /** Number of high-confidence wrong answers (the core confabulation signal) */
  confabulationCount: number;

  /** Confidence calibration error (ECE): expected calibration error */
  expectedCalibrationError: number;

  /** Mean confidence on correct predictions */
  meanConfidenceCorrect: number;

  /** Mean confidence on incorrect predictions */
  meanConfidenceIncorrect: number;

  /** Mean semantic coherence score */
  meanCoherence: number;

  /** Standard deviation of coherence scores */
  stdCoherence: number;

  /** Mean execution time per trial (ms) */
  meanExecutionTimeMs: number;

  /** Confidence-accuracy bins for reliability diagram (10 bins) */
  calibrationBins: CalibrationBin[];
}

/**
 * Single bin for the confidence calibration reliability diagram.
 */
export interface CalibrationBin {
  /** Bin index (0-9, representing 0-10%, 10-20%, ..., 90-100%) */
  binIndex: number;

  /** Lower bound of confidence range */
  confidenceLower: number;

  /** Upper bound of confidence range */
  confidenceUpper: number;

  /** Mean confidence of samples in this bin */
  meanConfidence: number;

  /** Observed accuracy of samples in this bin */
  observedAccuracy: number;

  /** Number of samples in this bin */
  sampleCount: number;
}

/**
 * Statistical comparison between SNN and backprop arms.
 */
export interface StatisticalAnalysis {
  /** Paired t-test statistic for hallucination rates */
  tStatistic: number;

  /** p-value (two-tailed) */
  pValue: number;

  /** Degrees of freedom */
  degreesOfFreedom: number;

  /** Cohen's d effect size */
  cohensD: number;

  /** Effect size interpretation */
  effectSizeInterpretation: 'negligible' | 'small' | 'medium' | 'large';

  /** 95% confidence interval for the mean difference */
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };

  /** Whether the result is statistically significant at alpha=0.05 */
  significant: boolean;

  /** Which arm had lower confabulation rate */
  lowerConfabulationArm: 'snn' | 'backprop' | 'tied';

  /** Mean difference (SNN - Backprop) in hallucination rate */
  meanDifference: number;
}

/**
 * Complete experiment results, serializable to JSON.
 */
export interface ExperimentResults {
  /** Experiment configuration (for reproducibility) */
  config: ExperimentConfig;

  /** ISO timestamp when experiment started */
  startTime: string;

  /** ISO timestamp when experiment completed */
  endTime: string;

  /** Total wall-clock duration (ms) */
  totalDurationMs: number;

  /** SNN arm metrics */
  snnMetrics: ConfabulationMetrics;

  /** Backprop arm metrics */
  backpropMetrics: ConfabulationMetrics;

  /** All individual trial results */
  trials: TrialResult[];

  /** Statistical comparison */
  statisticalAnalysis: StatisticalAnalysis;

  /** Framework version */
  frameworkVersion: string;

  /** Platform info for reproducibility */
  platform: {
    runtime: string;
    arch: string;
    nodeVersion?: string;
  };
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  name: 'SNN vs Backprop Confabulation Experiment',
  experimentId: `exp_${Date.now()}`,
  seed: 42,

  inputSize: 784, // MNIST-scale
  hiddenSizes: [256, 128],
  outputSize: 10,
  neuronModel: 'lif',

  snnLearningRule: 'stdp',
  backpropLearningRate: 2e-4, // Per W.006: research-proven LR
  epochs: 2, // Per W.006: "Loss converges in 1-2 epochs"
  batchSize: 16, // Per W.007: micro-batch 8-16

  inputDistribution: 'gaussian',
  temperature: 0.7,
  trialsPerCondition: 100,

  // LIF parameters per RFC-0042
  tauM: 20.0,
  vThreshold: -55.0,
  vReset: -70.0,
  dt: 1.0,
  trialDuration: 100.0,

  confidenceThreshold: 0.8,
  coherenceThreshold: 0.5,
};

// =============================================================================
// SEEDED RANDOM NUMBER GENERATOR (Mulberry32)
// =============================================================================

/**
 * Deterministic PRNG for reproducible experiments.
 * Mulberry32: simple, fast, 32-bit state, good statistical properties.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Return a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Return a float from a Gaussian distribution (Box-Muller) */
  gaussian(mean: number = 0, stddev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stddev + mean;
  }

  /** Return a Poisson-distributed integer */
  poisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  /** Shuffle array in-place (Fisher-Yates) */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// =============================================================================
// STATISTICAL UTILITIES
// =============================================================================

/**
 * Compute mean of an array of numbers.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute standard deviation (sample, Bessel-corrected).
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Paired t-test for two arrays of paired observations.
 * Returns { tStatistic, pValue, degreesOfFreedom }.
 *
 * H0: mean difference = 0
 * H1: mean difference != 0 (two-tailed)
 */
export function pairedTTest(
  a: number[],
  b: number[]
): { tStatistic: number; pValue: number; degreesOfFreedom: number } {
  if (a.length !== b.length) {
    throw new Error('Paired t-test requires arrays of equal length');
  }
  const n = a.length;
  if (n < 2) {
    return { tStatistic: 0, pValue: 1, degreesOfFreedom: 0 };
  }

  const differences = a.map((val, i) => val - b[i]);
  const d_bar = mean(differences);
  const s_d = stddev(differences);

  if (s_d === 0) {
    return { tStatistic: 0, pValue: 1, degreesOfFreedom: n - 1 };
  }

  const tStatistic = d_bar / (s_d / Math.sqrt(n));
  const df = n - 1;

  // Approximate p-value using the t-distribution CDF (two-tailed)
  // Uses the regularized incomplete beta function approximation
  const pValue = tDistributionPValue(Math.abs(tStatistic), df);

  return { tStatistic, pValue, degreesOfFreedom: df };
}

/**
 * Approximate two-tailed p-value from the t-distribution.
 * Uses the Abramowitz and Stegun approximation for the incomplete beta function.
 */
function tDistributionPValue(t: number, df: number): number {
  // For large df, approximate with normal distribution
  if (df > 100) {
    const z = t;
    // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
    const p = 0.5 * (1 + erf(z / Math.SQRT2));
    return 2 * (1 - p);
  }

  // Beta regularized incomplete function approximation
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  // Approximate using the continued fraction (simplified)
  const betaIncomplete = incompleteBetaApprox(x, a, b);
  return betaIncomplete;
}

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26).
 * Maximum error: 1.5e-7.
 */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Simplified approximation of the regularized incomplete beta function.
 * Adequate for p-value estimation in scientific contexts.
 */
function incompleteBetaApprox(x: number, a: number, b: number): number {
  // Use Lentz's continued fraction method (simplified)
  if (x === 0 || x === 1) return x;

  // For the t-distribution case, use a series approximation
  const lnBeta =
    logGamma(a) + logGamma(b) - logGamma(a + b);
  const prefix = Math.exp(
    a * Math.log(x) + b * Math.log(1 - x) - lnBeta
  ) / a;

  // Simple series expansion (sufficient for our use case)
  let sum = 1;
  let term = 1;
  for (let n = 1; n < 200; n++) {
    term *= (n - b) * x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }

  return Math.min(1, Math.max(0, prefix * sum));
}

/**
 * Log-gamma function (Lanczos approximation).
 */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Compute Cohen's d effect size for two independent groups.
 */
export function cohensD(group1: number[], group2: number[]): number {
  const m1 = mean(group1);
  const m2 = mean(group2);
  const s1 = stddev(group1);
  const s2 = stddev(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  // Pooled standard deviation
  const sPooled = Math.sqrt(
    ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2)
  );

  if (sPooled === 0) return 0;
  return (m1 - m2) / sPooled;
}

/**
 * Interpret Cohen's d effect size.
 */
export function interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large' {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

// =============================================================================
// CONFABULATION DETECTOR
// =============================================================================

/**
 * Detects confabulation in model outputs by analyzing confidence,
 * correctness, and semantic coherence.
 */
export class ConfabulationDetector {
  private readonly confidenceThreshold: number;
  private readonly coherenceThreshold: number;

  constructor(confidenceThreshold: number = 0.8, coherenceThreshold: number = 0.5) {
    this.confidenceThreshold = confidenceThreshold;
    this.coherenceThreshold = coherenceThreshold;
  }

  /**
   * Detect whether an output is a confabulation.
   *
   * A confabulation occurs when the model is confident (above threshold)
   * but wrong. This matches the psychiatric definition: "unintentional
   * production of false statements with surface plausibility without
   * awareness of falsity" (W.064).
   */
  isConfabulation(confidence: number, correct: boolean): boolean {
    return confidence >= this.confidenceThreshold && !correct;
  }

  /**
   * Compute confidence calibration metrics.
   * Groups predictions into 10 bins by confidence level and measures
   * the gap between confidence and observed accuracy in each bin.
   */
  computeCalibrationBins(trials: TrialResult[]): CalibrationBin[] {
    const bins: CalibrationBin[] = [];
    const numBins = 10;

    for (let i = 0; i < numBins; i++) {
      const lower = i / numBins;
      const upper = (i + 1) / numBins;

      const binTrials = trials.filter(
        (t) => t.confidence >= lower && t.confidence < (i === numBins - 1 ? upper + 0.01 : upper)
      );

      const sampleCount = binTrials.length;
      const meanConf = sampleCount > 0 ? mean(binTrials.map((t) => t.confidence)) : (lower + upper) / 2;
      const accuracy = sampleCount > 0 ? binTrials.filter((t) => t.correct).length / sampleCount : 0;

      bins.push({
        binIndex: i,
        confidenceLower: lower,
        confidenceUpper: upper,
        meanConfidence: meanConf,
        observedAccuracy: accuracy,
        sampleCount,
      });
    }

    return bins;
  }

  /**
   * Compute Expected Calibration Error (ECE).
   * Weighted average of |accuracy - confidence| across bins.
   */
  computeECE(bins: CalibrationBin[], totalSamples: number): number {
    if (totalSamples === 0) return 0;

    return bins.reduce((ece, bin) => {
      const weight = bin.sampleCount / totalSamples;
      return ece + weight * Math.abs(bin.observedAccuracy - bin.meanConfidence);
    }, 0);
  }

  /**
   * Compute semantic coherence score for an output vector.
   * Measures how "peaked" the distribution is (low entropy = high coherence).
   * Normalized to [0, 1].
   */
  computeCoherence(outputVector: number[]): number {
    const sum = outputVector.reduce((s, v) => s + Math.abs(v), 0);
    if (sum === 0) return 0;

    // Normalize to probability distribution
    const probs = outputVector.map((v) => Math.abs(v) / sum);

    // Compute entropy
    const maxEntropy = Math.log(outputVector.length);
    if (maxEntropy === 0) return 1;

    const entropy = -probs.reduce((h, p) => {
      if (p > 0) return h + p * Math.log(p);
      return h;
    }, 0);

    // Coherence = 1 - normalized entropy
    return 1 - entropy / maxEntropy;
  }
}

// =============================================================================
// SIMULATED NETWORK MODELS
// =============================================================================

/**
 * Simulated LIF (Leaky Integrate-and-Fire) SNN layer.
 *
 * This is a simulation-level model for the experiment framework.
 * Real-time WebGPU execution is handled by the @snn trait compiler
 * (RFC-0042 Phase 1).
 */
export class SimulatedLIFLayer {
  private readonly size: number;
  private readonly tauM: number;
  private readonly vThreshold: number;
  private readonly vReset: number;
  private readonly dt: number;
  private voltages: Float64Array;
  private spikes: Uint8Array;
  private weights: Float64Array;
  private inputSize: number;

  constructor(
    inputSize: number,
    size: number,
    tauM: number,
    vThreshold: number,
    vReset: number,
    dt: number,
    rng: SeededRandom
  ) {
    this.inputSize = inputSize;
    this.size = size;
    this.tauM = tauM;
    this.vThreshold = vThreshold;
    this.vReset = vReset;
    this.dt = dt;
    this.voltages = new Float64Array(size).fill(vReset);
    this.spikes = new Uint8Array(size);

    // Initialize weights with Xavier initialization
    const scale = Math.sqrt(2.0 / (inputSize + size));
    this.weights = new Float64Array(inputSize * size);
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = rng.gaussian(0, scale);
    }
  }

  /**
   * Simulate one timestep of the LIF layer.
   * Returns the spike output vector.
   */
  step(input: Float64Array): Uint8Array {
    this.spikes.fill(0);

    for (let j = 0; j < this.size; j++) {
      // Compute weighted input current
      let current = 0;
      for (let i = 0; i < this.inputSize; i++) {
        current += input[i] * this.weights[i * this.size + j];
      }

      // Leaky integration: dV/dt = -(V - V_reset) / tau_m + I
      const dv = (-(this.voltages[j] - this.vReset) / this.tauM + current) * this.dt;
      this.voltages[j] += dv;

      // Spike generation
      if (this.voltages[j] >= this.vThreshold) {
        this.spikes[j] = 1;
        this.voltages[j] = this.vReset;
      }
    }

    return this.spikes;
  }

  /**
   * Apply STDP (Spike-Timing-Dependent Plasticity) learning rule.
   * Pre-before-post: potentiation (LTP). Post-before-pre: depression (LTD).
   */
  applySTDP(
    preSpikes: Float64Array | Uint8Array,
    postSpikes: Uint8Array,
    learningRate: number = 0.01,
    _tauPlus: number = 20.0,
    _tauMinus: number = 20.0,
    aPlus: number = 0.005,
    aMinus: number = 0.005
  ): void {
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.size; j++) {
        const idx = i * this.size + j;
        if (preSpikes[i] && postSpikes[j]) {
          // Coincident spikes: potentiate
          this.weights[idx] += learningRate * aPlus;
        } else if (preSpikes[i] && !postSpikes[j]) {
          // Pre without post: depress
          this.weights[idx] -= learningRate * aMinus * 0.5;
        } else if (!preSpikes[i] && postSpikes[j]) {
          // Post without pre: slight depression
          this.weights[idx] -= learningRate * aMinus * 0.25;
        }
        // Clamp weights
        this.weights[idx] = Math.max(-1, Math.min(1, this.weights[idx]));
      }
    }
  }

  /** Get current membrane voltages */
  getVoltages(): Float64Array {
    return new Float64Array(this.voltages);
  }

  /** Reset all voltages to resting potential */
  reset(): void {
    this.voltages.fill(this.vReset);
    this.spikes.fill(0);
  }

  /** Get layer size */
  getSize(): number {
    return this.size;
  }
}

/**
 * Simulated backpropagation layer (dense, feedforward).
 */
export class SimulatedBackpropLayer {
  private readonly inputSize: number;
  private readonly size: number;
  private weights: Float64Array;
  private biases: Float64Array;
  private lastInput: Float64Array | null = null;
  private lastOutput: Float64Array | null = null;
  private weightGradients: Float64Array;
  private biasGradients: Float64Array;

  constructor(inputSize: number, size: number, rng: SeededRandom) {
    this.inputSize = inputSize;
    this.size = size;

    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inputSize + size));
    this.weights = new Float64Array(inputSize * size);
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = rng.gaussian(0, scale);
    }
    this.biases = new Float64Array(size);
    this.weightGradients = new Float64Array(inputSize * size);
    this.biasGradients = new Float64Array(size);
  }

  /**
   * Forward pass with ReLU activation.
   */
  forward(input: Float64Array): Float64Array {
    this.lastInput = new Float64Array(input);
    const output = new Float64Array(this.size);

    for (let j = 0; j < this.size; j++) {
      let sum = this.biases[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights[i * this.size + j];
      }
      // ReLU activation
      output[j] = Math.max(0, sum);
    }

    this.lastOutput = new Float64Array(output);
    return output;
  }

  /**
   * Backward pass: compute gradients and return input gradient.
   */
  backward(outputGradient: Float64Array): Float64Array {
    if (!this.lastInput || !this.lastOutput) {
      throw new Error('backward() called before forward()');
    }

    const inputGradient = new Float64Array(this.inputSize);

    for (let j = 0; j < this.size; j++) {
      // ReLU derivative
      const reluGrad = this.lastOutput[j] > 0 ? 1 : 0;
      const grad = outputGradient[j] * reluGrad;

      this.biasGradients[j] += grad;

      for (let i = 0; i < this.inputSize; i++) {
        this.weightGradients[i * this.size + j] += this.lastInput[i] * grad;
        inputGradient[i] += this.weights[i * this.size + j] * grad;
      }
    }

    return inputGradient;
  }

  /**
   * Update weights with accumulated gradients.
   */
  updateWeights(learningRate: number): void {
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= learningRate * this.weightGradients[i];
      this.weightGradients[i] = 0;
    }
    for (let j = 0; j < this.size; j++) {
      this.biases[j] -= learningRate * this.biasGradients[j];
      this.biasGradients[j] = 0;
    }
  }

  /** Get layer size */
  getSize(): number {
    return this.size;
  }
}

// =============================================================================
// SOFTMAX UTILITY
// =============================================================================

/**
 * Softmax with temperature scaling.
 */
export function softmax(logits: Float64Array, temperature: number = 1.0): Float64Array {
  const scaled = new Float64Array(logits.length);
  let maxLogit = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    maxLogit = Math.max(maxLogit, logits[i]);
  }

  let sumExp = 0;
  for (let i = 0; i < logits.length; i++) {
    scaled[i] = Math.exp((logits[i] - maxLogit) / Math.max(temperature, 1e-8));
    sumExp += scaled[i];
  }

  for (let i = 0; i < logits.length; i++) {
    scaled[i] /= sumExp;
  }

  return scaled;
}

// =============================================================================
// EXPERIMENT RUNNER
// =============================================================================

/**
 * Main experiment runner that orchestrates the SNN vs Backprop comparison.
 *
 * Usage:
 * ```typescript
 * const runner = new ExperimentRunner();
 * const results = runner.run();
 * const json = runner.serialize(results);
 * ```
 */
export class ExperimentRunner {
  private readonly config: ExperimentConfig;
  private readonly rng: SeededRandom;
  private readonly detector: ConfabulationDetector;

  constructor(config: Partial<ExperimentConfig> = {}) {
    this.config = { ...DEFAULT_EXPERIMENT_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.detector = new ConfabulationDetector(
      this.config.confidenceThreshold,
      this.config.coherenceThreshold
    );
  }

  /**
   * Run the complete experiment: train both arms, evaluate, compare.
   */
  run(): ExperimentResults {
    const startTime = new Date();

    // Generate test stimuli
    const stimuli = this.generateStimuli();

    // --- SNN Arm ---
    const snnTrials = this.runSNNArm(stimuli);

    // --- Backprop Arm ---
    const backpropTrials = this.runBackpropArm(stimuli);

    // --- Compute metrics ---
    const snnMetrics = this.computeMetrics(snnTrials);
    const backpropMetrics = this.computeMetrics(backpropTrials);

    // --- Statistical comparison ---
    const statisticalAnalysis = this.compareArms(snnTrials, backpropTrials);

    const endTime = new Date();

    return {
      config: { ...this.config },
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalDurationMs: endTime.getTime() - startTime.getTime(),
      snnMetrics,
      backpropMetrics,
      trials: [...snnTrials, ...backpropTrials],
      statisticalAnalysis,
      frameworkVersion: '1.0.0',
      platform: {
        runtime: typeof process !== 'undefined' ? 'node' : 'browser',
        arch: typeof process !== 'undefined' ? process.arch : 'wasm',
        nodeVersion: typeof process !== 'undefined' ? process.version : undefined,
      },
    };
  }

  /**
   * Generate test stimuli based on configured distribution.
   */
  private generateStimuli(): Array<{ id: string; input: Float64Array; label: number }> {
    const stimuli: Array<{ id: string; input: Float64Array; label: number }> = [];

    for (let i = 0; i < this.config.trialsPerCondition; i++) {
      const input = new Float64Array(this.config.inputSize);
      const label = Math.floor(this.rng.next() * this.config.outputSize);

      switch (this.config.inputDistribution) {
        case 'uniform':
          for (let j = 0; j < this.config.inputSize; j++) {
            input[j] = this.rng.next();
          }
          break;

        case 'gaussian':
          for (let j = 0; j < this.config.inputSize; j++) {
            input[j] = this.rng.gaussian(0, 1);
          }
          break;

        case 'poisson':
          for (let j = 0; j < this.config.inputSize; j++) {
            input[j] = this.rng.poisson(5) / 10.0; // Normalize
          }
          break;

        case 'natural-image':
          // Simulate natural image statistics (pink noise approximation)
          for (let j = 0; j < this.config.inputSize; j++) {
            const freq = (j + 1) / this.config.inputSize;
            input[j] = this.rng.gaussian(0, 1.0 / Math.sqrt(freq));
          }
          break;
      }

      // Bias input slightly toward the label class for non-random learning
      const biasStart = Math.floor(label * (this.config.inputSize / this.config.outputSize));
      const biasEnd = Math.floor((label + 1) * (this.config.inputSize / this.config.outputSize));
      for (let j = biasStart; j < biasEnd && j < this.config.inputSize; j++) {
        input[j] += 0.5; // Add label-correlated signal
      }

      stimuli.push({ id: `stimulus_${i}`, input, label });
    }

    return stimuli;
  }

  /**
   * Run the SNN arm of the experiment.
   */
  private runSNNArm(
    stimuli: Array<{ id: string; input: Float64Array; label: number }>
  ): TrialResult[] {
    // Build SNN layers
    const layers: SimulatedLIFLayer[] = [];
    let prevSize = this.config.inputSize;

    for (const hiddenSize of this.config.hiddenSizes) {
      layers.push(
        new SimulatedLIFLayer(
          prevSize,
          hiddenSize,
          this.config.tauM,
          this.config.vThreshold,
          this.config.vReset,
          this.config.dt,
          this.rng
        )
      );
      prevSize = hiddenSize;
    }

    // Output layer
    layers.push(
      new SimulatedLIFLayer(
        prevSize,
        this.config.outputSize,
        this.config.tauM,
        this.config.vThreshold,
        this.config.vReset,
        this.config.dt,
        this.rng
      )
    );

    // Training phase (STDP)
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      const shuffled = this.rng.shuffle([...stimuli]);
      for (const stimulus of shuffled) {
        // Run through layers
        let currentInput: Float64Array | Uint8Array = stimulus.input;
        const layerSpikes: Uint8Array[] = [];

        for (const layer of layers) {
          layer.reset();
          // Simulate for trial duration
          let output: Uint8Array = new Uint8Array(layer.getSize());
          const timesteps = Math.floor(this.config.trialDuration / this.config.dt);
          for (let t = 0; t < timesteps; t++) {
            output = layer.step(currentInput instanceof Uint8Array
              ? new Float64Array(currentInput)
              : currentInput);
          }
          layerSpikes.push(output);
          currentInput = output;
        }

        // Apply STDP between consecutive layers
        if (this.config.snnLearningRule === 'stdp') {
          let prevSpikes: Float64Array | Uint8Array = stimulus.input;
          for (let l = 0; l < layers.length; l++) {
            layers[l].applySTDP(prevSpikes, layerSpikes[l]);
            prevSpikes = layerSpikes[l];
          }
        }
      }
    }

    // Evaluation phase
    const trials: TrialResult[] = [];

    for (let i = 0; i < stimuli.length; i++) {
      const stimulus = stimuli[i];
      const t0 = performance.now();

      // Forward pass through trained SNN
      let currentInput: Float64Array | Uint8Array = stimulus.input;
      let totalSpikes = 0;

      for (const layer of layers) {
        layer.reset();
        const timesteps = Math.floor(this.config.trialDuration / this.config.dt);
        let output: Uint8Array = new Uint8Array(layer.getSize());
        for (let t = 0; t < timesteps; t++) {
          output = layer.step(currentInput instanceof Uint8Array
            ? new Float64Array(currentInput)
            : currentInput);
          totalSpikes += output.reduce((s, v) => s + v, 0);
        }
        currentInput = output;
      }

      // Convert spike counts to output probabilities
      const outputLayer = layers[layers.length - 1];
      const voltages = outputLayer.getVoltages();
      const outputProbs = softmax(voltages, this.config.temperature);
      const outputVector = Array.from(outputProbs);

      // Determine prediction
      let maxIdx = 0;
      let maxVal = outputProbs[0];
      for (let j = 1; j < outputProbs.length; j++) {
        if (outputProbs[j] > maxVal) {
          maxVal = outputProbs[j];
          maxIdx = j;
        }
      }

      const confidence = maxVal;
      const correct = maxIdx === stimulus.label;
      const coherenceScore = this.detector.computeCoherence(outputVector);
      const confabulated = this.detector.isConfabulation(confidence, correct);

      const execTime = performance.now() - t0;

      trials.push({
        trialIndex: i,
        arm: 'snn',
        stimulusId: stimulus.id,
        outputVector,
        prediction: maxIdx,
        groundTruth: stimulus.label,
        confidence,
        correct,
        confabulated,
        coherenceScore,
        executionTimeMs: execTime,
        spikeCount: totalSpikes,
        meanMembraneVoltage: mean(Array.from(voltages)),
      });
    }

    return trials;
  }

  /**
   * Run the backprop arm of the experiment.
   */
  private runBackpropArm(
    stimuli: Array<{ id: string; input: Float64Array; label: number }>
  ): TrialResult[] {
    // Build backprop network
    const layers: SimulatedBackpropLayer[] = [];
    let prevSize = this.config.inputSize;

    for (const hiddenSize of this.config.hiddenSizes) {
      layers.push(new SimulatedBackpropLayer(prevSize, hiddenSize, this.rng));
      prevSize = hiddenSize;
    }

    // Output layer
    layers.push(new SimulatedBackpropLayer(prevSize, this.config.outputSize, this.rng));

    // Training phase (backprop with SGD)
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      const shuffled = this.rng.shuffle([...stimuli]);

      for (let batchStart = 0; batchStart < shuffled.length; batchStart += this.config.batchSize) {
        const batchEnd = Math.min(batchStart + this.config.batchSize, shuffled.length);

        for (let b = batchStart; b < batchEnd; b++) {
          const stimulus = shuffled[b];

          // Forward pass
          let currentOutput = stimulus.input;
          for (const layer of layers) {
            currentOutput = layer.forward(currentOutput);
          }

          // Softmax + cross-entropy loss gradient
          const probs = softmax(currentOutput, 1.0);
          const grad = new Float64Array(this.config.outputSize);
          for (let j = 0; j < this.config.outputSize; j++) {
            grad[j] = probs[j] - (j === stimulus.label ? 1.0 : 0.0);
          }

          // Backward pass
          let currentGrad = grad;
          for (let l = layers.length - 1; l >= 0; l--) {
            currentGrad = layers[l].backward(currentGrad) as unknown as Float64Array<ArrayBuffer>;
          }
        }

        // Update weights
        for (const layer of layers) {
          layer.updateWeights(this.config.backpropLearningRate);
        }
      }
    }

    // Evaluation phase
    const trials: TrialResult[] = [];

    for (let i = 0; i < stimuli.length; i++) {
      const stimulus = stimuli[i];
      const t0 = performance.now();

      // Forward pass through trained network
      let currentOutput = stimulus.input;
      for (const layer of layers) {
        currentOutput = layer.forward(currentOutput);
      }

      const outputProbs = softmax(currentOutput, this.config.temperature);
      const outputVector = Array.from(outputProbs);

      // Determine prediction
      let maxIdx = 0;
      let maxVal = outputProbs[0];
      for (let j = 1; j < outputProbs.length; j++) {
        if (outputProbs[j] > maxVal) {
          maxVal = outputProbs[j];
          maxIdx = j;
        }
      }

      const confidence = maxVal;
      const correct = maxIdx === stimulus.label;
      const coherenceScore = this.detector.computeCoherence(outputVector);
      const confabulated = this.detector.isConfabulation(confidence, correct);

      const execTime = performance.now() - t0;

      trials.push({
        trialIndex: i,
        arm: 'backprop',
        stimulusId: stimulus.id,
        outputVector,
        prediction: maxIdx,
        groundTruth: stimulus.label,
        confidence,
        correct,
        confabulated,
        coherenceScore,
        executionTimeMs: execTime,
      });
    }

    return trials;
  }

  /**
   * Compute aggregate confabulation metrics for a set of trials.
   */
  private computeMetrics(trials: TrialResult[]): ConfabulationMetrics {
    const totalTrials = trials.length;
    const correctPredictions = trials.filter((t) => t.correct).length;
    const incorrectPredictions = totalTrials - correctPredictions;
    const accuracy = totalTrials > 0 ? correctPredictions / totalTrials : 0;

    const confabulations = trials.filter((t) => t.confabulated);
    const confabulationCount = confabulations.length;
    const hallucinationRate = totalTrials > 0 ? confabulationCount / totalTrials : 0;

    const correctTrials = trials.filter((t) => t.correct);
    const incorrectTrials = trials.filter((t) => !t.correct);
    const meanConfidenceCorrect = mean(correctTrials.map((t) => t.confidence));
    const meanConfidenceIncorrect = mean(incorrectTrials.map((t) => t.confidence));

    const coherenceValues = trials.map((t) => t.coherenceScore);
    const meanCoherence = mean(coherenceValues);
    const stdCoherence = stddev(coherenceValues);

    const meanExecutionTimeMs = mean(trials.map((t) => t.executionTimeMs));

    const calibrationBins = this.detector.computeCalibrationBins(trials);
    const expectedCalibrationError = this.detector.computeECE(calibrationBins, totalTrials);

    return {
      totalTrials,
      correctPredictions,
      incorrectPredictions,
      accuracy,
      hallucinationRate,
      confabulationCount,
      expectedCalibrationError,
      meanConfidenceCorrect,
      meanConfidenceIncorrect,
      meanCoherence,
      stdCoherence,
      meanExecutionTimeMs,
      calibrationBins,
    };
  }

  /**
   * Compare SNN and backprop arms using statistical tests.
   */
  private compareArms(snnTrials: TrialResult[], backpropTrials: TrialResult[]): StatisticalAnalysis {
    // Per-trial confabulation indicators (0 or 1)
    const snnConfabs = snnTrials.map((t) => (t.confabulated ? 1 : 0));
    const bpConfabs = backpropTrials.map((t) => (t.confabulated ? 1 : 0));

    // Paired t-test on confabulation indicators
    const { tStatistic, pValue, degreesOfFreedom } = pairedTTest(snnConfabs, bpConfabs);

    // Effect size (Cohen's d)
    const d = cohensD(snnConfabs, bpConfabs);
    const effectSizeInterpretation = interpretEffectSize(d);

    // Mean difference
    const snnRate = mean(snnConfabs);
    const bpRate = mean(bpConfabs);
    const meanDifference = snnRate - bpRate;

    // 95% confidence interval for the mean difference
    const differences = snnConfabs.map((v, i) => v - bpConfabs[i]);
    const diffMean = mean(differences);
    const diffStd = stddev(differences);
    const n = differences.length;
    const tCritical = 1.96; // Approximate for large samples
    const marginOfError = tCritical * (diffStd / Math.sqrt(n));

    return {
      tStatistic,
      pValue,
      degreesOfFreedom,
      cohensD: d,
      effectSizeInterpretation,
      confidenceInterval: {
        lower: diffMean - marginOfError,
        upper: diffMean + marginOfError,
        level: 0.95,
      },
      significant: pValue < 0.05,
      lowerConfabulationArm:
        snnRate < bpRate ? 'snn' : snnRate > bpRate ? 'backprop' : 'tied',
      meanDifference,
    };
  }

  /**
   * Serialize experiment results to JSON string.
   */
  serialize(results: ExperimentResults): string {
    return JSON.stringify(results, null, 2);
  }

  /**
   * Deserialize experiment results from JSON string.
   */
  static deserialize(json: string): ExperimentResults {
    return JSON.parse(json) as ExperimentResults;
  }

  /**
   * Generate a human-readable summary report.
   */
  static formatReport(results: ExperimentResults): string {
    const lines: string[] = [];

    lines.push('================================================================');
    lines.push('  SNN vs BACKPROP CONFABULATION EXPERIMENT REPORT');
    lines.push('================================================================');
    lines.push('');
    lines.push(`Experiment: ${results.config.name}`);
    lines.push(`ID: ${results.config.experimentId}`);
    lines.push(`Duration: ${results.totalDurationMs.toFixed(0)}ms`);
    lines.push(`Seed: ${results.config.seed}`);
    lines.push(`Trials per condition: ${results.config.trialsPerCondition}`);
    lines.push('');

    lines.push('--- Network Architecture ---');
    lines.push(`Input: ${results.config.inputSize}`);
    lines.push(`Hidden: [${results.config.hiddenSizes.join(', ')}]`);
    lines.push(`Output: ${results.config.outputSize}`);
    lines.push(`SNN neuron model: ${results.config.neuronModel}`);
    lines.push(`SNN learning rule: ${results.config.snnLearningRule}`);
    lines.push(`Backprop LR: ${results.config.backpropLearningRate}`);
    lines.push(`Temperature: ${results.config.temperature}`);
    lines.push('');

    lines.push('--- SNN Arm Results ---');
    lines.push(`  Accuracy: ${(results.snnMetrics.accuracy * 100).toFixed(2)}%`);
    lines.push(`  Hallucination Rate: ${(results.snnMetrics.hallucinationRate * 100).toFixed(2)}%`);
    lines.push(`  Confabulation Count: ${results.snnMetrics.confabulationCount}`);
    lines.push(`  ECE: ${results.snnMetrics.expectedCalibrationError.toFixed(4)}`);
    lines.push(`  Mean Confidence (Correct): ${results.snnMetrics.meanConfidenceCorrect.toFixed(4)}`);
    lines.push(`  Mean Confidence (Incorrect): ${results.snnMetrics.meanConfidenceIncorrect.toFixed(4)}`);
    lines.push(`  Mean Coherence: ${results.snnMetrics.meanCoherence.toFixed(4)} (+/- ${results.snnMetrics.stdCoherence.toFixed(4)})`);
    lines.push(`  Mean Exec Time: ${results.snnMetrics.meanExecutionTimeMs.toFixed(2)}ms`);
    lines.push('');

    lines.push('--- Backprop Arm Results ---');
    lines.push(`  Accuracy: ${(results.backpropMetrics.accuracy * 100).toFixed(2)}%`);
    lines.push(`  Hallucination Rate: ${(results.backpropMetrics.hallucinationRate * 100).toFixed(2)}%`);
    lines.push(`  Confabulation Count: ${results.backpropMetrics.confabulationCount}`);
    lines.push(`  ECE: ${results.backpropMetrics.expectedCalibrationError.toFixed(4)}`);
    lines.push(`  Mean Confidence (Correct): ${results.backpropMetrics.meanConfidenceCorrect.toFixed(4)}`);
    lines.push(`  Mean Confidence (Incorrect): ${results.backpropMetrics.meanConfidenceIncorrect.toFixed(4)}`);
    lines.push(`  Mean Coherence: ${results.backpropMetrics.meanCoherence.toFixed(4)} (+/- ${results.backpropMetrics.stdCoherence.toFixed(4)})`);
    lines.push(`  Mean Exec Time: ${results.backpropMetrics.meanExecutionTimeMs.toFixed(2)}ms`);
    lines.push('');

    lines.push('--- Statistical Comparison ---');
    lines.push(`  Paired t-test: t(${results.statisticalAnalysis.degreesOfFreedom}) = ${results.statisticalAnalysis.tStatistic.toFixed(4)}`);
    lines.push(`  p-value: ${results.statisticalAnalysis.pValue.toFixed(6)}`);
    lines.push(`  Significant (alpha=0.05): ${results.statisticalAnalysis.significant ? 'YES' : 'NO'}`);
    lines.push(`  Cohen's d: ${results.statisticalAnalysis.cohensD.toFixed(4)} (${results.statisticalAnalysis.effectSizeInterpretation})`);
    lines.push(`  95% CI: [${results.statisticalAnalysis.confidenceInterval.lower.toFixed(4)}, ${results.statisticalAnalysis.confidenceInterval.upper.toFixed(4)}]`);
    lines.push(`  Mean Difference (SNN - BP): ${results.statisticalAnalysis.meanDifference.toFixed(4)}`);
    lines.push(`  Lower Confabulation Arm: ${results.statisticalAnalysis.lowerConfabulationArm.toUpperCase()}`);
    lines.push('');

    lines.push('================================================================');

    return lines.join('\n');
  }
}
