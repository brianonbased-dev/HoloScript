/**
 * MediaRecorderSceneCapture.ts
 *
 * Captures VR scenes using the browser MediaRecorder API. Provides
 * configurable resolution, frame rate, codec selection, multi-pass
 * rendering support, and export to various video formats.
 *
 * Designed for recording VR experiences, generating training data,
 * creating promotional content, and bug reproduction captures.
 *
 * Staging area file for Hololand integration (TODO-040).
 *
 * @version 1.0.0
 * @package hololand/capture
 */

// =============================================================================
// TYPES
// =============================================================================

/** Supported video codecs */
export type VideoCodec =
  | 'vp8'
  | 'vp9'
  | 'h264'
  | 'h265'
  | 'av1';

/** Supported container formats */
export type ContainerFormat =
  | 'webm'
  | 'mp4'
  | 'mkv';

/** Capture resolution presets */
export type ResolutionPreset =
  | '720p'
  | '1080p'
  | '1440p'
  | '4k'
  | 'custom';

/** Capture state */
export type CaptureState =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'processing'
  | 'error';

/** Capture quality preset */
export type QualityPreset =
  | 'draft'     // fast, low quality
  | 'standard'  // balanced
  | 'high'      // high quality, larger files
  | 'lossless'; // maximum quality

/** Render pass type for multi-pass rendering */
export type RenderPassType =
  | 'color'          // standard RGB render
  | 'depth'          // depth buffer visualization
  | 'normal'         // surface normals
  | 'wireframe'      // wireframe overlay
  | 'albedo'         // unlit base color
  | 'metallic'       // metallic channel
  | 'roughness'      // roughness channel
  | 'emission'       // emissive channel
  | 'ambient_occlusion' // AO pass
  | 'motion_vectors' // motion vectors for post-processing
  | 'object_id';     // object segmentation mask

// =============================================================================
// Resolution definitions
// =============================================================================

export interface Resolution {
  width: number;
  height: number;
  label: string;
}

export const RESOLUTION_PRESETS: Record<ResolutionPreset, Resolution> = {
  '720p': { width: 1280, height: 720, label: '720p HD' },
  '1080p': { width: 1920, height: 1080, label: '1080p Full HD' },
  '1440p': { width: 2560, height: 1440, label: '1440p QHD' },
  '4k': { width: 3840, height: 2160, label: '4K UHD' },
  custom: { width: 1920, height: 1080, label: 'Custom' },
};

// =============================================================================
// Configuration
// =============================================================================

/** Capture configuration */
export interface CaptureConfig {
  /** Resolution preset or 'custom' */
  resolutionPreset: ResolutionPreset;
  /** Custom width (used when resolutionPreset is 'custom') */
  customWidth?: number;
  /** Custom height (used when resolutionPreset is 'custom') */
  customHeight?: number;
  /** Target frame rate */
  fps: number;
  /** Video codec */
  codec: VideoCodec;
  /** Container format */
  container: ContainerFormat;
  /** Quality preset */
  quality: QualityPreset;
  /** Video bitrate in bits per second (0 = auto) */
  videoBitrate: number;
  /** Audio bitrate in bits per second (0 = no audio) */
  audioBitrate: number;
  /** Whether to capture audio */
  captureAudio: boolean;
  /** Maximum recording duration in seconds (0 = unlimited) */
  maxDurationSeconds: number;
  /** Render passes to capture (for multi-pass rendering) */
  renderPasses: RenderPassType[];
  /** Whether to capture in stereoscopic (side-by-side) format */
  stereoscopic: boolean;
  /** Supersampling factor (1 = none, 2 = 2x, 4 = 4x) */
  supersampling: number;
  /** Auto-stop recording when scene becomes static */
  autoStopOnIdle: boolean;
  /** Idle detection threshold in seconds */
  idleThresholdSeconds: number;
  /** Include timestamp overlay */
  timestampOverlay: boolean;
  /** Include frame number overlay */
  frameNumberOverlay: boolean;
}

