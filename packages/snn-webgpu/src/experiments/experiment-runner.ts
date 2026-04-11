/**
 * @holoscript/snn-webgpu - SNN vs Backprop Experiment Runner
 *
 * Orchestrates the full experiment:
 *   1. Build trait knowledge base from HoloScript trait data
 *   2. Split into train/test sets
 *   3. Train both SNN and backprop models
 *   4. Evaluate on test set
 *   5. Collect and compare metrics
 *   6. Generate summary report
 *
 * Designed to run as pure CPU-side TypeScript (no WebGPU required).
 * The SNN model uses the same LIF neuron mathematics as the
 * @holoscript/snn-poc CPU reference simulator.
 *
 * For WebGPU-accelerated SNN, use the holo_compile_nir MCP tool
 * to target neuromorphic hardware (Loihi 2, SpiNNaker 2, etc.).
 *
 * @version 1.0.0
 */

import type {
  ExperimentConfig,
  ExperimentResults,
  ExperimentSummary,
  TrialResult,
  AggregateMetrics,
  TraitFact,
} from './trait-retrieval-types.js';
import { DEFAULT_EXPERIMENT_CONFIG } from './trait-retrieval-types.js';
import {
  buildTraitKnowledgeBase,
  splitTrainTest,
  computePropertyAccuracy,
  computeMSE,
  _encodeTraitDense,
} from './trait-knowledge-base.js';
import { SNNRetrievalModel } from './snn-retrieval-model.js';
import { BackpropRetrievalModel } from './backprop-retrieval-model.js';

// =============================================================================
// EXPERIMENT RUNNER
// =============================================================================

/**
 * Run the complete SNN vs Backprop fact-retrieval experiment.
 *
 * @param config - Experiment configuration (defaults used if not provided)
 * @returns Complete experiment results with summary comparison
 */
