/**
 * Depth Estimation Trait
 *
 * Adds monocular depth estimation to any HoloScript object that holds
 * an image source (video, canvas, texture). Uses Depth Anything V2 Small
 * via the Transformers.js pipeline to produce a per-pixel depth map in
 * real-time or on-demand.
 *
 * Capabilities:
 *   - Monocular depth from a single 2D image / video frame
 *   - WebGPU acceleration when available, WASM fallback otherwise
 *   - IndexedDB caching of model weights (first load only)
 *   - Outputs `depth:map` (Float32Array), `depth:normalized` (Uint8ClampedArray),
 *     and `depth:ready` (boolean) as observable properties
 *
 * Typical use cases:
 *   - @holographic_sprite: flatten 2D media into a parallax depth layer
 *   - @iot_sensor: derive depth from surveillance camera feeds
 *   - @video_surface: live-scene depth sensing for occlusion mixing
 *
 * @example
 * ```hsplus
 * object photo @depth_estimation @billboard {
 *   geometry: 'plane'
 *   depthEstimation: {
 *     modelId: 'Xenova/depth-anything-small-hf'
 *     mode: 'continuous'
 *     resolution: { width: 512, height: 512 }
 *   }
 * }
 * ```
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DepthEstimationMode =
  | 'on-demand' // Compute only when `depth:compute` event is fired
  | 'continuous' // Recompute every frame (high GPU cost)
  | 'interval'; // Recompute on a fixed ms interval

export interface DepthResolution {
  width: number; // Input resolution sent to the model (default 518)
  height: number;
}

export interface DepthEstimationConfig {
  /**
   * Transformers.js model ID. Defaults to Depth Anything V2 Small.
   * Larger variants: 'Xenova/depth-anything-v2-base-hf'
   */
  modelId?: string;

  /** Inference mode: 'on-demand' | 'continuous' | 'interval' */
  mode?: DepthEstimationMode;

  /** Interval in ms between depth map updates (used when mode='interval') */
  intervalMs?: number;

  /**
   * Source property on the attached node that provides image data.
   * Expects an HTMLImageElement, HTMLVideoElement, HTMLCanvasElement, or
   * ImageBitmap reference stored in node.userData[imageSourceProp].
   */
  imageSourceProp?: string;

  /** Output resolution for the depth map. Lower = faster inference. */
  resolution?: DepthResolution;

  /**
   * When true, normalise the raw depth map to [0, 255] and emit as
   * `depth:normalized` (Uint8ClampedArray) alongside the raw Float32Array.
   */
  emitNormalized?: boolean;

  /**
   * IndexedDB cache name. Weights are stored locally after first download.
   * Set to null to disable caching (useful in ephemeral environments).
   */
  cacheDb?: string | null;
}

// ---------------------------------------------------------------------------
// Internal runtime state
// ---------------------------------------------------------------------------

interface DepthEstimationState {
  pipeline: unknown | null; // Transformers.js pipeline instance
  ready: boolean;
  loading: boolean;
  error: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastComputeTime: number;
  backend: 'webgpu' | 'wasm' | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_ID = 'Xenova/depth-anything-small-hf';
const DEFAULT_RESOLUTION: DepthResolution = { width: 518, height: 518 };
const DEFAULT_CACHE_DB = 'holoscript-depth-model-cache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect available backend for Transformers.js */
async function detectBackend(): Promise<'webgpu' | 'wasm'> {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      // Fall through to WASM
    }
  }
  return 'wasm';
}

/**
 * Load Transformers.js lazily. In browser environments the package is
 * expected to be available as a dynamic import from 'npm:@xenova/transformers'
 * or a bundled alias. In Node.js test environments a graceful fallback is used.
 */
async function loadTransformers(): Promise<{ pipeline: (task: string, model: string, opts?: unknown) => Promise<unknown> }> {
  try {
    // Dynamic import keeps Transformers.js out of the main bundle unless this
    // trait is actually attached at runtime.
    const mod = await import('@xenova/transformers' as any);
    return mod;
  } catch {
    // Fallback: attempt global or CDN path used in some build setups.
    // The /* webpackIgnore: true */ magic comment tells webpack to leave
    // this dynamic import alone — without it webpack tries to RESOLVE the
    // HTTPS URL at build time and dies with UnhandledSchemeError. Verified
    // 2026-04-25 against Railway studio deployment aabc0e6d.
    try {
      const cdnUrl = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.min.js';
      const mod = await import(/* webpackIgnore: true */ cdnUrl as any);
      return mod;
    } catch (e) {
      throw new Error(
        `[@depth_estimation] Could not load @xenova/transformers. ` +
        `Add it to your project: pnpm add @xenova/transformers. Original error: ${String(e)}`
      );
    }
  }
}

/** Normalise a Float32Array depth map to Uint8ClampedArray [0, 255] */
function normalizeDepthMap(raw: Float32Array): Uint8ClampedArray {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }
  const range = max - min || 1;
  const out = new Uint8ClampedArray(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = Math.round(((raw[i] - min) / range) * 255);
  }
  return out;
}

/** Pull the image source from the node's userData map */
function getImageSource(
  node: HSPlusNode,
  imageSourceProp: string
): HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap | null {
  const userData = (node as any).userData as Record<string, unknown> | undefined;
  if (!userData) return null;
  const src = userData[imageSourceProp];
  if (
    src instanceof HTMLImageElement ||
    src instanceof HTMLVideoElement ||
    src instanceof HTMLCanvasElement ||
    (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap)
  ) {
    return src as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;
  }
  return null;
}

