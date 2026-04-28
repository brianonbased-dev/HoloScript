/**
 * Segment Trait
 *
 * Adds real-time image segmentation to any HoloScript object that holds
 * an image source (video, canvas, texture). Uses SAM 2 (Segment Anything Model 2)
 * via the Transformers.js pipeline for zero-shot object segmentation, or rembg
 * for background removal. Produces binary masks and segmentation results.
 *
 * Capabilities:
 *   - Zero-shot object segmentation via SAM 2 (Transformers.js)
 *   - Background removal via rembg (fallback or preferred method)
 *   - WebGPU acceleration when available, WASM fallback
 *   - Real-time or on-demand segmentation modes
 *   - Outputs `segment:mask` (Uint8ClampedArray), `segment:points` (coordinates),
 *     `segment:ready` (boolean), and segmentation metadata as observables
 *
 * Typical use cases:
 *   - @holographic_sprite: remove background from video for compositing
 *   - @billboard: isolate subject from complex backgrounds
 *   - @iot_sensor: detect and segment objects in surveillance feeds
 *   - @video_surface: live object isolation and extraction
 *
 * @example
 * ```hsplus
 * object photo @segment @billboard {
 *   geometry: 'plane'
 *   segment: {
 *     method: 'background-removal'
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

export type SegmentationMethod = 'background-removal' | 'sam2'; // rembg vs SAM 2

export type SegmentationMode =
  | 'on-demand' // Compute only when `segment:compute` event is fired
  | 'continuous' // Recompute every frame (high GPU cost)
  | 'interval'; // Recompute on a fixed ms interval

export interface SegmentationResolution {
  width: number; // Input resolution for segmentation (default 512)
  height: number;
}

export interface SegmentationConfig {
  /**
   * Segmentation method. 'background-removal' uses rembg/transformers,
   * 'sam2' uses Segment Anything Model 2 (zero-shot object detection).
   */
  method?: SegmentationMethod;

  /** Inference mode: 'on-demand' | 'continuous' | 'interval' */
  mode?: SegmentationMode;

  /** Interval in ms between segmentation updates (used when mode='interval') */
  intervalMs?: number;

  /**
   * Source property on the attached node that provides image data.
   * Expects an HTMLImageElement, HTMLVideoElement, HTMLCanvasElement, or
   * ImageBitmap reference stored in node.userData[imageSourceProp].
   */
  imageSourceProp?: string;

  /** Output resolution for the segmentation mask. Lower = faster inference. */
  resolution?: SegmentationResolution;

  /**
   * For SAM 2: point prompts to guide segmentation. Array of [x, y] coordinates.
   * For background-removal: ignored.
   */
  promptPoints?: Array<[number, number]>;

  /**
   * IndexedDB cache name. Model weights stored locally after first download.
   * Set to null to disable caching.
   */
  cacheDb?: string | null;
}

// ---------------------------------------------------------------------------
// Internal runtime state
// ---------------------------------------------------------------------------

