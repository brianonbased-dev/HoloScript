/**
 * @holoscript/snn-webgpu - Backprop (MLP) Fact-Retrieval Baseline
 *
 * Standard multi-layer perceptron with sigmoid activations and
 * stochastic gradient descent. Serves as the conventional baseline
 * against the SNN model for VR trait property retrieval.
 *
 * Architecture:
 *   Input (dense encoded trait, dim=64)
 *       -> Hidden 1 (64 neurons, sigmoid)
 *       -> Hidden 2 (32 neurons, sigmoid)
 *       -> Output (6 neurons, sigmoid)
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
// ACTIVATION FUNCTIONS
// =============================================================================

function sigmoid(x: number): number {
  if (x > 15) return 1.0;
  if (x < -15) return 0.0;
  return 1.0 / (1.0 + Math.exp(-x));
}

function sigmoidDerivative(output: number): number {
  return output * (1.0 - output);
}

// =============================================================================
// MLP LAYER
// =============================================================================

interface MLPLayer {
  inputSize: number;
  outputSize: number;
  weights: Float32Array;      // [inputSize * outputSize]
  biases: Float32Array;       // [outputSize]
  outputs: Float32Array;      // [outputSize] - after activation
  preActivations: Float32Array; // [outputSize] - before activation
  weightGrads: Float32Array;  // [inputSize * outputSize]
  biasGrads: Float32Array;    // [outputSize]
  weightMomentum: Float32Array;
  biasMomentum: Float32Array;
}

function createLayer(inputSize: number, outputSize: number, seed: number): MLPLayer {
  const scale = Math.sqrt(2.0 / (inputSize + outputSize)); // Glorot init
  const weights = new Float32Array(inputSize * outputSize);
  const biases = new Float32Array(outputSize);

  for (let i = 0; i < weights.length; i++) {
    weights[i] = seededRandom(seed + i) * 2 * scale - scale;
  }
  for (let i = 0; i < biases.length; i++) {
    biases[i] = 0.01; // small positive bias
  }

  return {
    inputSize,
    outputSize,
    weights,
    biases,
    outputs: new Float32Array(outputSize),
    preActivations: new Float32Array(outputSize),
    weightGrads: new Float32Array(inputSize * outputSize),
    biasGrads: new Float32Array(outputSize),
    weightMomentum: new Float32Array(inputSize * outputSize),
    biasMomentum: new Float32Array(outputSize),
  };
}

function forwardLayer(layer: MLPLayer, input: Float32Array | number[]): void {
  for (let o = 0; o < layer.outputSize; o++) {
    let sum = layer.biases[o];
    for (let i = 0; i < layer.inputSize; i++) {
      sum += (input instanceof Float32Array ? input[i] : input[i]) * layer.weights[i * layer.outputSize + o];
    }
    layer.preActivations[o] = sum;
    layer.outputs[o] = sigmoid(sum);
  }
}

// =============================================================================
// BACKPROP FACT-RETRIEVAL MODEL
// =============================================================================

export class BackpropRetrievalModel implements FactRetrievalModel {
  readonly name = 'MLP-SGD-Sigmoid';
  readonly type = 'backprop' as const;

  private config: ExperimentConfig['backprop'];
  private inputDim: number;
  private outputDim: number = 6;
  private layers: MLPLayer[];

  // Trait index mapping
  private traitNameToIndex: Map<string, number>;
  private totalTraits: number;

  constructor(
    config: ExperimentConfig['backprop'],
    totalTraits: number,
    traitNames: string[],
  ) {
    this.config = config;
    this.totalTraits = totalTraits;
    this.inputDim = Math.min(totalTraits, 64); // dense encoding

    // Build trait name to index map
    this.traitNameToIndex = new Map();
    for (let i = 0; i < traitNames.length; i++) {
      this.traitNameToIndex.set(traitNames[i], i);
    }

    // Build layers
    this.layers = [];
    const sizes = [this.inputDim, ...config.hiddenSizes, this.outputDim];
    for (let i = 0; i < sizes.length - 1; i++) {
      this.layers.push(createLayer(sizes[i], sizes[i + 1], (i + 1) * 12345));
    }
  }

  /**
   * Train using standard backpropagation with SGD + momentum.
   */
  train(facts: TraitFact[], epochs: number): TrainingMetrics {
    const startTime = performance.now();
    const lossPerEpoch: number[] = [];
    let totalWeightUpdates = 0;
    let totalOps = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0;

      for (const fact of facts) {
        // Forward pass
        const traitIdx = this.traitNameToIndex.get(fact.name) ?? 0;
        const inputVec = encodeTraitDense(traitIdx, this.inputDim);
        const target = fact.propertyVector;

        const predicted = this.forward(inputVec);

        // Compute loss
        let sampleLoss = 0;
        for (let o = 0; o < this.outputDim; o++) {
          const error = target[o] - predicted[o];
          sampleLoss += error * error;
        }
        epochLoss += sampleLoss / this.outputDim;

        // Backward pass
        this.backward(inputVec, target);
        totalWeightUpdates += this.updateWeights();

        // Count multiply-accumulate operations per sample
        for (const layer of this.layers) {
          totalOps += layer.inputSize * layer.outputSize * 2; // forward + backward
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
        totalMultiplyAccumulateOps: totalOps,
        opsPerSample: totalOps / (facts.length * epochs),
      },
    };
  }

  /**
   * Retrieve property vector for a given trait.
   */
  retrieve(inputVector: number[]): RetrievalResult {
    const startTime = performance.now();
    const predicted = this.forward(inputVector);

    // Count MACs for inference
    let ops = 0;
    for (const layer of this.layers) {
      ops += layer.inputSize * layer.outputSize;
    }

    return {
      predictedVector: [...predicted],
      inferenceTimeMs: performance.now() - startTime,
      modelSpecific: {
        multiplyAccumulateOps: ops,
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
    const sizes = [this.inputDim, ...this.config.hiddenSizes, this.outputDim];
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      this.layers.push(createLayer(sizes[i], sizes[i + 1], (i + 1) * 12345));
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private forward(input: number[]): number[] {
    let currentInput: Float32Array | number[] = input;

    for (const layer of this.layers) {
      forwardLayer(layer, currentInput);
      currentInput = layer.outputs;
    }

    // Return output of last layer
    const lastLayer = this.layers[this.layers.length - 1];
    return Array.from(lastLayer.outputs);
  }

  private backward(input: number[], target: number[]): void {
    const numLayers = this.layers.length;

    // Compute output layer deltas
    const outputLayer = this.layers[numLayers - 1];
    const outputDeltas = new Float32Array(outputLayer.outputSize);
    for (let o = 0; o < outputLayer.outputSize; o++) {
      const error = target[o] - outputLayer.outputs[o];
      outputDeltas[o] = error * sigmoidDerivative(outputLayer.outputs[o]);
    }

    // Propagate deltas backward
    const allDeltas: Float32Array[] = new Array(numLayers);
    allDeltas[numLayers - 1] = outputDeltas;

    for (let l = numLayers - 2; l >= 0; l--) {
      const currentLayer = this.layers[l];
      const nextLayer = this.layers[l + 1];
      const nextDeltas = allDeltas[l + 1];

      const deltas = new Float32Array(currentLayer.outputSize);
      for (let j = 0; j < currentLayer.outputSize; j++) {
        let sum = 0;
        for (let k = 0; k < nextLayer.outputSize; k++) {
          sum += nextDeltas[k] * nextLayer.weights[j * nextLayer.outputSize + k];
        }
        deltas[j] = sum * sigmoidDerivative(currentLayer.outputs[j]);
      }
      allDeltas[l] = deltas;
    }

    // Compute gradients
    for (let l = 0; l < numLayers; l++) {
      const layer = this.layers[l];
      const deltas = allDeltas[l];
      const layerInput = l === 0 ? input : Array.from(this.layers[l - 1].outputs);

      // Weight gradients
      for (let i = 0; i < layer.inputSize; i++) {
        for (let o = 0; o < layer.outputSize; o++) {
          layer.weightGrads[i * layer.outputSize + o] = deltas[o] * layerInput[i];
        }
      }

      // Bias gradients
      for (let o = 0; o < layer.outputSize; o++) {
        layer.biasGrads[o] = deltas[o];
      }
    }
  }

  private updateWeights(): number {
    let updates = 0;
    const lr = this.config.learningRate;
    const momentum = this.config.momentum;

    for (const layer of this.layers) {
      // Update weights with momentum
      for (let i = 0; i < layer.weights.length; i++) {
        layer.weightMomentum[i] = momentum * layer.weightMomentum[i] + lr * layer.weightGrads[i];
        layer.weights[i] += layer.weightMomentum[i];
        updates++;
      }

      // Update biases with momentum
      for (let i = 0; i < layer.biases.length; i++) {
        layer.biasMomentum[i] = momentum * layer.biasMomentum[i] + lr * layer.biasGrads[i];
        layer.biases[i] += layer.biasMomentum[i];
        updates++;
      }
    }

    return updates;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function seededRandom(seed: number): number {
  let state = (seed * 2654435761 + 1) >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0xFFFFFFFF;
}