/** Run a single depth-estimation pass and emit observables */
async function computeDepth(
  node: HSPlusNode,
  state: DepthEstimationState,
  config: Required<DepthEstimationConfig>
): Promise<void> {
  if (!state.pipeline || !state.ready) return;

  const imageSource = getImageSource(node, config.imageSourceProp);
  if (!imageSource) return;

  try {
    const result = await (state.pipeline as any)(imageSource, {
      size: { width: config.resolution.width, height: config.resolution.height },
    }) as { depth: { data: Float32Array } };

    const depthMap: Float32Array = result.depth.data;
    (node as any).emit?.('depth:map', depthMap);

    if (config.emitNormalized) {
      const normalized = normalizeDepthMap(depthMap);
      (node as any).emit?.('depth:normalized', normalized);
    }

    state.lastComputeTime = performance.now();
  } catch (err) {
    // Don't throw — depth estimation is best-effort
    const errMsg = String(err);
    (node as any).emit?.('depth:error', errMsg);
  }
}

// ---------------------------------------------------------------------------
// Trait handler
// ---------------------------------------------------------------------------

export const depthEstimationTraitHandler: TraitHandler<DepthEstimationConfig> = {
  name: '@depth_estimation' as any,

  defaultConfig: {
    modelId: DEFAULT_MODEL_ID,
    mode: 'on-demand',
    intervalMs: 1000,
    imageSourceProp: 'imageSource',
    resolution: DEFAULT_RESOLUTION,
    emitNormalized: true,
    cacheDb: DEFAULT_CACHE_DB,
  },

  async onAttach(node: HSPlusNode, config: DepthEstimationConfig, _context: unknown) {
    const cfg: Required<DepthEstimationConfig> = {
      modelId: config.modelId ?? DEFAULT_MODEL_ID,
      mode: config.mode ?? 'on-demand',
      intervalMs: config.intervalMs ?? 1000,
      imageSourceProp: config.imageSourceProp ?? 'imageSource',
      resolution: config.resolution ?? DEFAULT_RESOLUTION,
      emitNormalized: config.emitNormalized ?? true,
      cacheDb: config.cacheDb !== undefined ? config.cacheDb : DEFAULT_CACHE_DB,
    };

    const state: DepthEstimationState = {
      pipeline: null,
      ready: false,
      loading: true,
      error: null,
      intervalHandle: null,
      lastComputeTime: 0,
      backend: null,
    };

    // Store state on the node for later access
    (node as any).__depthEstimationState = state;

    // Initialise observable defaults
    (node as any).emit?.('depth:ready', false);

    // Load model asynchronously
    (async () => {
      try {
        const backend = await detectBackend();
        state.backend = backend;

        const { pipeline } = await loadTransformers();

        // Configure Transformers.js environment for the detected backend.
        // We use a try/catch so missing env APIs (e.g. in tests) don't break.
        try {
          const { env } = await import('@xenova/transformers' as any);
          if (cfg.cacheDb !== null) {
            env.useBrowserCache = true;
            env.cacheDir = cfg.cacheDb;
          }
          if (backend === 'webgpu') {
            env.backends.onnx.wasm.proxy = false;
          }
        } catch { /* environment config is best-effort */ }

        state.pipeline = await pipeline('depth-estimation', cfg.modelId, {
          device: backend === 'webgpu' ? 'webgpu' : undefined,
        });

        state.ready = true;
        state.loading = false;
        (node as any).emit?.('depth:ready', true);
        (node as any).emit?.('depth:backend', backend);

        // Start interval if requested
        if (cfg.mode === 'interval') {
          state.intervalHandle = setInterval(() => {
            void computeDepth(node, state, cfg);
          }, cfg.intervalMs);
        }
      } catch (err) {
        state.loading = false;
        state.error = String(err);
        (node as any).emit?.('depth:error', state.error);
      }
    })();

    // Register event listener for on-demand requests
    (node as any).on?.('depth:compute', () => {
      void computeDepth(node, state, cfg);
    });
  },

  onUpdate(node: HSPlusNode, config: DepthEstimationConfig, _context: unknown, _delta: number) {
    if (config.mode !== 'continuous') return;

    const state = (node as any).__depthEstimationState as DepthEstimationState | undefined;
    if (!state?.ready) return;

    const cfg: Required<DepthEstimationConfig> = {
      modelId: config.modelId ?? DEFAULT_MODEL_ID,
      mode: 'continuous',
      intervalMs: config.intervalMs ?? 1000,
      imageSourceProp: config.imageSourceProp ?? 'imageSource',
      resolution: config.resolution ?? DEFAULT_RESOLUTION,
      emitNormalized: config.emitNormalized ?? true,
      cacheDb: config.cacheDb !== undefined ? config.cacheDb : DEFAULT_CACHE_DB,
    };

    // Fire-and-forget; errors are emitted as 'depth:error' events
    void computeDepth(node, state, cfg);
  },

  onDetach(node: HSPlusNode, _config: DepthEstimationConfig, _context: unknown) {
    const state = (node as any).__depthEstimationState as DepthEstimationState | undefined;
    if (state?.intervalHandle !== null) {
      clearInterval(state.intervalHandle!);
    }
    delete (node as any).__depthEstimationState;
    (node as any).emit?.('depth:ready', false);
  },
};

export default depthEstimationTraitHandler;
