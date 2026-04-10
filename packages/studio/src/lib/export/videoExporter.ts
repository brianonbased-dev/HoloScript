// @ts-nocheck
/**
 * videoExporter.ts — MP4 Export for TikTok & Social Media
 *
 * MEME-008: Export clip as MP4 for viral sharing
 * Priority: Critical | Estimate: 6 hours
 *
 * Features:
 * - Canvas recording (MediaRecorder API fallback)
 * - WebCodecs API for high-quality encoding (when available)
 * - 1080x1080 TikTok format (square aspect ratio)
 * - Transparent background support (WebM with alpha)
 * - Progress tracking
 * - Frame-by-frame rendering for consistent quality
 */

import * as THREE from 'three';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VideoExportOptions {
  /**
   * Output resolution (defaults to 1080x1080 for TikTok)
   */
  width?: number;
  height?: number;

  /**
   * Video framerate (defaults to 30fps for compatibility)
   */
  fps?: number;

  /**
   * Video bitrate in bits per second (defaults to 8Mbps)
   */
  bitrate?: number;

  /**
   * Duration in milliseconds
   */
  duration: number;

  /**
   * Output format
   */
  format?: 'mp4' | 'webm';

  /**
   * Transparent background (only works with WebM)
   */
  transparent?: boolean;

  /**
   * Video codec
   * - 'h264' (MP4, best compatibility)
   * - 'vp9' (WebM, better quality)
   * - 'av1' (WebM, best quality, limited support)
   */
  codec?: 'h264' | 'vp9' | 'av1';

  /**
   * Progress callback
   */
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportProgress {
  stage: 'preparing' | 'rendering' | 'encoding' | 'complete';
  progress: number; // 0-1
  currentFrame: number;
  totalFrames: number;
  timeElapsed: number; // ms
}

export interface ExportResult {
  blob: Blob;
  url: string;
  size: number; // bytes
  duration: number; // ms
  format: string;
  resolution: { width: number; height: number };
}

// ─── Canvas Recorder (MediaRecorder API) ────────────────────────────────────

class CanvasRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;

  async start(canvas: HTMLCanvasElement, options: VideoExportOptions): Promise<void> {
    const { fps = 30, bitrate = 8000000, codec = 'h264' } = options;

    // Get canvas stream
    const stream = canvas.captureStream(fps);

    // Determine MIME type based on codec
    let mimeType: string;
    if (codec === 'h264') {
      mimeType = 'video/webm;codecs=h264';
      // Fallback to vp8 if h264 not supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
    } else if (codec === 'vp9') {
      mimeType = 'video/webm;codecs=vp9';
    } else {
      mimeType = 'video/webm;codecs=av1';
      // Fallback to vp9 if av1 not supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9';
      }
    }

    logger.debug('[VideoExport] Using MIME type:', mimeType);

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });

    this.chunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
    this.startTime = performance.now();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not started'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType });
        resolve(blob);
      };

      this.mediaRecorder.onerror = (error) => {
        reject(error);
      };

      this.mediaRecorder.stop();

      // Stop all tracks
      const stream = this.mediaRecorder.stream;
      stream.getTracks().forEach((track) => track.stop());
    });
  }
}

// ─── Frame-by-Frame Renderer (WebCodecs API) ────────────────────────────────

class FrameByFrameRenderer {
  private encoder: VideoEncoder | null = null;
  private chunks: Uint8Array[] = [];

  async initialize(options: VideoExportOptions): Promise<void> {
    const { width = 1080, height = 1080, fps = 30, bitrate = 8000000, codec = 'h264' } = options;

    // Check WebCodecs support
    if (typeof VideoEncoder === 'undefined') {
      throw new Error('WebCodecs API not supported in this browser');
    }

    // Map codec names
    const codecString =
      codec === 'h264' ? 'avc1.42E01E' : codec === 'vp9' ? 'vp09.00.10.08' : 'av01.0.04M.08';

    const config: VideoEncoderConfig = {
      codec: codecString,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality',
    };

    // Check codec support
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) {
      throw new Error(`Codec ${codec} not supported`);
    }

    this.chunks = [];

