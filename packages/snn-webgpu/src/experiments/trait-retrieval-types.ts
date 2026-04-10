/**
 * @holoscript/snn-webgpu - SNN vs Backprop Fact-Retrieval Experiment Types
 *
 * Defines the data structures for comparing SNN (spike-coded associative
 * memory) against standard backpropagation (MLP) on VR trait property
 * retrieval tasks.
 *
 * The experiment uses real HoloScript trait data: given a trait name
 * (encoded as a spike pattern or float vector), retrieve its properties
 * (category, interaction mode, physics flags, etc.).
 *
 * References:
 *   - RFC-0042: @snn trait for neuromorphic compute
 *   - NIR Compiler: packages/core/src/compiler/NIRCompiler.ts
 *   - SNN-PoC: packages/snn-poc/src/cpu-reference.ts
 *
 * @version 1.0.0
 */

// =============================================================================
// TRAIT KNOWLEDGE BASE
// =============================================================================

/**
 * A single VR trait fact entry in the knowledge base.
 * Represents ground truth for fact-retrieval accuracy measurement.
 */
export interface TraitFact {
  /** Trait name (e.g., 'grabbable', 'wooden', 'lif_neuron') */
  name: string;
  /** Category index (0-9 for 10 categories) */
  categoryId: number;
  /** Category name */
  category: string;
  /** Whether this trait involves physics simulation */
  physicsEnabled: boolean;
  /** Whether this trait is interactive (user can manipulate) */
  interactive: boolean;
  /** Whether this trait is visual (affects rendering) */
  visual: boolean;
  /** Whether this trait is auditory */
  auditory: boolean;
  /** Complexity tier (0=simple, 1=moderate, 2=complex) */
  complexityTier: number;
  /** Property vector: [categoryId/10, physics, interactive, visual, auditory, complexity/2] */
  propertyVector: number[];
}

/**
 * Complete knowledge base of trait facts for the experiment.
 */
export interface TraitKnowledgeBase {
  /** All trait facts */
  facts: TraitFact[];
  /** Number of distinct categories */
  numCategories: number;
  /** Input encoding dimension (trait name -> vector) */
  inputDim: number;
  /** Output dimension (property vector length) */
  outputDim: number;
  /** Category names */
  categoryNames: string[];
}

// =============================================================================
// MODEL INTERFACES
// =============================================================================

/**
 * Common interface for both SNN and backprop models.
 */
export interface FactRetrievalModel {
  /** Model identifier */
  readonly name: string;
  /** Model type */
  readonly type: 'snn' | 'backprop';

  /**
   * Train the model on a set of trait facts.
   * @param facts - Training data
   * @param epochs - Number of training iterations
   * @returns Training metrics
   */
  train(facts: TraitFact[], epochs: number): TrainingMetrics;

  /**
   * Retrieve property vector for a given trait input.
   * @param inputVector - Encoded trait name vector
   * @returns Predicted property vector and inference metrics
   */
  retrieve(inputVector: number[]): RetrievalResult;

  /**
   * Reset model to initial state.
   */
  reset(): void;
}

/**
 * Metrics collected during training.
 */
export interface TrainingMetrics {
  /** Total training time in milliseconds */
  trainingTimeMs: number;
  /** Loss at each epoch (length = epochs) */
  lossPerEpoch: number[];
  /** Final loss value */
  finalLoss: number;
  /** Number of weight updates performed */
  totalWeightUpdates: number;
  /** Model-specific metrics */
  modelSpecific: Record<string, number>;
}

/**
 * Result of a single fact retrieval.
 */
export interface RetrievalResult {
  /** Predicted property vector */
  predictedVector: number[];
  /** Inference time in milliseconds */
  inferenceTimeMs: number;
  /** Model-specific metrics (e.g., spike count for SNN) */
  modelSpecific: Record<string, number>;
}

// =============================================================================
// EXPERIMENT CONFIGURATION
// =============================================================================

/**
 * Configuration for the SNN vs Backprop experiment.
 */
export interface ExperimentConfig {
  /** Number of training epochs */
  epochs: number;
  /** Fraction of data used for training (rest is test) */
  trainSplit: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Number of trials to average over */
  trials: number;

