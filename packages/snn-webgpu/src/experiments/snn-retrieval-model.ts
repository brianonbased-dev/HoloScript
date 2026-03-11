/**
 * @holoscript/snn-webgpu - SNN Fact-Retrieval Model
 *
 * Implements a spike-coded associative memory for VR trait property retrieval.
 * Uses Leaky Integrate-and-Fire (LIF) neurons with Hebbian/STDP learning.
 *
 * Architecture:
 *   Input Layer (N neurons, one per trait - rate coded)
 *       |
 *   Hidden Layer (M LIF neurons with lateral inhibition)
 *       |
 *   Output Layer (6 neurons, one per property)
 *
 * Learning: Modified Hebbian rule where weights are updated based on
 * pre/post spike correlation within a time window (simplified STDP).
 *
 * Inference: Present input as spike train over T timesteps, decode
 * output layer membrane potential as property values.
 *
 * @version 1.0.0
 */

import type {
  FactRetrievalModel,
  TraitFact,
  TrainingMetrics,
  RetrievalResult,
  ExperimentConfig,
} from './trait-retrieval-types.js';
import { encodeTraitDense } from './trait-knowledge-base.js';

// =============================================================================
// LIF NEURON (CPU-SIDE, MATCHING SNN-POC)
// =============================================================================

interface LIFNeuron {
  voltage: number;
  refractory: number;
  spiked: boolean;
  lastSpikeTime: number;
}

function createLIFNeuron(vRest: number): LIFNeuron {
  return { voltage: vRest, refractory: 0, spiked: false, lastSpikeTime: -Infinity };
}

function stepLIFNeuron(
  neuron: LIFNeuron,
  input: number,
  tau: number,
  vThreshold: number,
  vReset: number,
  vRest: number,
  dt: number,
  currentTime: number,
): boolean {
  if (neuron.refractory > 0) {
    neuron.refractory = Math.max(neuron.refractory - dt, 0);
    neuron.voltage = vReset;
    neuron.spiked = false;
    return false;
  }

  // Leaky integration: V += ((vRest - V) / tau + I) * dt
  const dv = ((vRest - neuron.voltage) / tau + input) * dt;
  neuron.voltage += dv;

  // Spike detection
  if (neuron.voltage >= vThreshold) {
    neuron.spiked = true;
    neuron.lastSpikeTime = currentTime;
    neuron.voltage = vReset;
    neuron.refractory = 2.0; // 2ms refractory
    return true;
  }

  neuron.spiked = false;
  return false;
}

// =============================================================================
// SNN FACT-RETRIEVAL MODEL
// =============================================================================

export class SNNRetrievalModel implements FactRetrievalModel {
  readonly name = 'SNN-LIF-Hebbian';
  readonly type = 'snn' as const;

  private config: ExperimentConfig['snn'];
  private inputDim: number;
  private hiddenSize: number;
  private outputDim: number = 6;

  // Network weights
  private weightsInputHidden: Float32Array;
  private weightsHiddenOutput: Float32Array;

  // Neuron populations
  private hiddenNeurons: LIFNeuron[];
  private outputNeurons: LIFNeuron[];

  // Spike history for STDP
  private hiddenSpikeHistory: Float32Array;
  private outputSpikeHistory: Float32Array;

  // Running spike counts for metrics
  private totalSpikeCount: number = 0;

  // Trait index mapping for dense encoding
  private traitNameToIndex: Map<string, number>;

  constructor(
    config: ExperimentConfig['snn'],
    inputDim: number,
    traitNames: string[],
  ) {
    this.config = config;
    this.inputDim = inputDim;
    this.hiddenSize = config.neuronsPerLayer;

    // Dense encoding reduces input dimension
    const denseDim = Math.min(inputDim, 64);
    this.inputDim = denseDim;

    // Build trait name to index map
    this.traitNameToIndex = new Map();
    for (let i = 0; i < traitNames.length; i++) {
      this.traitNameToIndex.set(traitNames[i], i);
    }

    // Initialize weights with Xavier initialization
    const inputScale = 1.0 / Math.sqrt(this.inputDim);
    this.weightsInputHidden = new Float32Array(this.inputDim * this.hiddenSize);
    for (let i = 0; i < this.weightsInputHidden.length; i++) {
      this.weightsInputHidden[i] = (seededRandom(i * 3 + 1) * 2 - 1) * inputScale;
    }

    const hiddenScale = 1.0 / Math.sqrt(this.hiddenSize);
    this.weightsHiddenOutput = new Float32Array(this.hiddenSize * this.outputDim);
    for (let i = 0; i < this.weightsHiddenOutput.length; i++) {
      this.weightsHiddenOutput[i] = (seededRandom(i * 7 + 3) * 2 - 1) * hiddenScale;
    }

    // Create neuron populations
    this.hiddenNeurons = Array.from({ length: this.hiddenSize }, () => createLIFNeuron(0.0));
    this.outputNeurons = Array.from({ length: this.outputDim }, () => createLIFNeuron(0.0));

    // Spike history buffers
    this.hiddenSpikeHistory = new Float32Array(this.hiddenSize);
    this.outputSpikeHistory = new Float32Array(this.outputDim);
  }