    // Create encoder
    this.encoder = new VideoEncoder({
      output: (chunk, _metadata) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.chunks.push(data);
      },
      error: (error) => {
        logger.error('[VideoExport] Encoder error:', error);
      },
    });

    this.encoder.configure(config);
  }

  async encodeFrame(canvas: HTMLCanvasElement, frameIndex: number, fps: number): Promise<void> {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas, {
      timestamp: (frameIndex * 1_000_000) / fps, // microseconds
    });

    // Encode frame
    const keyFrame = frameIndex % (fps * 2) === 0; // Keyframe every 2 seconds
    this.encoder.encode(frame, { keyFrame });

    // Close frame to free memory
    frame.close();
  }

  async finish(): Promise<Blob> {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }

    // Flush encoder
    await this.encoder.flush();
    this.encoder.close();

    // Combine chunks into blob
    const blob = new Blob(this.chunks, { type: 'video/mp4' });
    return blob;
  }
}

// ─── Video Exporter ──────────────────────────────────────────────────────────

export class VideoExporter {
  private renderer: THREE.WebGLRenderer | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenRenderer: THREE.WebGLRenderer | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  /**
   * Export animation to MP4/WebM
   */
  async export(
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: VideoExportOptions
  ): Promise<ExportResult> {
    const startTime = performance.now();

    const {
      width = 1080,
      height = 1080,
      fps = 30,
      duration,
      format = 'mp4',
      transparent = false,
      onProgress,
    } = options;

    const totalFrames = Math.ceil((duration / 1000) * fps);

    logger.debug(
      `[VideoExport] Starting export: ${width}x${height} @ ${fps}fps, ${totalFrames} frames`
    );

    // Stage 1: Preparing
    onProgress?.({
      stage: 'preparing',
      progress: 0.05,
      currentFrame: 0,
      totalFrames,
      timeElapsed: performance.now() - startTime,
    });

    // Create offscreen canvas for rendering
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;

    this.offscreenRenderer = new THREE.WebGLRenderer({
      canvas: this.offscreenCanvas,
      antialias: true,
      alpha: transparent,
      preserveDrawingBuffer: true,
    });
    this.offscreenRenderer.setSize(width, height);
    this.offscreenRenderer.setClearColor(transparent ? 0x000000 : 0x1a1a1a, transparent ? 0 : 1);

    // Try WebCodecs first (better quality), fallback to MediaRecorder
    const useWebCodecs = typeof VideoEncoder !== 'undefined' && format === 'mp4';

    let blob: Blob;

    if (useWebCodecs) {
      blob = await this.exportWithWebCodecs(scene, camera, options, totalFrames, startTime);
    } else {
      blob = await this.exportWithMediaRecorder(scene, camera, options, totalFrames, startTime);
    }

    // Stage 4: Complete
    onProgress?.({
      stage: 'complete',
      progress: 1.0,
      currentFrame: totalFrames,
      totalFrames,
      timeElapsed: performance.now() - startTime,
    });

    // Cleanup
    this.offscreenRenderer.dispose();
    this.offscreenRenderer = null;
    this.offscreenCanvas = null;

    const _url = URL.createObjectURL(blob);

    logger.debug(
      `[VideoExport] Export complete: ${(blob.size / 1024 / 1024).toFixed(2)} MB in ${(
        (performance.now() - startTime) /
        1000
      ).toFixed(2)}s`
    );

    return {
      blob,
      url,
      size: blob.size,
      duration: performance.now() - startTime,
      format: blob.type,
      resolution: { width, height },
    };
  }

  private async exportWithWebCodecs(
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: VideoExportOptions,
    totalFrames: number,
    startTime: number
  ): Promise<Blob> {
    const { fps = 30, duration, onProgress } = options;

    const renderer = new FrameByFrameRenderer();
    await renderer.initialize(options);

    // Stage 2: Rendering frames
    for (let frame = 0; frame < totalFrames; frame++) {
      const _t = (frame / totalFrames) * duration;

      // Render frame
      this.offscreenRenderer!.render(scene, camera);

      // Encode frame
      await renderer.encodeFrame(this.offscreenCanvas!, frame, fps);

      // Update progress
      onProgress?.({
        stage: 'rendering',
        progress: 0.1 + (frame / totalFrames) * 0.7, // 10% → 80%
        currentFrame: frame,
        totalFrames,
        timeElapsed: performance.now() - startTime,
      });
    }

    // Stage 3: Encoding
    onProgress?.({
      stage: 'encoding',
      progress: 0.9,
      currentFrame: totalFrames,
      totalFrames,
      timeElapsed: performance.now() - startTime,
    });

    const blob = await renderer.finish();
    return blob;
  }