/** Default capture configuration */
const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  resolutionPreset: '1080p',
  fps: 30,
  codec: 'vp9',
  container: 'webm',
  quality: 'standard',
  videoBitrate: 0,
  audioBitrate: 128000,
  captureAudio: false,
  maxDurationSeconds: 0,
  renderPasses: ['color'],
  stereoscopic: false,
  supersampling: 1,
  autoStopOnIdle: false,
  idleThresholdSeconds: 5,
  timestampOverlay: false,
  frameNumberOverlay: false,
};

// =============================================================================
// Capture Metadata
// =============================================================================

/** Metadata about a completed recording */
export interface CaptureMetadata {
  /** Unique capture ID */
  id: string;
  /** Filename (without extension) */
  filename: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Total frames captured */
  frameCount: number;
  /** Actual average FPS achieved */
  actualFps: number;
  /** File size in bytes */
  fileSizeBytes: number;
  /** Configuration used */
  config: CaptureConfig;
  /** Resolution used */
  resolution: Resolution;
  /** Render passes captured */
  renderPasses: RenderPassType[];
  /** Frame timing statistics */
  frameTimingStats: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    droppedFrames: number;
  };
  /** Scene information at capture time */
  sceneInfo: {
    objectCount: number;
    triangleCount: number;
    lightCount: number;
  };
}

// =============================================================================
// Render Pass Output
// =============================================================================

/** Output from a single render pass for one frame */
export interface RenderPassFrame {
  pass: RenderPassType;
  frameNumber: number;
  timestampMs: number;
  /** Canvas or OffscreenCanvas containing the rendered frame */
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

/** Multi-pass frame combining all passes for a single frame */
export interface MultiPassFrame {
  frameNumber: number;
  timestampMs: number;
  passes: Map<RenderPassType, RenderPassFrame>;
}

// =============================================================================
// Codec Support Detection
// =============================================================================

/** Detected codec support information */
export interface CodecSupportInfo {
  codec: VideoCodec;
  container: ContainerFormat;
  isSupported: boolean;
  mimeType: string;
}

/**
 * Detect which codec + container combinations are supported by the browser.
 */
export function detectCodecSupport(): CodecSupportInfo[] {
  if (typeof MediaRecorder === 'undefined') {
    return [];
  }

  const combinations: { codec: VideoCodec; container: ContainerFormat; mimeType: string }[] = [
    { codec: 'vp8', container: 'webm', mimeType: 'video/webm;codecs=vp8' },
    { codec: 'vp9', container: 'webm', mimeType: 'video/webm;codecs=vp9' },
    { codec: 'h264', container: 'webm', mimeType: 'video/webm;codecs=h264' },
    { codec: 'h264', container: 'mp4', mimeType: 'video/mp4;codecs=avc1.42E01E' },
    { codec: 'h265', container: 'mp4', mimeType: 'video/mp4;codecs=hev1.1.6.L93.B0' },
    { codec: 'av1', container: 'webm', mimeType: 'video/webm;codecs=av01.0.05M.08' },
    { codec: 'av1', container: 'mp4', mimeType: 'video/mp4;codecs=av01.0.05M.08' },
  ];

  return combinations.map((combo) => ({
    codec: combo.codec,
    container: combo.container,
    isSupported: MediaRecorder.isTypeSupported(combo.mimeType),
    mimeType: combo.mimeType,
  }));
}

/**
 * Get the best available MIME type for the given codec preferences.
 */
export function getBestMimeType(
  preferredCodec: VideoCodec,
  preferredContainer: ContainerFormat
): string | null {
  const support = detectCodecSupport();

  // Try exact match first
  const exact = support.find(
    (s) => s.codec === preferredCodec && s.container === preferredContainer && s.isSupported
  );
  if (exact) return exact.mimeType;

  // Try same codec, different container
  const sameCodec = support.find(
    (s) => s.codec === preferredCodec && s.isSupported
  );
  if (sameCodec) return sameCodec.mimeType;

  // Fallback to any supported codec
  const fallback = support.find((s) => s.isSupported);
  return fallback?.mimeType ?? null;
}

// =============================================================================
// MediaRecorder Scene Capture
// =============================================================================

/**
 * Scene capture engine using the browser MediaRecorder API.
 *
 * Captures the output of a WebGL/WebGPU canvas to a video file.
 * Supports multi-pass rendering, configurable codecs, and
 * frame-accurate timing.
 */
export class MediaRecorderSceneCapture {
  private config: CaptureConfig;
  private state: CaptureState = 'idle';
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private frameCount: number = 0;
  private startTime: number = 0;
  private lastFrameTime: number = 0;
  private frameTimes: number[] = [];
  private captureId: string = '';
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPixelHash: string = '';
  private consecutiveIdleFrames: number = 0;

