/**
 * @holoscript/snn-webgpu - Prophetic GI training helpers
 *
 * Phase 2.b turns the LocalProphecyTransport spike-rate seam into a
 * trainable, serializable rate-decoder. The model is intentionally
 * small: one logistic readout per probe over stable scene/probe
 * features. It is a practical offline training bridge for the current
 * LIF/WGSL pipeline and can be replaced by a deeper SNN while keeping
 * the same SpikeRateProvider contract.
 */

import type { ProphecySceneContext } from './types.js';
import type { SpikeRateProvider } from './transport-local.js';

export const PROPHECY_SPIKE_FEATURE_COUNT = 9;

export interface ProphecyTrainingSample {
  /** Scene context observed for this training frame. */
  scene: ProphecySceneContext;
  /** Target per-probe firing rates in [0, 1]. Length must equal probeCount. */
  targetSpikeRates: Float32Array;
  /** Optional sample weight for imbalanced corpora. Defaults to 1. */
  weight?: number;
}

export interface ProphecyTrainingOptions {
  /** Number of probes in every training target. */
  probeCount: number;
  /** Probe positions packed xyz. Length must equal probeCount * 3. */
  probePositions: Float32Array;
  /** Number of offline passes over the corpus. Defaults to 32. */
  epochs?: number;
  /** Logistic readout learning rate. Defaults to 0.08. */
  learningRate?: number;
  /** L2 regularization strength. Defaults to 0.0001. */
  l2?: number;
}

export interface TrainedProphecySpikeModel {
  readonly kind: 'prophetic-gi-spike-rate-model';
  readonly version: 1;
  readonly probeCount: number;
  readonly featureCount: typeof PROPHECY_SPIKE_FEATURE_COUNT;
  readonly probePositions: Float32Array;
  readonly weights: Float32Array;
  readonly bias: Float32Array;
  readonly training: {
    readonly epochs: number;
    readonly learningRate: number;
    readonly l2: number;
    readonly sampleCount: number;
    readonly initialLoss: number;
    readonly finalLoss: number;
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sigmoid(value: number): number {
  if (value <= -30) return 0;
  if (value >= 30) return 1;
  return 1 / (1 + Math.exp(-value));
}

function vectorLength3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function writeFeatureVector(
  out: Float32Array,
  scene: ProphecySceneContext,
  probePositions: Float32Array,
  probeIndex: number
): void {
  const px = probePositions[probeIndex * 3 + 0];
  const py = probePositions[probeIndex * 3 + 1];
  const pz = probePositions[probeIndex * 3 + 2];
  const dx = px - scene.cameraPosition[0];
  const dy = py - scene.cameraPosition[1];
  const dz = pz - scene.cameraPosition[2];
  const distance = vectorLength3(dx, dy, dz);
  const invDistance = 1 / (1 + distance);
  const dirScale = distance > 0 ? 1 / distance : 0;
  const forwardDot =
    (dx * dirScale * scene.cameraForward[0] +
      dy * dirScale * scene.cameraForward[1] +
      dz * dirScale * scene.cameraForward[2] +
      1) *
    0.5;
  const sunAlignment =
    (scene.sunDirection[0] * dx * dirScale +
      scene.sunDirection[1] * dy * dirScale +
      scene.sunDirection[2] * dz * dirScale +
      1) *
    0.5;
  const sunLuminance =
    scene.sunColor[0] * 0.2126 + scene.sunColor[1] * 0.7152 + scene.sunColor[2] * 0.0722;

  out[0] = invDistance;
  out[1] = clamp01(forwardDot);
  out[2] = clamp01((py + 4) / 8);
  out[3] = clamp01((scene.sunDirection[1] + 1) * 0.5);
  out[4] = clamp01(sunAlignment);
  out[5] = clamp01(scene.sunColor[0]);
  out[6] = clamp01(scene.sunColor[1]);
  out[7] = clamp01(scene.sunColor[2]);
  out[8] = clamp01(scene.prevAvgLuminance ?? sunLuminance);
}

export function encodeProphecySceneProbeFeatures(
  scene: ProphecySceneContext,
  probePositions: Float32Array,
  probeIndex: number
): Float32Array {
  const features = new Float32Array(PROPHECY_SPIKE_FEATURE_COUNT);
  writeFeatureVector(features, scene, probePositions, probeIndex);
  return features;
}

function assertTrainingShape(
  samples: readonly ProphecyTrainingSample[],
  options: ProphecyTrainingOptions
): void {
  if (!Number.isInteger(options.probeCount) || options.probeCount <= 0) {
    throw new Error(
      `trainProphecySpikeRateModel: probeCount must be positive, got ${options.probeCount}`
    );
  }
  if (options.probePositions.length !== options.probeCount * 3) {
    throw new Error(
      `trainProphecySpikeRateModel: probePositions length ${options.probePositions.length} ` +
        `does not match probeCount*3 (${options.probeCount * 3})`
    );
  }
  if (samples.length === 0) {
    throw new Error('trainProphecySpikeRateModel: at least one training sample is required');
  }
  for (const sample of samples) {
    if (sample.targetSpikeRates.length !== options.probeCount) {
      throw new Error(
        `trainProphecySpikeRateModel: targetSpikeRates length ${sample.targetSpikeRates.length} ` +
          `does not match probeCount ${options.probeCount}`
      );
    }
  }
}

function modelLoss(
  model: Pick<TrainedProphecySpikeModel, 'probeCount' | 'probePositions' | 'weights' | 'bias'>,
  samples: readonly ProphecyTrainingSample[]
): number {
  const features = new Float32Array(PROPHECY_SPIKE_FEATURE_COUNT);
  let loss = 0;
  let count = 0;
  for (const sample of samples) {
    const sampleWeight = sample.weight ?? 1;
    for (let probe = 0; probe < model.probeCount; probe++) {
      writeFeatureVector(features, sample.scene, model.probePositions, probe);
      let z = model.bias[probe];
      const offset = probe * PROPHECY_SPIKE_FEATURE_COUNT;
      for (let i = 0; i < PROPHECY_SPIKE_FEATURE_COUNT; i++) {
        z += model.weights[offset + i] * features[i];
      }
      const err = clamp01(sample.targetSpikeRates[probe]) - sigmoid(z);
      loss += err * err * sampleWeight;
      count += sampleWeight;
    }
  }
  return count > 0 ? loss / count : 0;
}

export function trainProphecySpikeRateModel(
  samples: readonly ProphecyTrainingSample[],
  options: ProphecyTrainingOptions
): TrainedProphecySpikeModel {
  assertTrainingShape(samples, options);

  const epochs = options.epochs ?? 32;
  const learningRate = options.learningRate ?? 0.08;
  const l2 = options.l2 ?? 0.0001;
  const weights = new Float32Array(options.probeCount * PROPHECY_SPIKE_FEATURE_COUNT);
  const bias = new Float32Array(options.probeCount);
  const probePositions = new Float32Array(options.probePositions);
  const features = new Float32Array(PROPHECY_SPIKE_FEATURE_COUNT);

  const modelBase = { probeCount: options.probeCount, probePositions, weights, bias };
  const initialLoss = modelLoss(modelBase, samples);

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const sample of samples) {
      const sampleWeight = sample.weight ?? 1;
      for (let probe = 0; probe < options.probeCount; probe++) {
        writeFeatureVector(features, sample.scene, probePositions, probe);
        const offset = probe * PROPHECY_SPIKE_FEATURE_COUNT;
        let z = bias[probe];
        for (let i = 0; i < PROPHECY_SPIKE_FEATURE_COUNT; i++) {
          z += weights[offset + i] * features[i];
        }
        const prediction = sigmoid(z);
        const target = clamp01(sample.targetSpikeRates[probe]);
        const grad = (target - prediction) * prediction * (1 - prediction) * sampleWeight;
        for (let i = 0; i < PROPHECY_SPIKE_FEATURE_COUNT; i++) {
          const wi = offset + i;
          weights[wi] += learningRate * (grad * features[i] - l2 * weights[wi]);
        }
        bias[probe] += learningRate * grad;
      }
    }
  }