  /**
   * Train using Hebbian/STDP learning on spike correlations.
   */
  train(facts: TraitFact[], epochs: number): TrainingMetrics {
    const startTime = performance.now();
    const lossPerEpoch: number[] = [];
    let totalWeightUpdates = 0;
    let totalSpikes = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0;

      for (const fact of facts) {
        // Encode input as dense vector
        const traitIdx = this.traitNameToIndex.get(fact.name) ?? 0;
        const inputVec = encodeTraitDense(traitIdx, this.inputDim);
        const targetVec = fact.propertyVector;

        // Run network for T timesteps to collect spike statistics
        this.resetNeuronState();
        const hiddenSpikeCounts = new Float32Array(this.hiddenSize);
        const outputSpikeCounts = new Float32Array(this.outputDim);

        for (let t = 0; t < this.config.timestepsPerInference; t++) {
          const currentTime = t * 1.0; // dt = 1.0

          // Input -> Hidden: compute weighted input currents
          const hiddenCurrents = new Float32Array(this.hiddenSize);
          for (let h = 0; h < this.hiddenSize; h++) {
            let current = 0;
            for (let i = 0; i < this.inputDim; i++) {
              // Rate-code: input * weight
              current += inputVec[i] * this.weightsInputHidden[i * this.hiddenSize + h];
            }
            hiddenCurrents[h] = current;
          }

          // Step hidden layer
          for (let h = 0; h < this.hiddenSize; h++) {
            const spiked = stepLIFNeuron(
              this.hiddenNeurons[h],
              hiddenCurrents[h],
              this.config.tau,
              this.config.vThreshold,
              0.0, // vReset
              0.0, // vRest
              1.0, // dt
              currentTime,
            );
            if (spiked) {
              hiddenSpikeCounts[h]++;
              totalSpikes++;
            }
          }

          // Hidden -> Output: compute weighted input currents
          const outputCurrents = new Float32Array(this.outputDim);
          for (let o = 0; o < this.outputDim; o++) {
            let current = 0;
            for (let h = 0; h < this.hiddenSize; h++) {
              if (this.hiddenNeurons[h].spiked) {
                current += this.weightsHiddenOutput[h * this.outputDim + o];
              }
            }
            outputCurrents[o] = current;
          }

          // Step output layer
          for (let o = 0; o < this.outputDim; o++) {
            const spiked = stepLIFNeuron(
              this.outputNeurons[o],
              outputCurrents[o],
              this.config.tau,
              this.config.vThreshold,
              0.0, // vReset
              0.0, // vRest
              1.0, // dt
              currentTime,
            );
            if (spiked) {
              outputSpikeCounts[o]++;
              totalSpikes++;
            }
          }
        }

        // Decode output: normalize spike counts to [0, 1]
        const maxSpikes = this.config.timestepsPerInference;
        const predicted = Array.from(outputSpikeCounts).map(c => c / maxSpikes);

        // Compute error
        let sampleLoss = 0;
        for (let o = 0; o < this.outputDim; o++) {
          const error = targetVec[o] - predicted[o];
          sampleLoss += error * error;
        }
        epochLoss += sampleLoss / this.outputDim;

        // STDP-inspired Hebbian learning:
        // Adjust weights to increase/decrease spike rate towards target
        const lr = this.config.learningRate;
        for (let o = 0; o < this.outputDim; o++) {
          const error = targetVec[o] - predicted[o];

          // Hidden -> Output: strengthen weights for active hidden neurons
          // when output error is positive (needs more spikes)
          for (let h = 0; h < this.hiddenSize; h++) {
            const preActivity = hiddenSpikeCounts[h] / maxSpikes;
            if (preActivity > 0) {
              const dw = lr * error * preActivity;
              this.weightsHiddenOutput[h * this.outputDim + o] += dw;
              totalWeightUpdates++;
            }
          }
        }

        // Input -> Hidden: use error signal to modulate
        for (let h = 0; h < this.hiddenSize; h++) {
          // Compute hidden neuron's contribution to output error
          let hiddenError = 0;
          for (let o = 0; o < this.outputDim; o++) {
            const outputError = targetVec[o] - (outputSpikeCounts[o] / maxSpikes);
            hiddenError += outputError * this.weightsHiddenOutput[h * this.outputDim + o];
          }

          for (let i = 0; i < this.inputDim; i++) {
            if (inputVec[i] > 0) {
              const dw = lr * 0.1 * hiddenError * inputVec[i]; // dampened
              this.weightsInputHidden[i * this.hiddenSize + h] += dw;
              totalWeightUpdates++;
            }
          }
        }
      }

      lossPerEpoch.push(epochLoss / facts.length);
    }