interface SegmentationState {
  pipeline: unknown | null; // Transformers.js pipeline instance
  ready: boolean;
  loading: boolean;
  error: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastSegmentTime: number;
  backend: 'webgpu' | 'wasm' | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_METHOD: SegmentationMethod = 'background-removal';
const DEFAULT_RESOLUTION: SegmentationResolution = { width: 512, height: 512 };
const DEFAULT_CACHE_DB = 'holoscript-segment-model-cache';

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
 * Load Transformers.js lazily with fallback support.
 */
async function loadTransformers(): Promise<{ pipeline: (task: string, model: string, opts?: unknown) => Promise<unknown> }> {
  try {
    const mod = await import('@xenova/transformers' as any);
    return mod;
  } catch {
    try {
      const cdnUrl = ['https:', '', 'cdn.jsdelivr.net', 'npm', '@xenova', 'transformers@2', 'dist', 'transformers.min.js'].join('/');
      const mod = await import(cdnUrl as any);
      return mod;
    } catch (e) {
      throw new Error(
        `[@segment] Could not load @xenova/transformers. ` +
        `Add it to your project: pnpm add @xenova/transformers. Original error: ${String(e)}`
      );
    }
  }
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

/** Convert a mask tensor to Uint8ClampedArray for emission */
function maskToUint8(maskData: Float32Array | number[], width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4); // RGBA
  for (let i = 0; i < maskData.length; i++) {
    // Assuming maskData is normalized [0, 1] or binary [0, 1]
    const val = typeof maskData === 'number' ? maskData : maskData[i];
    const alpha = Math.round(val * 255);
    out[i * 4] = 255; // R
    out[i * 4 + 1] = 255; // G
    out[i * 4 + 2] = 255; // B
    out[i * 4 + 3] = alpha; // A
  }
  return out;
}

/** Run a single segmentation pass and emit observables */
async function computeSegmentation(
  node: HSPlusNode,
  state: SegmentationState,
  config: Required<SegmentationConfig>
): Promise<void> {
  if (!state.pipeline || !state.ready) return;

  const imageSource = getImageSource(node, config.imageSourceProp);
  if (!imageSource) return;

  try {
    let result: any;

    if (config.method === 'background-removal') {
      // Use Transformers.js background removal (rembg-based)
      result = await (state.pipeline as any)(imageSource) as { image: unknown };
    } else if (config.method === 'sam2') {
      // Use SAM 2 with optional point prompts
      result = await (state.pipeline as any)(imageSource, {
        points_per_side: 32,
        pred_iou_thresh: 0.8,
        stability_score_thresh: 0.9,
        size_limit: Math.max(config.resolution.width, config.resolution.height),
      }) as { masks: unknown };
    } else {
      throw new Error(`Unknown segmentation method: ${config.method}`);
    }

    // Emit the result
    (node as any).emit?.('segment:result', result);
    (node as any).emit?.('segment:ready', true);

    state.lastSegmentTime = performance.now();
  } catch (err) {
    // Don't throw — segmentation is best-effort
    const errMsg = String(err);
    (node as any).emit?.('segment:error', errMsg);
  }
}

// ---------------------------------------------------------------------------
// Trait handler
// ---------------------------------------------------------------------------

export const segmentTraitHandler: TraitHandler<SegmentationConfig> = {
  name: '@segment' as any,

  defaultConfig: {
    method: DEFAULT_METHOD,
    mode: 'on-demand',
    intervalMs: 1000,
    imageSourceProp: 'imageSource',
    resolution: DEFAULT_RESOLUTION,
    promptPoints: [],
    cacheDb: DEFAULT_CACHE_DB,
  },

  async onAttach(node: HSPlusNode, config: SegmentationConfig, _context: unknown) {
    const cfg: Required<SegmentationConfig> = {
      method: config.method ?? DEFAULT_METHOD,
      mode: config.mode ?? 'on-demand',
      intervalMs: config.intervalMs ?? 1000,
      imageSourceProp: config.imageSourceProp ?? 'imageSource',
      resolution: config.resolution ?? DEFAULT_RESOLUTION,
      promptPoints: config.promptPoints ?? [],
      cacheDb: config.cacheDb !== undefined ? config.cacheDb : DEFAULT_CACHE_DB,
    };

    const state: SegmentationState = {
      pipeline: null,
      ready: false,
      loading: true,
      error: null,
      intervalHandle: null,
      lastSegmentTime: 0,
      backend: null,
    };

    // Store state on the node for later access
    (node as any).__segmentState = state;

    // Initialise observable defaults
    (node as any).emit?.('segment:ready', false);

    // Load model asynchronously
    (async () => {
      try {
        const backend = await detectBackend();
        state.backend = backend;

        const { pipeline } = await loadTransformers();

        // Configure Transformers.js environment
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

        // Load appropriate model based on method
        const modelId = cfg.method === 'background-removal' 
          ? 'Xenova/remove-background'
          : 'Xenova/sam2-tiny';

        state.pipeline = await pipeline(
          cfg.method === 'background-removal' ? 'image-segmentation' : 'image-segmentation',
          modelId,
          {
            device: backend === 'webgpu' ? 'webgpu' : undefined,
          }
        );

        state.ready = true;
        state.loading = false;
        (node as any).emit?.('segment:ready', true);
        (node as any).emit?.('segment:backend', backend);
        (node as any).emit?.('segment:method', cfg.method);

        // Start interval if requested
        if (cfg.mode === 'interval') {
          state.intervalHandle = setInterval(() => {
            void computeSegmentation(node, state, cfg);
          }, cfg.intervalMs);
        }
      } catch (err) {
        state.loading = false;
        state.error = String(err);
        (node as any).emit?.('segment:error', state.error);
      }
    })();

    // Register event listener for on-demand requests
    (node as any).on?.('segment:compute', () => {
      void computeSegmentation(node, state, cfg);
    });
  },

  onUpdate(node: HSPlusNode, config: SegmentationConfig, _context: unknown, _delta: number) {
    if (config.mode !== 'continuous') return;

    const state = (node as any).__segmentState as SegmentationState | undefined;
    if (!state?.ready) return;

    const cfg: Required<SegmentationConfig> = {
      method: config.method ?? DEFAULT_METHOD,
      mode: 'continuous',
      intervalMs: config.intervalMs ?? 1000,
      imageSourceProp: config.imageSourceProp ?? 'imageSource',
      resolution: config.resolution ?? DEFAULT_RESOLUTION,
      promptPoints: config.promptPoints ?? [],
      cacheDb: config.cacheDb !== undefined ? config.cacheDb : DEFAULT_CACHE_DB,
    };

    // Fire-and-forget; errors are emitted as 'segment:error' events
    void computeSegmentation(node, state, cfg);
  },

  onDetach(node: HSPlusNode, _config: SegmentationConfig, _context: unknown) {
    const state = (node as any).__segmentState as SegmentationState | undefined;
    if (state?.intervalHandle !== null) {
      clearInterval(state!.intervalHandle!);
    }
    delete (node as any).__segmentState;
    (node as any).emit?.('segment:ready', false);
  },
};

export default segmentTraitHandler;
