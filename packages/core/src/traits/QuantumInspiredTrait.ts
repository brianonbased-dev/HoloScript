/**
 * QuantumInspiredTrait — @quantumInspired
 *
 * Wraps SnnAccelerator (from @holoscript/holoembed) to provide
 * quantum-annealing-inspired optimization in HoloScript scenes.
 *
 * ## Why this is "quantum-inspired"
 *
 * LIF (Leaky Integrate-and-Fire) population coding minimises energy over
 * discrete binary-state distributions: each neuron fires only when its
 * membrane potential exceeds a threshold, producing a sparse activation
 * that is structurally analogous to the ground-state search in quantum
 * annealing (Biamonte et al., Nature 549, 195–202, 2017).
 *
 * The SnnAccelerator implements this via a WGSL compute shader (128 LIF
 * neurons, workgroup size 64, configurable timesteps) running on
 * WebGPU. When WebGPU is unavailable (CI, Node.js < 22 without
 * --experimental-webgpu), the accelerator transparently passes the input
 * histogram through unchanged so the trait is always runnable.
 *
 * ## Usage in .hs scenes
 *
 * ```
 * object Optimizer {
 *   @quantumInspired(numNeurons: 128, learningRate: 0.01)
 * }
 * ```
 *
 * ## Cross-package design
 *
 * @holoscript/holoembed is NOT a hard dependency of @holoscript/core.
 * The trait accepts an optional `acceleratorProvider` factory in config so
 * callers can inject a real SnnAccelerator without creating a coupling.
 * When no provider is given the trait falls back to a pure-CPU sigmoid
 * activation that preserves the input shape with a non-linear transform.
 *
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Minimal subset of SnnAccelerator that the trait depends on.
 * Satisfied by @holoscript/holoembed's SnnAccelerator class.
 */
export interface SnnAcceleratorLike {
  readonly available: boolean;
  initialize(opts?: { enableSnn?: boolean; snnTimesteps?: number }): Promise<void>;
  encode(histogram: Float32Array): Promise<Float32Array>;
  dispose(): void;
}

/** Factory that constructs an SnnAcceleratorLike instance on demand. */
export type SnnAcceleratorProvider = () => SnnAcceleratorLike;

export interface QuantumInspiredConfig {
  /**
   * Number of LIF neurons used for population coding.
   * Must match the dimensionality of inputs passed to optimize().
   * Default: 128 (matches SnnAccelerator's canonical block size).
   */
  numNeurons: number;

  /**
   * Scalar learning-rate exposed to .hs authors. Not used internally
   * by the LIF shader (which is stateless per call) but available as
   * scene-level metadata and for downstream compositing traits.
   * Default: 0.01
   */
  learningRate: number;

  /**
   * Number of LIF simulation timesteps per encode call.
   * Higher values → richer spike-rate patterns, more GPU cost.
   * Default: 50 (50ms simulated at dt=1ms).
   */
  snnTimesteps: number;

  /**
   * Optional factory to provide a concrete SnnAcceleratorLike instance.
   * Inject `() => new SnnAccelerator()` from @holoscript/holoembed to
   * enable GPU acceleration. Omit for pure-CPU sigmoid fallback.
   */
  acceleratorProvider?: SnnAcceleratorProvider;
}

interface QuantumInspiredState {
  /** Lazily constructed accelerator (null until first optimize() call). */
  accelerator: SnnAcceleratorLike | null;
  /** Whether the accelerator's initialize() has been awaited. */
  initialized: boolean;
  /** Total number of optimize() calls since attach. */
  optimizeCount: number;
}

// =============================================================================
// CPU FALLBACK
// =============================================================================

/**
 * Pure-CPU sigmoid activation used when no SnnAcceleratorProvider is given.
 *
 * sigmoid(x) = 1 / (1 + exp(-k * (x - 0.5)))
 * with k = 10 approximates the LIF threshold nonlinearity:
 *   - inputs near 0 → ~0 output  (sub-threshold, no spikes)
 *   - inputs near 1 → ~1 output  (supra-threshold, max spikes)
 *
 * Shape-preserving: output has the same length as input.
 */
function cpuSigmoidActivation(input: Float32Array): Float32Array {
  const output = new Float32Array(input.length);
  const k = 10;
  for (let i = 0; i < input.length; i++) {
    output[i] = 1 / (1 + Math.exp(-k * (input[i] - 0.5)));
  }
  return output;
}

/**
 * CPU-only SnnAcceleratorLike that uses sigmoid activation as a surrogate
 * for LIF population coding. Available in all environments.
 */
