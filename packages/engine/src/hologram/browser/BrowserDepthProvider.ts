/**
 * BrowserDepthProvider — DepthProvider backed by Transformers.js + WebGPU/WASM.
 *
 * Adapts {@link DepthEstimationService} (browser-native depth estimation
 * singleton) to the {@link DepthProvider} interface consumed by
 * {@link createHologram}. Sprint 0a.2 deliverable.
 *
 * Backend selection:
 *   - WebGPU when `navigator.gpu` is present (preferred — ~3× faster)
 *   - WASM when `WebAssembly` is present
 *   - 'cpu' luminance placeholder when Transformers.js is not installed
 *     (returned by the underlying service)
 *
 * Image decode:
 *   - Default: `createImageBitmap(Blob)` → `OffscreenCanvas` → `getImageData`
 *   - Configurable via {@link BrowserDepthProviderConfig.imageDecoder} for
 *     deterministic tests + Node fallbacks (no canvas in node-vitest).
 *
 * GIF / video sources:
 *   - Sprint 0a.2 ships single-frame paths only. Multi-frame inputs degrade
 *     to "decode the first frame" with `frames: 1` in the result. Multi-
 *     frame depth lands in Sprint 0b (GIF decompose + WebCodecs video).
 *
 * @see W.148: Browser-native depth estimation is production-ready
 * @see D.019: HoloGram product line
 * @see F.016: Scope discipline — Sprint 0a.2 = providers only, no orchestration shift
 */

import {
  DepthEstimationService,
  type DepthBackend,
  type DepthEstimationConfig,
} from '../DepthEstimationService';
import type {
  DepthInferenceResult,
  DepthProvider,
} from '../createHologram';
import type { HologramSourceKind } from '../HologramBundle';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Decoded pixel buffer in canvas-native ImageData shape. Provider input.
 */
export interface DecodedImage {
  /** RGBA8 pixel data, row-major, length = width * height * 4 */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Pluggable image decoder. Receives raw bytes + source kind, returns
 * RGBA8 pixels. Implementations MUST NOT mutate the input bytes.
 */
export type ImageDecoder = (
  media: Uint8Array,
  sourceKind: HologramSourceKind
) => Promise<DecodedImage>;

export interface BrowserDepthProviderConfig {
  /** Override the singleton DepthEstimationService — useful for tests */
  service?: DepthEstimationService;
  /**
   * Override the default image decoder. The default uses `createImageBitmap`
   * + `OffscreenCanvas`, which is unavailable in Node test environments.
   * Tests inject a deterministic synthetic decoder.
   */
  imageDecoder?: ImageDecoder;
  /**
   * Forwarded to {@link DepthEstimationService.initialize} on first use.
   * If undefined and the service is uninitialized, defaults are used.
   */
  estimationConfig?: DepthEstimationConfig;
  /**
   * When true, skip the lazy `service.initialize()` call. Use this when
   * the caller has already initialized the singleton and wants a strict
   * "no side effects" provider. Default: false.
   */
  skipInitialize?: boolean;
}

// ── Default decoder (browser) ────────────────────────────────────────────────

/**
 * Default browser image decoder. Uses `createImageBitmap(Blob)` then
 * `OffscreenCanvas.getContext('2d').drawImage` + `getImageData`.
 *
 * Throws a descriptive error if the canvas APIs are unavailable so the
 * orchestrator's `depth_failed` wrapper carries a useful message instead
 * of a cryptic `is not a function`. Tests must inject `imageDecoder`.
 */
export const defaultBrowserImageDecoder: ImageDecoder = async (
  media,
  sourceKind
) => {
  if (typeof createImageBitmap !== 'function') {
    throw new Error(
      `BrowserDepthProvider: createImageBitmap is unavailable in this runtime ` +
        `(sourceKind=${sourceKind}). Inject BrowserDepthProviderConfig.imageDecoder for headless environments.`
    );
  }
  if (typeof OffscreenCanvas !== 'function') {
    throw new Error(
      `BrowserDepthProvider: OffscreenCanvas is unavailable in this runtime ` +
        `(sourceKind=${sourceKind}). Inject BrowserDepthProviderConfig.imageDecoder for headless environments.`
    );
  }

  // Convert Uint8Array to a Blob with a plausible MIME type so
  // createImageBitmap doesn't sniff in unexpected ways. The actual MIME is
  // irrelevant for createImageBitmap, but typing it correctly helps DevTools.
  const mime =
    sourceKind === 'gif' ? 'image/gif' : sourceKind === 'video' ? 'video/mp4' : 'image/png';
  // Copy buffer into a fresh ArrayBuffer so the Blob doesn't retain a
  // reference to the caller's underlying allocation.
  const blob = new Blob([media.slice().buffer], { type: mime });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('BrowserDepthProvider: OffscreenCanvas 2d context unavailable');
    }
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      data: imgData.data,
      width: imgData.width,
      height: imgData.height,
    };
  } finally {
    // Release the GPU-side bitmap promptly — long-running encoders accumulate.
    if (typeof bitmap.close === 'function') bitmap.close();
  }
};

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * BrowserDepthProvider — implementation of {@link DepthProvider} using the
 * browser-native {@link DepthEstimationService} (Transformers.js + WebGPU).
 *
 * Stateless aside from the underlying singleton. Constructing the provider
 * does NOT initialize the depth model — initialization is lazy on first
 * `infer()` call so that orchestrators which never call `infer()` (e.g.,
 * tests that exercise validation paths) don't pay the model-download cost.
 */
