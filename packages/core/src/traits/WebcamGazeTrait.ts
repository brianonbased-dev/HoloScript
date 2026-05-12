/**
 * WebcamGazeTrait
 *
 * Consumer-webcam gaze adapter for foveated rendering and avatar intent.
 * Uses MediaPipe FaceLandmarker iris landmarks when running in a browser,
 * while keeping the gaze math pure/testable for Node.
 *
 * @version 0.1.0
 */

import type { TraitContext, TraitEvent, TraitHandler, HSPlusNode } from './TraitTypes';

export interface NormalizedFaceLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export interface WebcamGazeSample {
  /** Normalized viewport coordinate, left-to-right in [0, 1]. */
  gaze_x: number;
  /** Normalized viewport coordinate, top-to-bottom in [0, 1]. */
  gaze_y: number;
  /** Normalized device coordinate center used by multiview foveation. */
  foveal_center: [number, number];
  confidence: number;
  timestamp: number;
  source: 'webcam';
}

export interface WebcamGazeConfig {
  auto_start: boolean;
  video_width: number;
  video_height: number;
  sample_rate_hz: number;
  confidence_threshold: number;
  /** MediaPipe Tasks Vision wasm base path. */
  wasm_base_path: string;
  /** MediaPipe face_landmarker.task path or URL. */
  model_asset_path: string;
  /** Maps iris-in-eye horizontal displacement to viewport displacement. */
  gaze_gain_x: number;
  /** Maps iris-in-eye vertical displacement to viewport displacement. */
  gaze_gain_y: number;
  /** Approximate ray angle used for eye_gaze_update bridge events. */
  max_ray_angle_degrees: number;
}

interface WebcamGazeState {
  tracker: WebcamGazeTracker | null;
  isTracking: boolean;
  lastSample: WebcamGazeSample | null;
  error: string | null;
}

interface FaceLandmarkerResultLike {
  faceLandmarks: NormalizedFaceLandmark[][];
}

interface FaceLandmarkerLike {
  detectForVideo(videoFrame: HTMLVideoElement, timestamp: number): FaceLandmarkerResultLike;
  close?: () => void;
}

interface VisionTasksModuleLike {
  FilesetResolver: {
    forVisionTasks(basePath?: string): Promise<unknown>;
  };
  FaceLandmarker: {
    createFromOptions(
      wasmFileset: unknown,
      options: {
        baseOptions: { modelAssetPath: string };
        runningMode: 'VIDEO';
        numFaces: number;
        outputFaceBlendshapes: boolean;
        outputFacialTransformationMatrixes: boolean;
      }
    ): Promise<FaceLandmarkerLike>;
  };
}

interface WebcamGazeTrackerOptions {
  config: WebcamGazeConfig;
  videoElement?: HTMLVideoElement | null;
  onSample: (sample: WebcamGazeSample) => void;
  onError?: (error: Error) => void;
}

const LEFT_EYE_CORNERS = [33, 133] as const;
const RIGHT_EYE_CORNERS = [362, 263] as const;
const LEFT_IRIS = [468, 469, 470, 471, 472] as const;
const RIGHT_IRIS = [473, 474, 475, 476, 477] as const;

