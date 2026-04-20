/**
 * WebCodecsDepthPipeline — WebCodecs → depth inference for real-time video.
 *
 * **Paths**
 * - **Default:** `VideoFrame` → `createImageBitmap` → `OffscreenCanvas` → `getImageData`
 *   → `DepthEstimationService` (Transformers.js). One CPU readback is required for ONNX/WebGPU ML input today.
 * - **Optional WebGPU upload:** when `gpuDevice` is set and the frame **already matches** the target
 *   width/height (no downscale), uses `GPUQueue.copyExternalImageToTexture` from the `VideoFrame`
 *   (see https://www.w3.org/TR/webgpu/#dom-gpuqueue-copyexternalimagetotexture ) then a single
 *   `copyTextureToBuffer` readback into `ImageData`. This drops the `ImageBitmap` + 2D canvas blit
 *   for that case — a step toward a full GPU-resident depth stack once the model consumes `GPUTexture`.
 *
 * Pipeline (default): VideoDecoder → VideoFrame → bitmap/canvas → DepthEstimationService
 *
 * @see W.157: WebCodecs decode path avoids MediaSource + canvas drawImage for decode
 * @see G.151.01: Decouple video playback rate from VR render rate
 */

import { DepthEstimationService } from './DepthEstimationService';
import type { DepthResult } from './DepthEstimationService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WebCodecsDepthConfig {
  /** Maximum frames to process per second. Default: 30 */
  maxFps: number;
  /** Maximum resolution for depth inference. Default: 512 */
  maxDepthResolution: number;
  /** Temporal smoothing alpha. Default: 0.8 */
  temporalAlpha: number;
  /** Codec to accept. Default: 'vp9' */
  codec: 'h264' | 'vp9' | 'av1';
  /**
   * Optional WebGPU device. When set and the decoded frame size already equals the
   * inference size (no downscale), uploads with copyExternalImageToTexture instead of
   * createImageBitmap + 2D canvas.
   */
  gpuDevice?: GPUDevice;
  /** Frame callback — called with each depth result */
  onFrame?: (result: DepthResult, frameIndex: number, timestamp: number) => void;
  /** Error callback */
  onError?: (error: Error) => void;
}

export interface WebCodecsDepthStats {
  /** Total frames decoded */
  framesDecoded: number;
  /** Total frames processed for depth */
  framesProcessed: number;
  /** Frames skipped (rate limiting) */
  framesSkipped: number;
  /** Average decode time in ms */
  avgDecodeMs: number;
  /** Average depth inference time in ms */
  avgInferenceMs: number;
  /** Pipeline running state */
  running: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WebCodecsDepthConfig = {
  maxFps: 30,
  maxDepthResolution: 512,
  temporalAlpha: 0.8,
  codec: 'vp9',
  onFrame: undefined,
  onError: undefined,
};

const CODEC_STRINGS: Record<string, string> = {
  h264: 'avc1.42E01E',
  vp9: 'vp09.00.10.08',
  av1: 'av01.0.04M.08',
};

/** WebGPU row pitch for copyTextureToBuffer (256-byte aligned). */
export function webgpuBytesPerRowRgba8(widthPx: number): number {
  return 256 * Math.ceil((widthPx * 4) / 256);
}

/**
 * VideoFrame → rgba8unorm texture via copyExternalImageToTexture, then one readback to ImageData.
 * Caller must close `frame` after this resolves (this does not close the frame).
 */
export async function videoFrameToImageDataViaWebGPU(
  device: GPUDevice,
  frame: VideoFrame,
  width: number,
  height: number
): Promise<ImageData> {
  const queue = device.queue;
  const texture = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });
  const bytesPerRow = webgpuBytesPerRowRgba8(width);
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  queue.copyExternalImageToTexture(
    // VideoFrame is valid per WebGPU spec; lib.dom may lag the union type.
    { source: frame as unknown as CanvasImageSource },
    { texture },
    { width, height, depthOrArrayLayers: 1 }
  );

  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture },
    { buffer, bytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 }
  );
  queue.submit([encoder.finish()]);

  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());
  const tight = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    tight.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
  }
  buffer.unmap();
  buffer.destroy();
  texture.destroy();

  return new ImageData(tight, width, height);
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * WebCodecs video depth pipeline (decode → pixels → DepthEstimationService).
 *
 * Uses GPU-accelerated **upload** when `gpuDevice` is provided and no resize is needed;
 * Transformers.js depth still receives `ImageData` until a texture-native path exists.
 *
 * Usage:
 * ```typescript
 * const pipeline = new WebCodecsDepthPipeline();
 * await pipeline.initialize({ onFrame: (depth, idx) => applyDisplacement(depth) });
 * pipeline.feedChunk(encodedVideoChunk);
 * // ... later
 * pipeline.dispose();
 * ```
 */
export class WebCodecsDepthPipeline {
  private decoder: any = null; // VideoDecoder
  private config: WebCodecsDepthConfig;
  private depthService: DepthEstimationService;
  private gpuDevice: GPUDevice | null = null;
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private _running = false;
  private _disposed = false;
  private lastProcessTime = 0;
  private minFrameInterval: number;

  // Stats
  private _framesDecoded = 0;
  private _framesProcessed = 0;
  private _framesSkipped = 0;
  private _totalDecodeMs = 0;
  private _totalInferenceMs = 0;

  constructor(config?: Partial<WebCodecsDepthConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.minFrameInterval = 1000 / this.config.maxFps;
    this.depthService = DepthEstimationService.getInstance({
      maxResolution: this.config.maxDepthResolution,
    });
  }