export function runExperiment(config: Partial<ExperimentConfig> = {}): ExperimentResults {
  const cfg: ExperimentConfig = {
    ...DEFAULT_EXPERIMENT_CONFIG,
    ...config,
    snn: { ...DEFAULT_EXPERIMENT_CONFIG.snn, ...config.snn },
    backprop: { ...DEFAULT_EXPERIMENT_CONFIG.backprop, ...config.backprop },
  };

  // Step 1: Build knowledge base
  const kb = buildTraitKnowledgeBase();
  const traitNames = kb.facts.map((f) => f.name);
  const inputDim = Math.min(kb.facts.length, 64); // dense encoding

  // Step 2: Run trials
  const allTrials: TrialResult[] = [];

  for (let trial = 0; trial < cfg.trials; trial++) {
    const trialSeed = cfg.seed + trial * 1000;

    // Split data
    const { train, test } = splitTrainTest(kb, cfg.trainSplit, trialSeed);

    // --- SNN Trial ---
    const snnModel = new SNNRetrievalModel(cfg.snn, kb.facts.length, traitNames);
    const snnTrialResult = runTrial(
      snnModel,
      train,
      test,
      cfg.epochs,
      trial,
      kb.facts.length,
      inputDim
    );
    allTrials.push(snnTrialResult);

    // --- Backprop Trial ---
    const backpropModel = new BackpropRetrievalModel(cfg.backprop, kb.facts.length, traitNames);
    const backpropTrialResult = runTrial(
      backpropModel,
      train,
      test,
      cfg.epochs,
      trial,
      kb.facts.length,
      inputDim
    );
    allTrials.push(backpropTrialResult);
  }

  // Step 3: Aggregate results
  const snnTrials = allTrials.filter((t) => t.modelType === 'snn');
  const backpropTrials = allTrials.filter((t) => t.modelType === 'backprop');

  const snnAggregate = computeAggregate(snnTrials);
  const backpropAggregate = computeAggregate(backpropTrials);

  const summary = buildSummary(snnAggregate, backpropAggregate, snnTrials);

  return {
    config: cfg,
    knowledgeBase: {
      totalFacts: kb.facts.length,
      trainCount: Math.floor(kb.facts.length * cfg.trainSplit),
      testCount: kb.facts.length - Math.floor(kb.facts.length * cfg.trainSplit),
      numCategories: kb.numCategories,
      inputDim,
      outputDim: kb.outputDim,
    },
    trials: allTrials,
    summary,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// TRIAL EXECUTION
// =============================================================================

interface ModelWithGetInput {
  getInputVector(name: string): number[];
}

function runTrial(
  model: SNNRetrievalModel | BackpropRetrievalModel,
  trainFacts: TraitFact[],
  testFacts: TraitFact[],
  epochs: number,
  trialIndex: number,
  _totalTraits: number,
  _inputDim: number
): TrialResult {
  // Train
  const training = model.train(trainFacts, epochs);

  // Evaluate on test set
  let totalAccuracy = 0;
  let totalMSE = 0;
  let totalInferenceTimeMs = 0;
  let totalSpikeCount = 0;
  const perPropertyCorrect = new Array(6).fill(0);
  const perPropertyTotal = new Array(6).fill(0);

  for (const fact of testFacts) {
    const inputVec = (model as unknown as ModelWithGetInput).getInputVector(fact.name);
    const result = model.retrieve(inputVec);

    const accuracy = computePropertyAccuracy(result.predictedVector, fact.propertyVector);
    const mse = computeMSE(result.predictedVector, fact.propertyVector);

    totalAccuracy += accuracy;
    totalMSE += mse;
    totalInferenceTimeMs += result.inferenceTimeMs;

    if (result.modelSpecific.totalSpikes !== undefined) {
      totalSpikeCount += result.modelSpecific.totalSpikes;
    }

    // Per-property accuracy
    for (let p = 0; p < 6; p++) {
      perPropertyTotal[p]++;
      if (p >= 1 && p <= 4) {
        // Boolean
        const predBool = result.predictedVector[p] >= 0.5;
        const actualBool = fact.propertyVector[p] >= 0.5;
        if (predBool === actualBool) perPropertyCorrect[p]++;
      } else {
        // Continuous
        if (Math.abs(result.predictedVector[p] - fact.propertyVector[p]) <= 0.15) {
          perPropertyCorrect[p]++;
        }
      }
    }
  }

  const testCount = testFacts.length;
  const propertyNames = ['category', 'physics', 'interactive', 'visual', 'auditory', 'complexity'];
  const perPropertyAccuracy: Record<string, number> = {};
  for (let p = 0; p < 6; p++) {
    perPropertyAccuracy[propertyNames[p]] = perPropertyCorrect[p] / perPropertyTotal[p];
  }

  const trialResult: TrialResult = {
    modelName: model.name,
    modelType: model.type,
    trialIndex,
    training,
    accuracy: totalAccuracy / testCount,
    mse: totalMSE / testCount,
    perPropertyAccuracy,
    meanInferenceTimeMs: totalInferenceTimeMs / testCount,
    totalInferenceTimeMs,
  };

  if (model.type === 'snn') {
    trialResult.totalSpikeCount = totalSpikeCount;
    trialResult.meanSpikesPerInference = totalSpikeCount / testCount;
  }

  return trialResult;
}

// =============================================================================
// AGGREGATION
// =============================================================================

function computeAggregate(trials: TrialResult[]): AggregateMetrics {
  if (trials.length === 0) {
    return {
      meanAccuracy: 0,
      stdAccuracy: 0,
      meanMSE: 0,
      meanTrainingTimeMs: 0,
      meanInferenceTimeMs: 0,
      meanFinalLoss: 0,
    };
  }

  const accuracies = trials.map((t) => t.accuracy);
  const mses = trials.map((t) => t.mse);
  const trainTimes = trials.map((t) => t.training.trainingTimeMs);
  const infTimes = trials.map((t) => t.meanInferenceTimeMs);
  const losses = trials.map((t) => t.training.finalLoss);

  const meanAcc = mean(accuracies);
  const stdAcc = std(accuracies, meanAcc);

  return {
    meanAccuracy: meanAcc,
    stdAccuracy: stdAcc,
    meanMSE: mean(mses),
    meanTrainingTimeMs: mean(trainTimes),
    meanInferenceTimeMs: mean(infTimes),
    meanFinalLoss: mean(losses),
  };
}

function buildSummary(
  snn: AggregateMetrics,
  backprop: AggregateMetrics,
  snnTrials: TrialResult[]
): ExperimentSummary {
  const accuracyDelta = snn.meanAccuracy - backprop.meanAccuracy;
  const mseDelta = snn.meanMSE - backprop.meanMSE;
  const trainingTimeRatio =
    backprop.meanTrainingTimeMs > 0 ? snn.meanTrainingTimeMs / backprop.meanTrainingTimeMs : 0;
  const inferenceTimeRatio =
    backprop.meanInferenceTimeMs > 0 ? snn.meanInferenceTimeMs / backprop.meanInferenceTimeMs : 0;

  // Energy efficiency: compare backprop MAC ops vs SNN spikes
  const meanSNNSpikes =
    snnTrials.length > 0 ? mean(snnTrials.map((t) => t.meanSpikesPerInference ?? 0)) : 0;

  // Rough energy ratio: 1 MAC ~ 4.6pJ, 1 spike ~ 0.9pJ (Loihi 2 data)
  // So energy efficiency = (backprop_ops * 4.6) / (snn_spikes * 0.9)
  const backpropOpsPerInference =
    snnTrials.length > 0
      ? 64 * 64 + 64 * 32 + 32 * 6 // input*h1 + h1*h2 + h2*output
      : 0;
  const energyEfficiencyRatio =
    meanSNNSpikes > 0 ? (backpropOpsPerInference * 4.6) / (meanSNNSpikes * 0.9) : 0;

  // Determine winner
  let winner: 'snn' | 'backprop' | 'tie';
  if (Math.abs(accuracyDelta) < 0.02) {
    // Within 2% accuracy - compare energy and speed
    winner = energyEfficiencyRatio > 1.0 ? 'snn' : 'backprop';
  } else {
    winner = accuracyDelta > 0 ? 'snn' : 'backprop';
  }

  // Build analysis
  const analysisLines: string[] = [];
  analysisLines.push(
    `SNN Accuracy: ${(snn.meanAccuracy * 100).toFixed(1)}% +/- ${(snn.stdAccuracy * 100).toFixed(1)}%`
  );
  analysisLines.push(
    `Backprop Accuracy: ${(backprop.meanAccuracy * 100).toFixed(1)}% +/- ${(backprop.stdAccuracy * 100).toFixed(1)}%`
  );
  analysisLines.push(
    `Accuracy Delta: ${(accuracyDelta * 100).toFixed(1)}% (${accuracyDelta > 0 ? 'SNN better' : 'Backprop better'})`
  );
  analysisLines.push(`MSE: SNN=${snn.meanMSE.toFixed(4)}, Backprop=${backprop.meanMSE.toFixed(4)}`);
  analysisLines.push(
    `Training Time: SNN=${snn.meanTrainingTimeMs.toFixed(1)}ms, Backprop=${backprop.meanTrainingTimeMs.toFixed(1)}ms (ratio: ${trainingTimeRatio.toFixed(2)}x)`
  );
  analysisLines.push(
    `Inference Time: SNN=${snn.meanInferenceTimeMs.toFixed(3)}ms, Backprop=${backprop.meanInferenceTimeMs.toFixed(3)}ms (ratio: ${inferenceTimeRatio.toFixed(2)}x)`
  );
  analysisLines.push(
    `Energy Proxy: SNN uses ${meanSNNSpikes.toFixed(0)} spikes/query vs ${backpropOpsPerInference} MACs/query`
  );
  analysisLines.push(
    `Estimated Energy Ratio: ${energyEfficiencyRatio.toFixed(2)}x (>1 = SNN more efficient on neuromorphic HW)`
  );
  analysisLines.push(`Winner: ${winner.toUpperCase()}`);

  return {
    snn,
    backprop,
    comparison: {
      accuracyDelta,
      mseDelta,
      trainingTimeRatio,
      inferenceTimeRatio,
      energyEfficiencyRatio,
      winner,
      analysis: analysisLines.join('\n'),
    },
  };
}

// =============================================================================
// UTILITY
// =============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[], meanVal?: number): number {
  if (values.length <= 1) return 0;
  const m = meanVal ?? mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Format experiment results as a human-readable report.
 */
export function formatExperimentReport(results: ExperimentResults): string {
  const lines: string[] = [];
  const hr = '='.repeat(72);
  const hr2 = '-'.repeat(72);

  lines.push(hr);
  lines.push('  SNN vs BACKPROP FACT-RETRIEVAL EXPERIMENT REPORT');
  lines.push('  VR Trait Property Retrieval Benchmark');
  lines.push(hr);
  lines.push('');

  // Configuration
  lines.push('CONFIGURATION:');
  lines.push(`  Epochs: ${results.config.epochs}`);
  lines.push(`  Trials: ${results.config.trials}`);
  lines.push(
    `  Train/Test Split: ${(results.config.trainSplit * 100).toFixed(0)}/${((1 - results.config.trainSplit) * 100).toFixed(0)}`
  );
  lines.push(`  Seed: ${results.config.seed}`);
  lines.push('');

  // Knowledge Base
  lines.push('KNOWLEDGE BASE:');
  lines.push(`  Total Traits: ${results.knowledgeBase.totalFacts}`);
  lines.push(`  Categories: ${results.knowledgeBase.numCategories}`);
  lines.push(`  Train Set: ${results.knowledgeBase.trainCount}`);
  lines.push(`  Test Set: ${results.knowledgeBase.testCount}`);
  lines.push(`  Input Dim: ${results.knowledgeBase.inputDim}`);
  lines.push(`  Output Dim: ${results.knowledgeBase.outputDim}`);
  lines.push('');

  // SNN Config
  lines.push('SNN MODEL:');
  lines.push(`  Architecture: LIF Neurons with Hebbian Learning`);
  lines.push(`  Hidden Neurons: ${results.config.snn.neuronsPerLayer}`);
  lines.push(`  Tau (membrane): ${results.config.snn.tau}ms`);
  lines.push(`  Threshold: ${results.config.snn.vThreshold}`);
  lines.push(`  Timesteps/Inference: ${results.config.snn.timestepsPerInference}`);
  lines.push(`  Learning Rate: ${results.config.snn.learningRate}`);
  lines.push('');

  // Backprop Config
  lines.push('BACKPROP MODEL:');
  lines.push(`  Architecture: MLP with Sigmoid`);
  lines.push(`  Hidden Layers: [${results.config.backprop.hiddenSizes.join(', ')}]`);
  lines.push(`  Learning Rate: ${results.config.backprop.learningRate}`);
  lines.push(`  Momentum: ${results.config.backprop.momentum}`);
  lines.push('');

  lines.push(hr);
  lines.push('RESULTS SUMMARY');
  lines.push(hr);
  lines.push('');

  lines.push(results.summary.comparison.analysis);
  lines.push('');

  // Per-trial details
  lines.push(hr2);
  lines.push('PER-TRIAL BREAKDOWN:');
  lines.push(hr2);

  for (const trial of results.trials) {
    lines.push(`  [Trial ${trial.trialIndex}] ${trial.modelName}:`);
    lines.push(`    Accuracy: ${(trial.accuracy * 100).toFixed(1)}%`);
    lines.push(`    MSE: ${trial.mse.toFixed(4)}`);
    lines.push(`    Training: ${trial.training.trainingTimeMs.toFixed(1)}ms`);
    lines.push(`    Inference: ${trial.meanInferenceTimeMs.toFixed(3)}ms/query`);
    if (trial.totalSpikeCount !== undefined) {
      lines.push(`    Spikes: ${trial.meanSpikesPerInference?.toFixed(0)}/query`);
    }
    lines.push(
      `    Per-property: ${Object.entries(trial.perPropertyAccuracy)
        .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
        .join(', ')}`
    );
    lines.push('');
  }

  lines.push(hr);
  lines.push(`Report generated: ${results.timestamp}`);
  lines.push(`NIR Target: holo_compile_nir (Loihi 2, SpiNNaker 2, SynSense)`);
  lines.push(hr);

  return lines.join('\n');
}