export const DEFAULT_WEBCAM_GAZE_CONFIG: WebcamGazeConfig = {
  auto_start: false,
  video_width: 640,
  video_height: 480,
  sample_rate_hz: 30,
  confidence_threshold: 0.35,
  wasm_base_path: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
  model_asset_path:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  gaze_gain_x: 1.35,
  gaze_gain_y: 1.8,
  max_ray_angle_degrees: 10,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function meanLandmark(
  landmarks: readonly NormalizedFaceLandmark[],
  indices: readonly number[]
): NormalizedFaceLandmark | null {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;

  for (const index of indices) {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    x += point.x;
    y += point.y;
    z += point.z ?? 0;
    count += 1;
  }

  if (count === 0) return null;
  return { x: x / count, y: y / count, z: z / count };
}

function distance2D(a: NormalizedFaceLandmark, b: NormalizedFaceLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function estimateEyeOffset(
  landmarks: readonly NormalizedFaceLandmark[],
  cornerIndices: readonly [number, number],
  irisIndices: readonly number[]
): { x: number; y: number; span: number } | null {
  const a = landmarks[cornerIndices[0]];
  const b = landmarks[cornerIndices[1]];
  const iris = meanLandmark(landmarks, irisIndices);
  if (!a || !b || !iris) return null;

  const span = Math.max(distance2D(a, b), 0.0001);
  const midX = (a.x + b.x) * 0.5;
  const midY = (a.y + b.y) * 0.5;
  const verticalSpan = Math.max(span * 0.45, 0.0001);

  return {
    x: (iris.x - midX) / span,
    y: (iris.y - midY) / verticalSpan,
    span,
  };
}

export function estimateWebcamGazeFromLandmarks(
  landmarks: readonly NormalizedFaceLandmark[],
  config: Partial<WebcamGazeConfig> = {}
): WebcamGazeSample | null {
  const resolved = { ...DEFAULT_WEBCAM_GAZE_CONFIG, ...config };
  const left = estimateEyeOffset(landmarks, LEFT_EYE_CORNERS, LEFT_IRIS);
  const right = estimateEyeOffset(landmarks, RIGHT_EYE_CORNERS, RIGHT_IRIS);
  const eyes = [left, right].filter((eye): eye is NonNullable<typeof eye> => Boolean(eye));
  if (eyes.length === 0) return null;

  const avgX = eyes.reduce((sum, eye) => sum + eye.x, 0) / eyes.length;
  const avgY = eyes.reduce((sum, eye) => sum + eye.y, 0) / eyes.length;
  const avgSpan = eyes.reduce((sum, eye) => sum + eye.span, 0) / eyes.length;

  const gazeX = clamp01(0.5 + avgX * resolved.gaze_gain_x);
  const gazeY = clamp01(0.5 + avgY * resolved.gaze_gain_y);
  const confidence = clamp(avgSpan / 0.08, 0, 1);

  return {
    gaze_x: gazeX,
    gaze_y: gazeY,
    foveal_center: [gazeX * 2 - 1, 1 - gazeY * 2],
    confidence,
    timestamp: Date.now(),
    source: 'webcam',
  };
}

export function webcamGazeToRay(
  sample: Pick<WebcamGazeSample, 'foveal_center'>,
  maxAngleDegrees: number = DEFAULT_WEBCAM_GAZE_CONFIG.max_ray_angle_degrees
): [number, number, number] {
  const angle = (maxAngleDegrees * Math.PI) / 180;
  const yaw = sample.foveal_center[0] * angle;
  const pitch = sample.foveal_center[1] * angle;
  const x = Math.tan(yaw);
  const y = Math.tan(pitch);
  const z = -1;
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

function firstFaceSample(
  result: FaceLandmarkerResultLike,
  config: Partial<WebcamGazeConfig>
): WebcamGazeSample | null {
  const face = result.faceLandmarks[0];
  if (!face) return null;
  return estimateWebcamGazeFromLandmarks(face, config);
}

function parseLandmarks(value: unknown): NormalizedFaceLandmark[] | null {
  if (!Array.isArray(value)) return null;
  const out: NormalizedFaceLandmark[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    if (typeof record.x !== 'number' || typeof record.y !== 'number') return null;
    out.push({
      x: record.x,
      y: record.y,
      z: typeof record.z === 'number' ? record.z : undefined,
    });
  }
  return out;
}

function errorFromUnknown(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function mediaPipeNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export class WebcamGazeTracker {
  private readonly config: WebcamGazeConfig;
  private readonly onSample: (sample: WebcamGazeSample) => void;
  private readonly onError?: (error: Error) => void;
  private videoElement: HTMLVideoElement | null;
  private ownsVideoElement = false;
  private stream: MediaStream | null = null;
  private landmarker: FaceLandmarkerLike | null = null;
  private frameHandle: number | null = null;
  private lastRunAt = 0;
  private running = false;

  constructor(options: WebcamGazeTrackerOptions) {
    this.config = options.config;
    this.onSample = options.onSample;
    this.onError = options.onError;
    this.videoElement = options.videoElement ?? null;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('WebcamGaze: navigator.mediaDevices.getUserMedia is unavailable.');
    }
    if (typeof document === 'undefined' && !this.videoElement) {
      throw new Error('WebcamGaze: a video element is required outside the browser DOM.');
    }

    const vision = (await import('@mediapipe/tasks-vision')) as unknown as VisionTasksModuleLike;
    const wasmFileset = await vision.FilesetResolver.forVisionTasks(this.config.wasm_base_path);
    this.landmarker = await vision.FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: { modelAssetPath: this.config.model_asset_path },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this.config.video_width },
        height: { ideal: this.config.video_height },
        facingMode: 'user',
      },
      audio: false,
    });

    if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.ownsVideoElement = true;
    }

    this.videoElement.srcObject = this.stream;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    await this.videoElement.play();

    this.running = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.landmarker?.close?.();
    this.landmarker = null;

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      if (this.ownsVideoElement) this.videoElement.remove();
    }
    this.videoElement = null;
    this.ownsVideoElement = false;
  }

  private scheduleFrame(): void {
    if (!this.running || typeof window === 'undefined') return;
    this.frameHandle = window.requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    if (!this.running || !this.landmarker || !this.videoElement) return;

    const now = mediaPipeNow();
    const minIntervalMs = 1000 / Math.max(1, this.config.sample_rate_hz);
    if (now - this.lastRunAt >= minIntervalMs && this.videoElement.readyState >= 2) {
      try {
        const result = this.landmarker.detectForVideo(this.videoElement, now);
        const sample = firstFaceSample(result, this.config);
        if (sample && sample.confidence >= this.config.confidence_threshold) {
          this.onSample(sample);
        }
        this.lastRunAt = now;
      } catch (error) {
        this.onError?.(errorFromUnknown(error));
      }
    }

    this.scheduleFrame();
  }
}

