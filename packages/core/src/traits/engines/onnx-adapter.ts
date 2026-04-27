/**
 * Inference backend adapter — abstracts over execution providers.
 *
 * Why an adapter layer:
 *   - The MotionMatchingEngine does forward passes through a small NN.
 *   - The NN can be evaluated by ONNX Runtime Web (browser, WebGPU/WASM),
 *     ONNX Runtime Node (server, CPU/CUDA), or a pure-JS forward pass
 *     (smallest dep, fully deterministic). Caller picks via factory.
 *   - This file declares the contract; concrete backends slot in later.
 *
 * Per /founder ruling 2026-04-26 (BUILD-1, idea-run-3): the network
 * architecture itself is reimplemented from primary literature
 * (Holden 2017 Phase-Functioned NN, Starke 2019 NSM, 2020 Local Motion
 * Phases, 2022 DeepPhase). The adapter is execution-only — it doesn't
 * encode any architecture-specific behavior beyond "load weights, run
 * forward pass on these tensors".
 *
 * License-cleanliness: the adapter contract is fresh-authored in this file.
 * Backend implementations must wrap permissively-licensed runtimes:
 *   - ONNX Runtime Web → MIT
 *   - ONNX Runtime Node → MIT
 *   - microsoft/onnxruntime → MIT
 * No vendoring of CC-BY-NC code (sweriko port et al).
 */

/** Execution provider — caller hint for backend selection. */
export type ExecutionProvider = 'webgpu' | 'wasm' | 'cpu' | 'cuda';

/** Tensor shape — row-major, dimensions list. */
export type TensorShape = readonly number[];

/** Float32 tensor — the only dtype the motion-matching engine uses. */
export interface Float32Tensor {
  data: Float32Array;
  shape: TensorShape;
}

/** Multi-input/output inference call shape. */
export interface InferenceRequest {
  /** Named inputs — must match the model's input signature. */
  inputs: Record<string, Float32Tensor>;
  /** Optional list of output names to fetch — empty = fetch all. */
  outputs?: string[];
}

export interface InferenceResponse {
  /** Named outputs — keyed by the model's output signature. */
  outputs: Record<string, Float32Tensor>;
  /** Wall-clock inference duration in milliseconds. */
  durationMs: number;
  /** Which execution provider actually ran the forward pass. */
  providerUsed: ExecutionProvider;
}

/**
 * Backend adapter contract. Implementations: OnnxWebAdapter (browser),
 * OnnxNodeAdapter (server), PureJsAdapter (no native deps, deterministic).
 */
export interface InferenceAdapter {
  readonly name: string;
  readonly preferredProvider: ExecutionProvider;
  readonly loaded: boolean;
  /** Load model weights. Idempotent — repeated calls no-op. */
  load(modelUrl: string): Promise<void>;
  /** Run a forward pass. Throws if not loaded. */
  run(request: InferenceRequest): Promise<InferenceResponse>;
  /** Free GPU/CPU resources. */
  dispose(): void;
}

/**
 * NoOpInferenceAdapter — deterministic pass-through, no real model.
 *
 * Returns zero-filled tensors with shapes derived from the input names.
 * Default output shape is the same as the first input. Used for:
 *   - testing the adapter contract end-to-end
 *   - fallback when no real backend is available
 *   - integration tests where the network output isn't being asserted
 *
 * Real backends (OnnxWebAdapter, etc.) ship in BUILD-1 follow-up.
 */
export class NoOpInferenceAdapter implements InferenceAdapter {
  readonly name = 'NoOpInferenceAdapter';
  readonly preferredProvider: ExecutionProvider = 'cpu';
  loaded = false;
  private modelUrl: string | null = null;

  async load(modelUrl: string): Promise<void> {
    this.modelUrl = modelUrl;
    this.loaded = true;
  }

  async run(request: InferenceRequest): Promise<InferenceResponse> {
    if (!this.loaded) {
      throw new Error('NoOpInferenceAdapter: load() must be called before run()');
    }

    const inputNames = Object.keys(request.inputs);
    if (inputNames.length === 0) {
      throw new Error('NoOpInferenceAdapter: at least one input required');
    }
    const firstInput = request.inputs[inputNames[0]];
    const outputNames = request.outputs && request.outputs.length > 0
      ? request.outputs
      : ['output'];

    const outputs: Record<string, Float32Tensor> = {};
    for (const name of outputNames) {
      outputs[name] = {
        data: new Float32Array(firstInput.data.length),
        shape: firstInput.shape,
      };
    }

    return {
      outputs,
      durationMs: 0,
      providerUsed: this.preferredProvider,
    };
  }

  dispose(): void {
    this.loaded = false;
    this.modelUrl = null;
  }

  /** Returns the URL the adapter was loaded with — diagnostic only. */
  get loadedModelUrl(): string | null {
    return this.modelUrl;
  }
}

/** Factory for the default adapter. Real backends override this in their package. */
export function createNoOpInferenceAdapter(): InferenceAdapter {
  return new NoOpInferenceAdapter();
}
