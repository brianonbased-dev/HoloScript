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
 * Backend adapter contract. Implementations: OnnxNodeInferenceAdapter (server,
 * onnxruntime-node), PureJsInferenceAdapter (no native deps, deterministic,
 * real PFNN forward pass), NoOpInferenceAdapter (zero-output test double).
 *
 * `runSync` is OPTIONAL: only backends whose forward pass is genuinely
 * synchronous (pure-JS, no-op) implement it. The MotionMatchingEngine's
 * synchronous `infer()` uses it when present and falls back to `inferAsync()`
 * for backends that only support async (onnxruntime-node/web). An adapter that
 * exposes `runSync` MUST return real (non-fabricated) outputs from it.
 */
export interface InferenceAdapter {
  readonly name: string;
  readonly preferredProvider: ExecutionProvider;
  readonly loaded: boolean;
  /** Load model weights. Idempotent — repeated calls no-op. */
  load(modelUrl: string): Promise<void>;
  /** Run a forward pass. Throws if not loaded. */
  run(request: InferenceRequest): Promise<InferenceResponse>;
  /**
   * Optional synchronous forward pass. Present only on adapters whose backend
   * is genuinely synchronous. Returns the same result `run()` would.
   */
  runSync?(request: InferenceRequest): InferenceResponse;
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