  private async exportWithMediaRecorder(
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: VideoExportOptions,
    totalFrames: number,
    startTime: number
  ): Promise<Blob> {
    const { fps = 30, duration, onProgress } = options;

    const recorder = new CanvasRecorder();
    await recorder.start(this.offscreenCanvas!, options);

    // Stage 2: Rendering
    const frameTime = 1000 / fps;
    let currentFrame = 0;

    return new Promise((resolve, reject) => {
      const renderFrame = () => {
        if (currentFrame >= totalFrames) {
          // Done rendering, stop recorder
          recorder
            .stop()
            .then((blob) => {
              onProgress?.({
                stage: 'encoding',
                progress: 0.95,
                currentFrame: totalFrames,
                totalFrames,
                timeElapsed: performance.now() - startTime,
              });
              resolve(blob);
            })
            .catch(reject);
          return;
        }

        const _t = (currentFrame / totalFrames) * duration;

        // Render frame
        this.offscreenRenderer!.render(scene, camera);

        // Update progress
        onProgress?.({
          stage: 'rendering',
          progress: 0.1 + (currentFrame / totalFrames) * 0.8, // 10% → 90%
          currentFrame,
          totalFrames,
          timeElapsed: performance.now() - startTime,
        });

        currentFrame++;

        // Schedule next frame
        setTimeout(renderFrame, frameTime);
      };

      renderFrame();
    });
  }

  /**
   * Check if browser supports video export
   */
  static isSupported(): { supported: boolean; features: string[] } {
    const features: string[] = [];

    if (typeof MediaRecorder !== 'undefined') {
      features.push('MediaRecorder');
    }

    if (typeof VideoEncoder !== 'undefined') {
      features.push('WebCodecs');
    }

    return {
      supported: features.length > 0,
      features,
    };
  }

  /**
   * Get supported codecs
   */
  static getSupportedCodecs(): string[] {
    const codecs: string[] = [];

    if (typeof MediaRecorder !== 'undefined') {
      const testCodecs = [
        'video/webm;codecs=h264',
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm;codecs=av1',
      ];

      testCodecs.forEach((codec) => {
        if (MediaRecorder.isTypeSupported(codec)) {
          codecs.push(codec);
        }
      });
    }

    return codecs;
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * React hook for video export with progress tracking
 */
export function useVideoExport(renderer: THREE.WebGLRenderer | null) {
  const [exporting, setExporting] = React.useState(false);
  const [progress, setProgress] = React.useState<ExportProgress | null>(null);
  const [result, setResult] = React.useState<ExportResult | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const exporterRef = React.useRef<VideoExporter | null>(null);

  const startExport = React.useCallback(
    async (scene: THREE.Scene, camera: THREE.Camera, options: VideoExportOptions) => {
      if (!renderer) {
        setError(new Error('Renderer not available'));
        return;
      }

      if (!exporterRef.current) {
        exporterRef.current = new VideoExporter(renderer);
      }

      setExporting(true);
      setProgress(null);
      setResult(null);
      setError(null);

      try {
        const exportResult = await exporterRef.current.export(scene, camera, {
          ...options,
          onProgress: (prog) => setProgress(prog),
        });

        setResult(exportResult);
      } catch (err) {
        setError(err as Error);
      } finally {
        setExporting(false);
      }
    },
    [renderer]
  );

  return {
    exporting,
    progress,
    result,
    error,
    startExport,
    isSupported: VideoExporter.isSupported(),
    supportedCodecs: VideoExporter.getSupportedCodecs(),
  };
}

// Lazy React import
let React: typeof import('react');
if (typeof window !== 'undefined') {
  React = require('react');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { VideoExporter as default };