    return {
      trainingTimeMs: performance.now() - startTime,
      lossPerEpoch,
      finalLoss: lossPerEpoch[lossPerEpoch.length - 1] ?? 0,
      totalWeightUpdates,
      modelSpecific: {
        totalTrainingSpikes: totalSpikes,
        meanSpikesPerSample: totalSpikes / (facts.length * epochs),
      },
    };
  }

  /**
   * Retrieve property vector for a given trait.
   */
  retrieve(inputVector: number[]): RetrievalResult {
    const startTime = performance.now();
    this.resetNeuronState();
    this.totalSpikeCount = 0;

    const outputSpikeCounts = new Float32Array(this.outputDim);

    for (let t = 0; t < this.config.timestepsPerInference; t++) {
      const currentTime = t * 1.0;

      // Input -> Hidden
      const hiddenCurrents = new Float32Array(this.hiddenSize);
      for (let h = 0; h < this.hiddenSize; h++) {
        let current = 0;
        for (let i = 0; i < this.inputDim; i++) {
          current += inputVector[i] * this.weightsInputHidden[i * this.hiddenSize + h];
        }
        hiddenCurrents[h] = current;
      }

      // Step hidden
      for (let h = 0; h < this.hiddenSize; h++) {
        const spiked = stepLIFNeuron(
          this.hiddenNeurons[h],
          hiddenCurrents[h],
          this.config.tau,
          this.config.vThreshold,
          0.0, 0.0, 1.0,
          currentTime,
        );
        if (spiked) this.totalSpikeCount++;
      }

      // Hidden -> Output
      const outputCurrents = new Float32Array(this.outputDim);
      for (let o = 0; o < this.outputDim; o++) {
        let current = 0;
        for (let h = 0; h < this.hiddenSize; h++) {
          if (this.hiddenNeurons[h].spiked) {
            current += this.weightsHiddenOutput[h * this.outputDim + o];
          }
        }
        outputCurrents[o] = current;
      }

      // Step output
      for (let o = 0; o < this.outputDim; o++) {
        const spiked = stepLIFNeuron(
          this.outputNeurons[o],
          outputCurrents[o],
          this.config.tau,
          this.config.vThreshold,
          0.0, 0.0, 1.0,
          currentTime,
        );
        if (spiked) {
          outputSpikeCounts[o]++;
          this.totalSpikeCount++;
        }
      }
    }

    // Decode: normalize spike counts
    const maxSpikes = this.config.timestepsPerInference;
    const predictedVector = Array.from(outputSpikeCounts).map(c =>
      Math.min(1.0, c / maxSpikes)
    );

    return {
      predictedVector,
      inferenceTimeMs: performance.now() - startTime,
      modelSpecific: {
        totalSpikes: this.totalSpikeCount,
        hiddenSpikes: this.totalSpikeCount - Array.from(outputSpikeCounts).reduce((a, b) => a + b, 0),
        outputSpikes: Array.from(outputSpikeCounts).reduce((a, b) => a + b, 0),
      },
    };
  }

  /**
   * Get an input vector for a trait by name.
   */
  getInputVector(traitName: string): number[] {
    const idx = this.traitNameToIndex.get(traitName) ?? 0;
    return encodeTraitDense(idx, this.inputDim);
  }

  reset(): void {
    // Re-initialize weights
    const inputScale = 1.0 / Math.sqrt(this.inputDim);
    for (let i = 0; i < this.weightsInputHidden.length; i++) {
      this.weightsInputHidden[i] = (seededRandom(i * 3 + 1) * 2 - 1) * inputScale;
    }
    const hiddenScale = 1.0 / Math.sqrt(this.hiddenSize);
    for (let i = 0; i < this.weightsHiddenOutput.length; i++) {
      this.weightsHiddenOutput[i] = (seededRandom(i * 7 + 3) * 2 - 1) * hiddenScale;
    }

    this.resetNeuronState();
    this.totalSpikeCount = 0;
  }

  private resetNeuronState(): void {
    for (const n of this.hiddenNeurons) {
      n.voltage = 0.0;
      n.refractory = 0;
      n.spiked = false;
      n.lastSpikeTime = -Infinity;
    }
    for (const n of this.outputNeurons) {
      n.voltage = 0.0;
      n.refractory = 0;
      n.spiked = false;
      n.lastSpikeTime = -Infinity;
    }
    this.hiddenSpikeHistory.fill(0);
    this.outputSpikeHistory.fill(0);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deterministic pseudo-random number generator.
 * Returns value in [0, 1).
 */
function seededRandom(seed: number): number {
  let state = (seed * 2654435761 + 1) >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0xFFFFFFFF;
}