export class BrowserDepthProvider implements DepthProvider {
  private readonly service: DepthEstimationService;
  private readonly imageDecoder: ImageDecoder;
  private readonly estimationConfig: DepthEstimationConfig | undefined;
  private readonly skipInitialize: boolean;
  private initPromise: Promise<void> | null = null;

  constructor(config: BrowserDepthProviderConfig = {}) {
    this.service = config.service ?? DepthEstimationService.getInstance(config.estimationConfig);
    this.imageDecoder = config.imageDecoder ?? defaultBrowserImageDecoder;
    this.estimationConfig = config.estimationConfig;
    this.skipInitialize = config.skipInitialize ?? false;
  }

  async infer(
    media: Uint8Array,
    sourceKind: HologramSourceKind
  ): Promise<DepthInferenceResult> {
    if (!media || media.byteLength === 0) {
      throw new Error('BrowserDepthProvider: media must be non-empty bytes');
    }

    // 1. Decode media bytes -> RGBA8 pixels
    const decoded = await this.imageDecoder(media, sourceKind);

    if (
      !decoded ||
      !decoded.data ||
      !Number.isInteger(decoded.width) ||
      decoded.width <= 0 ||
      !Number.isInteger(decoded.height) ||
      decoded.height <= 0
    ) {
      throw new Error(
        `BrowserDepthProvider: decoder returned an invalid frame (sourceKind=${sourceKind})`
      );
    }
    const expected = decoded.width * decoded.height * 4;
    if (decoded.data.length !== expected) {
      throw new Error(
        `BrowserDepthProvider: decoded.data is ${decoded.data.length} bytes, ` +
          `expected ${expected} for ${decoded.width}x${decoded.height} RGBA8`
      );
    }

    // 2. Lazy-initialize the depth pipeline (no-op if already done)
    if (!this.skipInitialize && !this.service.initialized) {
      if (!this.initPromise) {
        this.initPromise = this.service.initialize(this.estimationConfig);
      }
      await this.initPromise;
    }

    // 3. Run depth estimation
    const result = await this.service.estimateDepth(decoded);

    // 4. Resolve modelId (DepthEstimationService doesn't currently expose it
    // post-init, but the constructor stores it; fall back to the canonical
    // default to keep the bundle hash stable).
    const modelId = this.resolveModelId();

    // 5. Adapt to DepthInferenceResult — note that we deliberately drop the
    // service's normalMap; createHologram derives normals via Sobel on its
    // own canonical depth bytes (W.155 — zero extra inference cost).
    return {
      depthMap: result.depthMap,
      width: result.width,
      height: result.height,
      frames: 1, // Sprint 0a.2: single-frame only; multi-frame in Sprint 0b
      backend: this.adaptBackend(result.backend),
      modelId,
    };
  }

  /**
   * Reach into the service's private config to surface the modelId. The
   * service exposes `backend` publicly but not `modelId`; we read it via
   * the constructor-stored config object on the singleton. This is
   * intentional: we want the bundle's `meta.modelId` to reflect what the
   * service actually used, not a hard-coded constant.
   */
  private resolveModelId(): string {
    // The service stores its resolved config as `private config` — accessing
    // it via index keeps us decoupled from the concrete class shape (and
    // works whether the field is renamed to a getter later).
    const cfg = (this.service as unknown as { config?: { modelId?: string } }).config;
    return (
      cfg?.modelId ??
      this.estimationConfig?.modelId ??
      'depth-anything/Depth-Anything-V2-Small-hf'
    );
  }

  /**
   * Adapt the service's backend type to the bundle's backend type. The
   * service uses `'webgpu' | 'wasm' | 'cpu'`; the bundle adds
   * `'onnxruntime-node'` for the Node-side path (Sprint 0c). Browser paths
   * always emit one of the first three.
   */
  private adaptBackend(backend: DepthBackend): DepthInferenceResult['backend'] {
    return backend;
  }
}