  /**
   * Check if WebCodecs API is available in the current environment.
   */
  static isSupported(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      'VideoDecoder' in globalThis &&
      'VideoFrame' in globalThis
    );
  }

  /**
   * Initialize the pipeline: set up VideoDecoder and DepthEstimationService.
   */
  async initialize(config?: Partial<WebCodecsDepthConfig>): Promise<void> {
    if (config) Object.assign(this.config, config);
    this.gpuDevice = this.config.gpuDevice ?? null;

    if (!WebCodecsDepthPipeline.isSupported()) {
      throw new Error('WebCodecs API not supported in this browser');
    }

    // Initialize depth estimation service
    await this.depthService.initialize({
      maxResolution: this.config.maxDepthResolution,
    });

    // Create OffscreenCanvas for GPU → pixel data extraction
    this.canvas = new OffscreenCanvas(
      this.config.maxDepthResolution,
      this.config.maxDepthResolution
    );
    this.ctx = this.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    // Create VideoDecoder
    const VideoDecoderClass = (globalThis as unknown as { VideoDecoder: typeof VideoDecoder })
      .VideoDecoder;
    this.decoder = new VideoDecoderClass({
      output: (frame: VideoFrame) => this._handleDecodedFrame(frame),
      error: (err: Error) => {
        this.config.onError?.(err);
      },
    });

    // Configure decoder
    const codecString = CODEC_STRINGS[this.config.codec] ?? CODEC_STRINGS.vp9;
    this.decoder.configure({
      codec: codecString,
      hardwareAcceleration: 'prefer-hardware',
    });

    this._running = true;
  }

  /**
   * Feed an encoded video chunk to the decoder.
   * The chunk will be decoded and processed for depth asynchronously.
   */
  feedChunk(chunk: any /* EncodedVideoChunk */): void {
    if (!this._running || this._disposed || !this.decoder) return;
    if (this.decoder.state !== 'configured') return;
    this.decoder.decode(chunk);
  }

  /**
   * Process a raw VideoFrame directly (for cases where decoding is handled externally).
   */
  async processFrame(frame: any /* VideoFrame */): Promise<DepthResult | null> {
    return this._handleDecodedFrame(frame);
  }

  /**
   * Get pipeline statistics.
   */
  get stats(): WebCodecsDepthStats {
    return {
      framesDecoded: this._framesDecoded,
      framesProcessed: this._framesProcessed,
      framesSkipped: this._framesSkipped,
      avgDecodeMs: this._framesDecoded > 0 ? this._totalDecodeMs / this._framesDecoded : 0,
      avgInferenceMs:
        this._framesProcessed > 0 ? this._totalInferenceMs / this._framesProcessed : 0,
      running: this._running,
    };
  }

  /**
   * Handle a decoded VideoFrame: rate-limit, extract pixels, run depth inference.
   */
  private async _handleDecodedFrame(frame: any): Promise<DepthResult | null> {
    const decodeStart = performance.now();
    this._framesDecoded++;

    // Rate limiting — skip frames if we're processing faster than maxFps
    const now = performance.now();
    if (now - this.lastProcessTime < this.minFrameInterval) {
      this._framesSkipped++;
      frame.close();
      return null;
    }
    this.lastProcessTime = now;

    this._totalDecodeMs += performance.now() - decodeStart;

    try {
      const dw = frame.displayWidth ?? (frame as { codedWidth?: number }).codedWidth ?? 0;
      const dh = frame.displayHeight ?? (frame as { codedHeight?: number }).codedHeight ?? 0;
      const w = Math.min(dw, this.config.maxDepthResolution);
      const h = Math.min(dh, this.config.maxDepthResolution);

      let imageData: ImageData | null = null;

      if (
        this.gpuDevice &&
        dw === w &&
        dh === h &&
        w > 0 &&
        h > 0
      ) {
        try {
          imageData = await videoFrameToImageDataViaWebGPU(this.gpuDevice, frame, w, h);
        } catch {
          imageData = null;
        }
      }

      if (!imageData) {
        const bitmap = await createImageBitmap(frame, {
          resizeWidth: w,
          resizeHeight: h,
          resizeQuality: 'medium',
        });

        if (this.canvas && (this.canvas.width !== w || this.canvas.height !== h)) {
          this.canvas.width = w;
          this.canvas.height = h;
        }

        this.ctx?.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();

        imageData = this.ctx?.getImageData(0, 0, w, h) ?? null;
      }

      if (!imageData) {
        frame.close();
        return null;
      }

      // Run depth estimation
      const inferenceStart = performance.now();
      const result = await this.depthService.estimateDepth(imageData);
      this._totalInferenceMs += performance.now() - inferenceStart;
      this._framesProcessed++;

      // Notify consumer
      this.config.onFrame?.(result, this._framesProcessed, frame.timestamp ?? 0);

      frame.close();
      return result;
    } catch (err) {
      frame.close();
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  /**
   * Flush any remaining frames in the decoder.
   */
  async flush(): Promise<void> {
    if (this.decoder?.state === 'configured') {
      await this.decoder.flush();
    }
  }

  /**
   * Stop the pipeline and release all resources.
   */
  dispose(): void {
    this._disposed = true;
    this._running = false;

    if (this.decoder?.state !== 'closed') {
      try {
        this.decoder?.close();
      } catch {
        // Decoder may already be closed
      }
    }
    this.decoder = null;
    this.gpuDevice = null;
    this.canvas = null;
    this.ctx = null;
  }
}