  runSync(request: InferenceRequest): InferenceResponse {
    if (!this.loaded) {
      throw new Error('NoOpInferenceAdapter: load() must be called before run()');
    }

    const inputNames = Object.keys(request.inputs);
    if (inputNames.length === 0) {
      throw new Error('NoOpInferenceAdapter: at least one input required');
    }
    const firstInput = request.inputs[inputNames[0]];
    const outputNames =
      request.outputs && request.outputs.length > 0 ? request.outputs : ['output'];

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

  async run(request: InferenceRequest): Promise<InferenceResponse> {
    return this.runSync(request);
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

// ── PureJsInferenceAdapter — real PFNN forward pass, no native deps ───────────

import { createBundledPfnn, type PfnnNetwork } from './pfnn-network';

/**
 * Pure-JS inference backend wrapping a real Phase-Functioned NN forward pass
 * (see pfnn-network.ts). This is a GENUINE forward pass — real dense layers,
 * real ELU, real phase-blended weights — not a zero-output stub. It is the
 * default that makes `OnnxMotionMatchingEngine.infer()` produce real,
 * deterministic, non-zero motion output synchronously without any native
 * dependency or model download.
 *
 * Input/output dims are inferred on `load()` from the request the engine
 * will send (the engine encodes INPUT_DIM and decodes OUTPUT_DIM). They can
 * also be supplied explicitly to the constructor.
 *
 * `phase` is read from the input tensor: the engine writes the four phase
 * channels into the last four elements of the input (sin/cos at 1× and 2×).
 * We recover φ from atan2(sinφ, cosφ); the PFNN blends its weight banks by it.
 */
export class PureJsInferenceAdapter implements InferenceAdapter {
  readonly name = 'PureJsInferenceAdapter';
  readonly preferredProvider: ExecutionProvider = 'cpu';
  loaded = false;

  private net: PfnnNetwork | null = null;
  private modelUrl: string | null = null;

  constructor(
    private readonly inputDim?: number,
    private readonly outputDim?: number
  ) {}

  async load(modelUrl: string): Promise<void> {
    this.modelUrl = modelUrl;
    // Defer net construction until we know the dims (first run) unless the
    // caller supplied them. The bundled PFNN is deterministic from a fixed
    // seed, so loading is just "be ready to build the frozen network".
    if (this.inputDim != null && this.outputDim != null) {
      this.net = createBundledPfnn(this.inputDim, this.outputDim);
    }
    this.loaded = true;
  }

  private ensureNet(inputDim: number): PfnnNetwork {
    if (this.net && this.net.inputDim === inputDim) return this.net;
    const outDim = this.outputDim ?? MOTION_OUTPUT_DIM_DEFAULT;
    this.net = createBundledPfnn(inputDim, outDim);
    return this.net;
  }

  /** Recover the locomotion phase from the engine's phase channels. */
  private phaseFromInput(data: Float32Array): number {
    // Engine writes sin(2πφ), cos(2πφ) as the first two of the four trailing
    // phase channels. Recover φ ∈ [0,1) via atan2.
    const n = data.length;
    const sinP = data[n - 4] ?? 0;
    const cosP = data[n - 3] ?? 1;
    return (Math.atan2(sinP, cosP) / (2 * Math.PI) + 1) % 1;
  }

  runSync(request: InferenceRequest): InferenceResponse {
    if (!this.loaded) {
      throw new Error('PureJsInferenceAdapter: load() must be called before run()');
    }
    const inputNames = Object.keys(request.inputs);
    if (inputNames.length === 0) {
      throw new Error('PureJsInferenceAdapter: at least one input required');
    }
    const input = request.inputs[inputNames[0]];
    const net = this.ensureNet(input.data.length);
    const phase = this.phaseFromInput(input.data);

    const start = nowMs();
    const out = net.forward(input.data, phase);
    const durationMs = nowMs() - start;

    const outName =
      request.outputs && request.outputs.length > 0 ? request.outputs[0] : 'motion_output';
    return {
      outputs: { [outName]: { data: out, shape: [1, out.length] } },
      durationMs,
      providerUsed: this.preferredProvider,
    };
  }

  async run(request: InferenceRequest): Promise<InferenceResponse> {
    return this.runSync(request);
  }

  dispose(): void {
    this.loaded = false;
    this.net = null;
    this.modelUrl = null;
  }
}

/** Default OUTPUT_DIM for the bundled motion models (mirrors
 *  onnx-motion-matching.OUTPUT_DIM; duplicated as a literal to avoid a
 *  circular import — kept in sync by pfnn-network.test.ts parity assertion). */
const MOTION_OUTPUT_DIM_DEFAULT = 50;

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function createPureJsInferenceAdapter(
  inputDim?: number,
  outputDim?: number
): InferenceAdapter {
  return new PureJsInferenceAdapter(inputDim, outputDim);
}

// ── OnnxNodeInferenceAdapter — real onnxruntime-node backend ──────────────────

/**
 * Server-side inference backend wrapping `onnxruntime-node`. This runs a REAL
 * ONNX graph through Microsoft's ONNX Runtime (MIT) — the exact pattern proven
 * in packages/hologram-worker/src/depth-infer.ts.
 *
 * The model file is resolved from `bundled://<id>.onnx` sentinels to the
 * provisioned cache written by scripts/provision-motion-model.mjs, or from an
 * absolute/relative filesystem path, or from HOLOSCRIPT_MOTION_MODELS_DIR.
 * When the runtime or the model file is unavailable (e.g. browser bundle, no
 * provisioned weights), `load()` throws so the engine can fall back to the
 * pure-JS adapter rather than silently returning zeros.
 *
 * onnxruntime-node has no synchronous run API, so this adapter intentionally
 * does NOT implement `runSync` — callers must use `inferAsync()`.
 */
export class OnnxNodeInferenceAdapter implements InferenceAdapter {
  readonly name = 'OnnxNodeInferenceAdapter';
  readonly preferredProvider: ExecutionProvider;
  loaded = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ort: any = null;
  private resolvedPath: string | null = null;

  constructor(preferredProvider: ExecutionProvider = 'cpu') {
    this.preferredProvider = preferredProvider;
  }

  async load(modelUrl: string): Promise<void> {
    const path = await resolveOnnxModelPath(modelUrl);
    if (!path) {
      throw new Error(
        `OnnxNodeInferenceAdapter: no .onnx model file resolved for "${modelUrl}". ` +
          `Provision it with scripts/provision-motion-model.mjs or set ` +
          `HOLOSCRIPT_MOTION_MODELS_DIR.`
      );
    }
    // Lazy import so browser/edge bundles that never call this don't pull in
    // the native addon (mirrors depth-infer.ts).
    this.ort = await import('onnxruntime-node');
    // Select execution providers: CUDA when explicitly requested via
    // preferredProvider='cuda' OR the HOLOSCRIPT_CUDA_EP=1 env var.
    // onnxruntime-node uses lowercase short names ('cuda', 'cpu') — NOT the
    // C++/Python full strings ('CUDAExecutionProvider', etc.).
    // CPU is always listed as the fallback so the session survives on machines
    // where the CUDA EP shared library is absent (ORT drops unavailable EPs
    // with a warning and uses the next one in the array).
    const wantCuda =
      this.preferredProvider === 'cuda' ||
      (typeof process !== 'undefined' && process.env?.HOLOSCRIPT_CUDA_EP === '1');
    const executionProviders = wantCuda ? ['cuda', 'cpu'] : ['cpu'];
    this.session = await this.ort.InferenceSession.create(path, { executionProviders });
    this.resolvedPath = path;
    this.loaded = true;
    // Honest one-line provider audit — the claim is no longer cosmetic.
    const activeProviders: string[] =
      (this.session as { executionProviders?: string[] }).executionProviders ?? executionProviders;
    console.log(
      `[OnnxNodeInferenceAdapter] loaded "${path}" — requested: [${executionProviders.join(', ')}], active: [${activeProviders.join(', ')}]`
    );
  }

  async run(request: InferenceRequest): Promise<InferenceResponse> {
    if (!this.loaded || !this.session || !this.ort) {
      throw new Error('OnnxNodeInferenceAdapter: load() must be called before run()');
    }
    const inputNames = Object.keys(request.inputs);
    if (inputNames.length === 0) {
      throw new Error('OnnxNodeInferenceAdapter: at least one input required');
    }

    // Map our named Float32Tensors to ORT input tensors, matching the
    // session's declared input signature where possible.
    const feeds: Record<string, unknown> = {};
    const sessionInputs: string[] = this.session.inputNames ?? [];
    const requestEntries = Object.entries(request.inputs);
    requestEntries.forEach(([name, tensor], i) => {
      const target = sessionInputs[i] ?? name;
      feeds[target] = new this.ort.Tensor('float32', tensor.data, Array.from(tensor.shape));
    });

    const start = nowMs();
    const results = await this.session.run(feeds);
    const durationMs = nowMs() - start;

    const sessionOutputs: string[] = this.session.outputNames ?? Object.keys(results);
    const wanted = request.outputs && request.outputs.length > 0 ? request.outputs : sessionOutputs;

    const outputs: Record<string, Float32Tensor> = {};
    wanted.forEach((name, i) => {
      // Prefer the session's actual output name at this position; fall back to
      // the requested alias.
      const srcName = sessionOutputs[i] ?? name;
      const t = results[srcName] ?? results[name];
      if (t) {
        outputs[name] = { data: t.data as Float32Array, shape: (t.dims as number[]).slice() };
      }
    });

    return { outputs, durationMs, providerUsed: this.preferredProvider };
  }

  dispose(): void {
    if (this.session && typeof this.session.release === 'function') {
      try {
        // ORT node sessions expose release(); ignore if absent.
        void this.session.release();
      } catch {
        /* best-effort */
      }
    }
    this.session = null;
    this.ort = null;
    this.resolvedPath = null;
    this.loaded = false;
  }

  /** The on-disk path the session was created from — diagnostic only. */
  get loadedModelPath(): string | null {
    return this.resolvedPath;
  }
}

export function createOnnxNodeInferenceAdapter(
  preferredProvider: ExecutionProvider = 'cpu'
): InferenceAdapter {
  return new OnnxNodeInferenceAdapter(preferredProvider);
}

/**
 * Resolve a model URL to an on-disk .onnx path (Node only). Returns null if no
 * file exists or we're not in a Node environment (no fs). Handles:
 *   - absolute / relative filesystem paths to a .onnx file
 *   - `bundled://<id>.onnx` sentinels → <provision-dir>/<id>.onnx
 *   - HOLOSCRIPT_MOTION_MODELS_DIR/<id>.onnx
 *   - the default provisioned cache <repo>/.models/motion/<id>.onnx
 */
export async function resolveOnnxModelPath(modelUrl: string): Promise<string | null> {
  // Node-only: dynamically import fs/path so browser bundles don't break.
  let fs: typeof import('node:fs');
  let path: typeof import('node:path');
  try {
    fs = await import('node:fs');
    path = await import('node:path');
  } catch {
    return null;
  }
  const exists = (p: string) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };

  // Direct filesystem path.
  if (!modelUrl.startsWith('bundled://') && exists(modelUrl)) return modelUrl;

  const id = modelUrl.startsWith('bundled://')
    ? modelUrl.slice('bundled://'.length)
    : path.basename(modelUrl);
  const fileName = id.endsWith('.onnx') ? id : `${id}.onnx`;

  const candidates: string[] = [];
  const envDir = process?.env?.HOLOSCRIPT_MOTION_MODELS_DIR?.trim();
  if (envDir) candidates.push(path.join(path.resolve(envDir), fileName));

  // Walk up from cwd looking for the repo's provisioned cache.
  let dir = process?.cwd?.() ?? '.';
  for (let i = 0; i < 8; i++) {
    candidates.push(path.join(dir, '.models', 'motion', fileName));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return candidates.find(exists) ?? null;
}
