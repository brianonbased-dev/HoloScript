/**
 * WebCodecsDepthPipeline — Zero-copy GPU pipeline for real-time video depth.
 *
 * Uses the WebCodecs API (VideoDecoder + VideoFrame) to keep frames on the GPU,
 * avoiding CPU round-trips during depth estimation. Decodes video frames directly
 * into GPU-backed VideoFrame objects, processes depth via the DepthEstimationService,
 * and outputs depth-displaced frames at the source framerate.
 *
 * Pipeline: VideoDecoder → VideoFrame → createImageBitmap → OffscreenCanvas
 *           → DepthEstimationService → DepthResult stream
 *
 * @see W.157: WebCodecs zero-copy is 3-5x faster than MediaSource + canvas drawImage
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

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Zero-copy video depth pipeline using WebCodecs API.
 *
 * Keeps frames on the GPU path (VideoFrame → ImageBitmap → OffscreenCanvas)
 * and only reads pixel data for depth inference at reduced resolution.
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
    const VideoDecoderClass = (globalThis as unknown as { VideoDecoder: typeof VideoDecoder }).VideoDecoder;
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
      // Zero-copy path: VideoFrame → createImageBitmap → OffscreenCanvas → ImageData
      const bitmap = await createImageBitmap(frame);
      const w = Math.min(bitmap.width, this.config.maxDepthResolution);
      const h = Math.min(bitmap.height, this.config.maxDepthResolution);

      // Resize canvas if needed
      if (this.canvas && (this.canvas.width !== w || this.canvas.height !== h)) {
        this.canvas.width = w;
        this.canvas.height = h;
      }

      // Draw bitmap to canvas (GPU-backed transfer)
      this.ctx?.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();

      // Extract pixel data for depth inference
      const imageData = this.ctx?.getImageData(0, 0, w, h);
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
    this.canvas = null;
    this.ctx = null;
  }
}