class CpuFallbackAccelerator implements SnnAcceleratorLike {
  readonly available = false;

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  encode(histogram: Float32Array): Promise<Float32Array> {
    return Promise.resolve(cpuSigmoidActivation(histogram));
  }

  dispose(): void {
    // nothing to release
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const quantumInspiredHandler: TraitHandler<QuantumInspiredConfig> = {
  name: 'quantumInspired',

  defaultConfig: {
    numNeurons: 128,
    learningRate: 0.01,
    snnTimesteps: 50,
    acceleratorProvider: undefined,
  },

  onAttach(node: HSPlusNode, config: QuantumInspiredConfig, _context: TraitContext): void {
    const state: QuantumInspiredState = {
      accelerator: null,
      initialized: false,
      optimizeCount: 0,
    };
    node.__qiState = state;
  },

  onDetach(node: HSPlusNode, _config: QuantumInspiredConfig, _context: TraitContext): void {
    const state = node.__qiState as QuantumInspiredState | undefined;
    if (state?.accelerator) {
      state.accelerator.dispose();
    }
    delete node.__qiState;
  },

  onUpdate(
    _node: HSPlusNode,
    _config: QuantumInspiredConfig,
    _context: TraitContext,
    _delta: number
  ): void {
    // Stateless per-tick — optimization is driven by events.
  },

  onEvent(
    node: HSPlusNode,
    config: QuantumInspiredConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__qiState as QuantumInspiredState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'qi:optimize': {
        // Payload: { input: Float32Array | number[], requestId?: string }
        const payload = event.payload ?? event;
        const rawInput = payload['input'];

        if (!isFloat32ArrayLike(rawInput)) {
          context.emit?.('qi:error', {
            requestId: payload['requestId'],
            code: 'INVALID_INPUT',
            message:
              'qi:optimize requires payload.input to be a Float32Array or number[] with length > 0',
          });
          return;
        }

        const input =
          rawInput instanceof Float32Array ? rawInput : new Float32Array(rawInput as number[]);

        if (input.length !== config.numNeurons) {
          context.emit?.('qi:error', {
            requestId: payload['requestId'],
            code: 'SHAPE_MISMATCH',
            message: `qi:optimize input length ${input.length} does not match numNeurons ${config.numNeurons}`,
          });
          return;
        }

        // Kick off async optimization — fire-and-forget with result via event.
        void _runOptimize(state, config, context, input, String(payload['requestId'] ?? ''));
        break;
      }

      case 'qi:reset': {
        // Dispose existing accelerator so next optimize() re-initializes.
        if (state.accelerator) {
          state.accelerator.dispose();
          state.accelerator = null;
          state.initialized = false;
        }
        state.optimizeCount = 0;
        context.emit?.('qi:reset_complete', { optimizeCount: 0 });
        break;
      }

      case 'qi:status': {
        context.emit?.('qi:status_result', {
          initialized: state.initialized,
          acceleratorAvailable: state.accelerator?.available ?? false,
          optimizeCount: state.optimizeCount,
          numNeurons: config.numNeurons,
          learningRate: config.learningRate,
          snnTimesteps: config.snnTimesteps,
        });
        break;
      }
    }
  },
};

// =============================================================================
// ASYNC OPTIMIZATION HELPER
// =============================================================================

/**
 * Lazily initialize the accelerator and run encode().
 * Emits qi:result on success, qi:error on failure.
 *
 * Defined outside the handler object so it can be async without forcing the
 * synchronous onEvent to return a Promise (the TraitHandler contract is sync).
 */
async function _runOptimize(
  state: QuantumInspiredState,
  config: QuantumInspiredConfig,
  context: TraitContext,
  input: Float32Array,
  requestId: string
): Promise<void> {
  try {
    // Lazy init — build accelerator on first use.
    if (!state.accelerator) {
      state.accelerator = config.acceleratorProvider
        ? config.acceleratorProvider()
        : new CpuFallbackAccelerator();
    }

    if (!state.initialized) {
      await state.accelerator.initialize({
        enableSnn: true,
        snnTimesteps: config.snnTimesteps,
      });
      state.initialized = true;
    }

    const output = await state.accelerator.encode(input);
    state.optimizeCount++;

    context.emit?.('qi:result', {
      requestId,
      output,
      optimizeCount: state.optimizeCount,
      gpuAccelerated: state.accelerator.available,
    });
  } catch (err: unknown) {
    context.emit?.('qi:error', {
      requestId,
      code: 'ENCODE_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// GUARDS
// =============================================================================

function isFloat32ArrayLike(value: unknown): value is Float32Array | number[] {
  if (value instanceof Float32Array && value.length > 0) return true;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') return true;
  return false;
}

// =============================================================================
// EXPORT
// =============================================================================

export default quantumInspiredHandler;
