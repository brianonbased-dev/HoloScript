/**
 * @holoscript/snn-webgpu - SNN vs Backprop Fact-Retrieval Experiment
 *
 * Compares spiking neural network (LIF + Hebbian) against standard
 * backpropagation (MLP + SGD) for VR trait property retrieval tasks.
 *
 * Uses real HoloScript trait data (130+ traits across 10 categories)
 * and the same LIF neuron model from @holoscript/snn-poc RFC-0042.
 *
 * @example
 * ```ts
 * import { runExperiment, formatExperimentReport } from '@holoscript/snn-webgpu/experiments';
 *
 * const results = runExperiment({ epochs: 50, trials: 3 });
 * console.log(formatExperimentReport(results));
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  TraitFact,
  TraitKnowledgeBase,
  FactRetrievalModel,
  TrainingMetrics,
  RetrievalResult,
  ExperimentConfig,
  TrialResult,
  ExperimentResults,
  ExperimentSummary,
  AggregateMetrics,
} from './trait-retrieval-types.js';

export { DEFAULT_EXPERIMENT_CONFIG } from './trait-retrieval-types.js';

// Knowledge base
export {
  buildTraitKnowledgeBase,
  encodeTraitOneHot,
  encodeTraitDense,
  splitTrainTest,
  computePropertyAccuracy,
  computeMSE,
} from './trait-knowledge-base.js';

// Models
export { SNNRetrievalModel } from './snn-retrieval-model.js';
export { BackpropRetrievalModel } from './backprop-retrieval-model.js';

// Experiment runner
export { runExperiment, formatExperimentReport } from './experiment-runner.js';