  /** The canvas being captured */
  private sourceCanvas: HTMLCanvasElement | null = null;
  /** The offscreen render canvas (for supersampling) */
  private renderCanvas: OffscreenCanvas | null = null;

  /** Capture stream from canvas */
  private captureStream: MediaStream | null = null;
  /** Audio stream (optional) */
  private audioStream: MediaStream | null = null;

  /** Multi-pass render callback */
  private renderPassCallback:
    | ((pass: RenderPassType, frameNumber: number) => void)
    | null = null;

  /** Event listeners */
  private listeners: {
    onStart?: () => void;
    onStop?: (metadata: CaptureMetadata) => void;
    onPause?: () => void;
    onResume?: () => void;
    onFrame?: (frameNumber: number) => void;
    onError?: (error: Error) => void;
    onDataAvailable?: (blob: Blob) => void;
  } = {};

  constructor(config?: Partial<CaptureConfig>) {
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config };
  }

  /** Register event listeners */
  on(event: keyof typeof this.listeners, callback: (...args: any[]) => void): void {
    (this.listeners as any)[event] = callback;
  }

  /** Get current capture state */
  getState(): CaptureState {
    return this.state;
  }

  /** Get current frame count */
  getFrameCount(): number {
    return this.frameCount;
  }

  /** Get elapsed recording time in milliseconds */
  getElapsedMs(): number {
    if (this.startTime === 0) return 0;
    return Date.now() - this.startTime;
  }

  /** Get the current configuration */
  getConfig(): CaptureConfig {
    return { ...this.config };
  }