function emitWebcamGazeSample(
  node: HSPlusNode,
  config: WebcamGazeConfig,
  context: TraitContext,
  sample: WebcamGazeSample
): void {
  const direction = webcamGazeToRay(sample, config.max_ray_angle_degrees);

  context.emit?.('webcam_gaze_update', { node, ...sample });
  context.emit?.('foveal_center_update', {
    node,
    foveal_center: sample.foveal_center,
    confidence: sample.confidence,
    source: sample.source,
  });
  context.emit?.('avatar_input_sample', {
    type: 'avatar_input_sample',
    node,
    device: 'eye_tracking',
    axes: {
      gaze_x: sample.gaze_x,
      gaze_y: sample.gaze_y,
      foveal_x: sample.foveal_center[0],
      foveal_y: sample.foveal_center[1],
      confidence: sample.confidence,
    },
    buttons: {},
  });
  context.emit?.('eye_gaze_update', {
    type: 'eye_gaze_update',
    node,
    origin: [0, 0, 0],
    direction,
    confidence: sample.confidence,
    source: sample.source,
  });
}

async function startWebcamGaze(
  node: HSPlusNode,
  config: WebcamGazeConfig,
  context: TraitContext
): Promise<void> {
  const state = node.__webcamGazeState as WebcamGazeState | undefined;
  if (!state || state.tracker) return;

  const tracker = new WebcamGazeTracker({
    config,
    onSample(sample) {
      state.lastSample = sample;
      state.isTracking = true;
      state.error = null;
      emitWebcamGazeSample(node, config, context, sample);
    },
    onError(error) {
      state.error = error.message;
      context.emit?.('webcam_gaze_error', { node, error: error.message });
    },
  });

  state.tracker = tracker;
  try {
    await tracker.start();
    state.isTracking = true;
    context.emit?.('webcam_gaze_started', { node });
  } catch (error) {
    state.tracker = null;
    state.isTracking = false;
    state.error = errorFromUnknown(error).message;
    context.emit?.('webcam_gaze_error', { node, error: state.error });
  }
}

export const webcamGazeHandler: TraitHandler<WebcamGazeConfig> = {
  name: 'webcam_gaze',

  defaultConfig: DEFAULT_WEBCAM_GAZE_CONFIG,

  onAttach(node, config, context) {
    const state: WebcamGazeState = {
      tracker: null,
      isTracking: false,
      lastSample: null,
      error: null,
    };
    node.__webcamGazeState = state;
    context.emit?.('webcam_gaze_ready', { node, autoStart: config.auto_start });

    if (config.auto_start) {
      void startWebcamGaze(node, config, context);
    }
  },

  onDetach(node, _config, context) {
    const state = node.__webcamGazeState as WebcamGazeState | undefined;
    state?.tracker?.stop();
    delete node.__webcamGazeState;
    context.emit?.('webcam_gaze_stopped', { node });
  },

  onEvent(node, config, context, event: TraitEvent) {
    const state = node.__webcamGazeState as WebcamGazeState | undefined;
    if (!state) return;

    if (event.type === 'webcam_gaze_start') {
      void startWebcamGaze(node, config, context);
      return;
    }

    if (event.type === 'webcam_gaze_stop') {
      state.tracker?.stop();
      state.tracker = null;
      state.isTracking = false;
      context.emit?.('webcam_gaze_stopped', { node });
      return;
    }

    if (event.type === 'webcam_gaze_landmarks') {
      const record = event as unknown as Record<string, unknown>;
      const landmarks = parseLandmarks(record.landmarks);
      if (!landmarks) {
        context.emit?.('webcam_gaze_error', { node, error: 'Invalid landmark payload.' });
        return;
      }

      const sample = estimateWebcamGazeFromLandmarks(landmarks, config);
      if (!sample || sample.confidence < config.confidence_threshold) return;

      state.lastSample = sample;
      state.isTracking = true;
      emitWebcamGazeSample(node, config, context, sample);
      return;
    }

    if (event.type === 'webcam_gaze_query') {
      context.emit?.('webcam_gaze_state', {
        node,
        isTracking: state.isTracking,
        lastSample: state.lastSample,
        error: state.error,
      });
    }
  },
};

export default webcamGazeHandler;