  const finalLoss = modelLoss(modelBase, samples);
  return {
    kind: 'prophetic-gi-spike-rate-model',
    version: 1,
    probeCount: options.probeCount,
    featureCount: PROPHECY_SPIKE_FEATURE_COUNT,
    probePositions,
    weights,
    bias,
    training: {
      epochs,
      learningRate,
      l2,
      sampleCount: samples.length,
      initialLoss,
      finalLoss,
    },
  };
}

export function decodeProphecySpikeRates(
  model: TrainedProphecySpikeModel,
  scene: ProphecySceneContext,
  probeCount: number = model.probeCount
): Float32Array {
  if (probeCount !== model.probeCount) {
    throw new Error(
      `decodeProphecySpikeRates: provider asked for ${probeCount} probes, model has ${model.probeCount}`
    );
  }
  const features = new Float32Array(PROPHECY_SPIKE_FEATURE_COUNT);
  const out = new Float32Array(model.probeCount);
  for (let probe = 0; probe < model.probeCount; probe++) {
    writeFeatureVector(features, scene, model.probePositions, probe);
    const offset = probe * PROPHECY_SPIKE_FEATURE_COUNT;
    let z = model.bias[probe];
    for (let i = 0; i < PROPHECY_SPIKE_FEATURE_COUNT; i++) {
      z += model.weights[offset + i] * features[i];
    }
    out[probe] = clamp01(sigmoid(z));
  }
  return out;
}

export function decodeSpikeRateWindow(
  spikeWindow: Float32Array,
  probeCount: number,
  timeWindow: number
): Float32Array {
  if (!Number.isInteger(probeCount) || probeCount <= 0) {
    throw new Error(`decodeSpikeRateWindow: probeCount must be positive, got ${probeCount}`);
  }
  if (!Number.isInteger(timeWindow) || timeWindow <= 0) {
    throw new Error(`decodeSpikeRateWindow: timeWindow must be positive, got ${timeWindow}`);
  }
  if (spikeWindow.length !== probeCount * timeWindow) {
    throw new Error(
      `decodeSpikeRateWindow: spike window length ${spikeWindow.length} ` +
        `does not match probeCount*timeWindow (${probeCount * timeWindow})`
    );
  }
  const out = new Float32Array(probeCount);
  for (let probe = 0; probe < probeCount; probe++) {
    let spikes = 0;
    const offset = probe * timeWindow;
    for (let t = 0; t < timeWindow; t++) {
      if (spikeWindow[offset + t] > 0.5) spikes++;
    }
    out[probe] = spikes / timeWindow;
  }
  return out;
}

export function createTrainedSpikeRateProvider(
  model: TrainedProphecySpikeModel
): SpikeRateProvider {
  return (scene, probeCount) => decodeProphecySpikeRates(model, scene, probeCount);
}