  /** Update configuration (only when idle) */
  setConfig(updates: Partial<CaptureConfig>): void {
    if (this.state !== 'idle') {
      throw new Error('Cannot update config while recording. Stop the capture first.');
    }
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get the effective resolution based on config.
   */
  getEffectiveResolution(): Resolution {
    if (this.config.resolutionPreset === 'custom') {
      return {
        width: this.config.customWidth ?? 1920,
        height: this.config.customHeight ?? 1080,
        label: `${this.config.customWidth ?? 1920}x${this.config.customHeight ?? 1080}`,
      };
    }
    const base = RESOLUTION_PRESETS[this.config.resolutionPreset];
    return {
      width: base.width * this.config.supersampling,
      height: base.height * this.config.supersampling,
      label: base.label + (this.config.supersampling > 1 ? ` (${this.config.supersampling}x SS)` : ''),
    };
  }

  /**
   * Set the render pass callback for multi-pass rendering.
   * The callback will be called for each configured render pass on each frame.
   */
  setRenderPassCallback(
    callback: (pass: RenderPassType, frameNumber: number) => void
  ): void {
    this.renderPassCallback = callback;
  }

  /**
   * Start recording from a canvas element.
   */
  startCapture(canvas: HTMLCanvasElement, audioStream?: MediaStream): void {
    if (this.state === 'recording') {
      throw new Error('Already recording. Stop the current capture first.');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder API is not available in this browser.');
    }

    this.sourceCanvas = canvas;
    this.audioStream = audioStream ?? null;
    this.recordedChunks = [];
    this.frameCount = 0;
    this.frameTimes = [];
    this.captureId = `capture_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.startTime = Date.now();
    this.lastFrameTime = this.startTime;
    this.consecutiveIdleFrames = 0;
    this.lastPixelHash = '';

    // Determine MIME type
    const mimeType = getBestMimeType(this.config.codec, this.config.container);
    if (!mimeType) {
      const error = new Error(
        `No supported codec found for ${this.config.codec}/${this.config.container}. ` +
        `Supported: ${detectCodecSupport().filter((s) => s.isSupported).map((s) => `${s.codec}/${s.container}`).join(', ')}`
      );
      this.state = 'error';
      this.listeners.onError?.(error);
      throw error;
    }

    // Capture stream from canvas
    this.captureStream = canvas.captureStream(this.config.fps);

    // Combine with audio if present
    let combinedStream = this.captureStream;
    if (this.config.captureAudio && this.audioStream) {
      const tracks = [
        ...this.captureStream.getVideoTracks(),
        ...this.audioStream.getAudioTracks(),
      ];
      combinedStream = new MediaStream(tracks);
    }

    // Configure bitrate
    const options: MediaRecorderOptions = {
      mimeType,
    };

    if (this.config.videoBitrate > 0) {
      options.videoBitsPerSecond = this.config.videoBitrate;
    } else {
      // Auto bitrate based on quality preset
      const bitrates: Record<QualityPreset, number> = {
        draft: 2_500_000,
        standard: 8_000_000,
        high: 20_000_000,
        lossless: 50_000_000,
      };
      options.videoBitsPerSecond = bitrates[this.config.quality];
    }

    if (this.config.captureAudio && this.config.audioBitrate > 0) {
      options.audioBitsPerSecond = this.config.audioBitrate;
    }

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(combinedStream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.listeners.onDataAvailable?.(event.data);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      this.state = 'error';
      this.listeners.onError?.(new Error(`MediaRecorder error: ${(event as any).error?.message ?? 'unknown'}`));
    };

    this.mediaRecorder.onstop = () => {
      this.finishCapture();
    };

    // Start recording
    // Request data every second to avoid memory buildup
    this.mediaRecorder.start(1000);
    this.state = 'recording';

    // Set max duration timer
    if (this.config.maxDurationSeconds > 0) {
      this.maxDurationTimer = setTimeout(() => {
        this.stopCapture();
      }, this.config.maxDurationSeconds * 1000);
    }

    this.listeners.onStart?.();
  }

  /**
   * Notify the capture engine that a frame has been rendered.
   * Call this from your render loop after drawing to the canvas.
   */
  onFrameRendered(): void {
    if (this.state !== 'recording') return;

    const now = Date.now();
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;
    this.frameTimes.push(frameTime);

    // Trigger multi-pass rendering if configured
    if (this.config.renderPasses.length > 1 && this.renderPassCallback) {
      for (const pass of this.config.renderPasses) {
        if (pass !== 'color') {
          this.renderPassCallback(pass, this.frameCount);
        }
      }
    }

    // Auto-stop on idle detection
    if (this.config.autoStopOnIdle) {
      this.checkIdle();
    }

    this.listeners.onFrame?.(this.frameCount);
  }

  /**
   * Pause recording.
   */
  pauseCapture(): void {
    if (this.state !== 'recording' || !this.mediaRecorder) return;
    this.mediaRecorder.pause();
    this.state = 'paused';
    this.listeners.onPause?.();
  }

  /**
   * Resume recording after pause.
   */
  resumeCapture(): void {
    if (this.state !== 'paused' || !this.mediaRecorder) return;
    this.mediaRecorder.resume();
    this.state = 'recording';
    this.listeners.onResume?.();
  }

  /**
   * Stop recording and finalize the capture.
   */
  stopCapture(): void {
    if (this.state !== 'recording' && this.state !== 'paused') return;
    if (!this.mediaRecorder) return;

    this.state = 'processing';

    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.mediaRecorder.stop();

    // Stop all tracks
    if (this.captureStream) {
      for (const track of this.captureStream.getTracks()) {
        track.stop();
      }
    }
  }

  /**
   * Get the recorded video as a Blob.
   * Only available after stopCapture() completes.
   */
  getRecordedBlob(): Blob | null {
    if (this.recordedChunks.length === 0) return null;
    const mimeType = getBestMimeType(this.config.codec, this.config.container);
    return new Blob(this.recordedChunks, { type: mimeType ?? 'video/webm' });
  }

  /**
   * Get the recorded video as a downloadable URL.
   * Call URL.revokeObjectURL() when done.
   */
  getRecordedUrl(): string | null {
    const blob = this.getRecordedBlob();
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  /**
   * Download the recorded video to the user's device.
   */
  downloadRecording(filename?: string): void {
    const url = this.getRecordedUrl();
    if (!url) {
      throw new Error('No recording available');
    }

    const extension = this.config.container;
    const name = filename ?? `${this.captureId}.${extension}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Get metadata about the current or last completed capture.
   */
  getMetadata(): CaptureMetadata {
    const endTime = this.state === 'idle' ? this.lastFrameTime : Date.now();
    const durationMs = endTime - (this.startTime || endTime);
    const resolution = this.getEffectiveResolution();

    // Compute frame timing stats
    const frameTimingStats = this.computeFrameTimingStats();

    // File size
    const blob = this.getRecordedBlob();
    const fileSizeBytes = blob?.size ?? 0;

    return {
      id: this.captureId,
      filename: this.captureId,
      startTime: this.startTime,
      endTime,
      durationMs,
      frameCount: this.frameCount,
      actualFps: durationMs > 0 ? (this.frameCount / durationMs) * 1000 : 0,
      fileSizeBytes,
      config: { ...this.config },
      resolution,
      renderPasses: [...this.config.renderPasses],
      frameTimingStats,
      sceneInfo: {
        objectCount: 0,
        triangleCount: 0,
        lightCount: 0,
      },
    };
  }

  /**
   * Take a single screenshot from the canvas.
   * Returns a Blob containing a PNG image.
   */
  takeScreenshot(canvas: HTMLCanvasElement, format: 'png' | 'jpeg' = 'png'): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = format === 'jpeg' ? 0.95 : undefined;
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create screenshot blob'));
        },
        mimeType,
        quality
      );
    });
  }

  /**
   * Capture a sequence of screenshots at a fixed interval.
   * Useful for creating image sequences or timelapse captures.
   */
  startScreenshotSequence(
    canvas: HTMLCanvasElement,
    intervalMs: number,
    onScreenshot: (blob: Blob, frameNumber: number) => void
  ): { stop: () => void } {
    let frame = 0;
    const timer = setInterval(async () => {
      try {
        const blob = await this.takeScreenshot(canvas);
        onScreenshot(blob, frame++);
      } catch {
        // skip failed frames
      }
    }, intervalMs);

    return {
      stop: () => clearInterval(timer),
    };
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    if (this.state === 'recording' || this.state === 'paused') {
      this.stopCapture();
    }

    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);

    this.mediaRecorder = null;
    this.captureStream = null;
    this.audioStream = null;
    this.sourceCanvas = null;
    this.renderCanvas = null;
    this.recordedChunks = [];
    this.frameTimes = [];
    this.state = 'idle';
  }

  // ---- Private ----

  private finishCapture(): void {
    this.state = 'idle';
    const metadata = this.getMetadata();
    this.listeners.onStop?.(metadata);
  }

  private checkIdle(): void {
    if (!this.sourceCanvas) return;

    // Sample a small portion of pixels for change detection
    try {
      const ctx = this.sourceCanvas.getContext('2d') ?? this.sourceCanvas.getContext('webgl2');
      if (!ctx) return;

      // For WebGL, read a small pixel sample
      if ('readPixels' in ctx) {
        const pixels = new Uint8Array(16);
        (ctx as WebGL2RenderingContext).readPixels(0, 0, 2, 2, (ctx as WebGL2RenderingContext).RGBA, (ctx as WebGL2RenderingContext).UNSIGNED_BYTE, pixels);
        const hash = this.simpleHash(pixels);

        if (hash === this.lastPixelHash) {
          this.consecutiveIdleFrames++;
        } else {
          this.consecutiveIdleFrames = 0;
        }
        this.lastPixelHash = hash;
      }

      // Auto-stop if idle for too long
      const idleFrames = this.config.fps * this.config.idleThresholdSeconds;
      if (this.consecutiveIdleFrames >= idleFrames) {
        this.stopCapture();
      }
    } catch {
      // ignore errors in idle detection
    }
  }

  private simpleHash(data: Uint8Array): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    return hash.toString(36);
  }

  private computeFrameTimingStats(): CaptureMetadata['frameTimingStats'] {
    if (this.frameTimes.length === 0) {
      return { min: 0, max: 0, mean: 0, stdDev: 0, droppedFrames: 0 };
    }

    const min = Math.min(...this.frameTimes);
    const max = Math.max(...this.frameTimes);
    const mean = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const variance =
      this.frameTimes.reduce((sum, t) => sum + (t - mean) ** 2, 0) / this.frameTimes.length;
    const stdDev = Math.sqrt(variance);

    // Count frames that took more than 2x the expected frame time as "dropped"
    const expectedFrameTime = 1000 / this.config.fps;
    const droppedFrames = this.frameTimes.filter((t) => t > expectedFrameTime * 2).length;

    return { min, max, mean, stdDev, droppedFrames };
  }
}