  /** SNN-specific configuration */
  snn: {
    /** Number of neurons per layer */
    neuronsPerLayer: number;
    /** Number of hidden layers */
    hiddenLayers: number;
    /** LIF membrane time constant (ms) */
    tau: number;
    /** Spike threshold voltage (mV) */
    vThreshold: number;
    /** Learning rate for Hebbian/STDP updates */
    learningRate: number;
    /** Number of simulation timesteps per inference */
    timestepsPerInference: number;
    /** Spike encoding time window */
    encodingTimeWindow: number;
  };

  /** Backprop-specific configuration */
  backprop: {
    /** Hidden layer sizes */
    hiddenSizes: number[];
    /** Learning rate */
    learningRate: number;
    /** Momentum */
    momentum: number;
  };
}

/**
 * Default experiment configuration.
 */
export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  epochs: 100,
  trainSplit: 0.8,
  seed: 42,
  trials: 5,

  snn: {
    neuronsPerLayer: 128,
    hiddenLayers: 1,
    tau: 20.0,
    vThreshold: 1.0,
    learningRate: 0.01,
    timestepsPerInference: 50,
    encodingTimeWindow: 50,
  },

  backprop: {
    hiddenSizes: [64, 32],
    learningRate: 0.01,
    momentum: 0.9,
  },
};

// =============================================================================
// EXPERIMENT RESULTS
// =============================================================================

/**
 * Per-model results from a single trial.
 */
export interface TrialResult {
  /** Model name */
  modelName: string;
  /** Model type */
  modelType: 'snn' | 'backprop';
  /** Trial index */
  trialIndex: number;

  /** Training metrics */
  training: TrainingMetrics;

  /** Test set accuracy (fraction of properties correctly retrieved) */
  accuracy: number;
  /** Mean Squared Error on test set */
  mse: number;
  /** Per-property accuracy breakdown */
  perPropertyAccuracy: Record<string, number>;

  /** Mean inference time per query (ms) */
  meanInferenceTimeMs: number;
  /** Total test inference time (ms) */
  totalInferenceTimeMs: number;

  /** Energy proxy: total spike count during test inference (SNN only) */
  totalSpikeCount?: number;
  /** Mean spikes per inference (SNN only) */
  meanSpikesPerInference?: number;
}

/**
 * Complete experiment results.
 */
export interface ExperimentResults {
  /** Configuration used */
  config: ExperimentConfig;
  /** Knowledge base statistics */
  knowledgeBase: {
    totalFacts: number;
    trainCount: number;
    testCount: number;
    numCategories: number;
    inputDim: number;
    outputDim: number;
  };
  /** Per-trial results for each model */
  trials: TrialResult[];
  /** Aggregated comparison */
  summary: ExperimentSummary;
  /** Timestamp */
  timestamp: string;
}

/**
 * Aggregated summary comparing SNN vs Backprop.
 */
export interface ExperimentSummary {
  /** SNN aggregate metrics (averaged over trials) */
  snn: AggregateMetrics;
  /** Backprop aggregate metrics (averaged over trials) */
  backprop: AggregateMetrics;
  /** Statistical comparison */
  comparison: {
    /** Accuracy difference (SNN - Backprop). Positive = SNN better */
    accuracyDelta: number;
    /** MSE difference (SNN - Backprop). Negative = SNN better */
    mseDelta: number;
    /** Training time ratio (SNN / Backprop). <1 = SNN faster */
    trainingTimeRatio: number;
    /** Inference time ratio (SNN / Backprop). <1 = SNN faster */
    inferenceTimeRatio: number;
    /** Energy efficiency ratio (backprop ops / SNN spikes) */
    energyEfficiencyRatio: number;
    /** Winner determination */
    winner: 'snn' | 'backprop' | 'tie';
    /** Detailed reasoning */
    analysis: string;
  };
}

/**
 * Aggregate metrics for one model type across all trials.
 */
export interface AggregateMetrics {
  /** Mean accuracy across trials */
  meanAccuracy: number;
  /** Standard deviation of accuracy */
  stdAccuracy: number;
  /** Mean MSE across trials */
  meanMSE: number;
  /** Mean training time (ms) */
  meanTrainingTimeMs: number;
  /** Mean inference time per query (ms) */
  meanInferenceTimeMs: number;
  /** Mean final loss */
  meanFinalLoss: number;
}