// =============================================================================
// Multi-Pass Capture Manager
// =============================================================================

/**
 * Manages multi-pass rendering and compositing for scene capture.
 * Captures separate render passes (color, depth, normal, etc.) and
 * can composite them together or export them individually.
 */
export class MultiPassCaptureManager {
  private passes: Map<RenderPassType, Blob[]> = new Map();
  private activeCaptures: Map<RenderPassType, MediaRecorderSceneCapture> = new Map();
  private config: CaptureConfig;

  constructor(config?: Partial<CaptureConfig>) {
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config };
  }

  /**
   * Initialize capture for specified render passes.
   * Each pass gets its own MediaRecorder instance.
   */
  initializePasses(
    passes: RenderPassType[],
    canvasProvider: (pass: RenderPassType) => HTMLCanvasElement
  ): void {
    for (const pass of passes) {
      const canvas = canvasProvider(pass);
      const capture = new MediaRecorderSceneCapture({
        ...this.config,
        renderPasses: [pass],
      });

      this.activeCaptures.set(pass, capture);
      this.passes.set(pass, []);
    }
  }

  /**
   * Start recording all passes simultaneously.
   */
  startAll(canvasProvider: (pass: RenderPassType) => HTMLCanvasElement): void {
    for (const [pass, capture] of this.activeCaptures) {
      const canvas = canvasProvider(pass);
      capture.startCapture(canvas);
    }
  }

  /**
   * Notify all passes that a frame has been rendered.
   */
  onFrameRendered(): void {
    for (const capture of this.activeCaptures.values()) {
      capture.onFrameRendered();
    }
  }

  /**
   * Stop all passes.
   */
  stopAll(): void {
    for (const capture of this.activeCaptures.values()) {
      capture.stopCapture();
    }
  }

  /**
   * Get recorded blobs for each pass.
   */
  getPassBlobs(): Map<RenderPassType, Blob | null> {
    const result = new Map<RenderPassType, Blob | null>();
    for (const [pass, capture] of this.activeCaptures) {
      result.set(pass, capture.getRecordedBlob());
    }
    return result;
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    for (const capture of this.activeCaptures.values()) {
      capture.destroy();
    }
    this.activeCaptures.clear();
    this.passes.clear();
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MediaRecorderSceneCapture instance.
 */
export function createSceneCapture(
  config?: Partial<CaptureConfig>
): MediaRecorderSceneCapture {
  return new MediaRecorderSceneCapture(config);
}

/**
 * Create a MultiPassCaptureManager instance.
 */
export function createMultiPassCapture(
  config?: Partial<CaptureConfig>
): MultiPassCaptureManager {
  return new MultiPassCaptureManager(config);
}
