/**
 * PhysicalCameraInputTrait — v1.0
 *
 * Sovereign edge hardware camera input.  Defines the event/config interface for
 * physical cameras attached to edge nodes (Jetson Orin, etc.) and routes incoming
 * frame notifications into the HoloScript world model.
 *
 * Supported sources:
 *   /dev/videoN          — USB/UVC cameras
 *   csi://N              — Jetson CSI cameras (v4l2 GStreamer pipeline)
 *   realsense://<serial> — Intel RealSense D4xx depth cameras
 *   oak://<ip-or-usb>   — Luxonis OAK-D / OAK-D Pro
 *
 * The trait is capture-backend-agnostic: it handles routing only.  The actual
 * capture runs in a side-channel process (Python/shell) that emits events by
 * calling context.emit('camera:frame', payload).
 *
 * Events consumed:
 *   camera:open        — open camera with current config
 *   camera:close       — release camera
 *   camera:frame       — RGB frame available  { path, width, height, timestamp, seq }
 *   camera:depth_frame — depth frame available { path, width, height, timestamp, seq, minM, maxM }
 *
 * Events emitted:
 *   camera:opened      — camera ready
 *   camera:closed      — camera released
 *   camera:error       — { message }
 *   perception:update  — { source, frameSeq, timestamp, framePath, depthPath? }
 *                         forwarded to brain so cognitive traits can react
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

export interface PhysicalCameraConfig {
  /** Device path or URI. Default: /dev/video0 */
  source: string;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Target capture FPS */
  fps: number;
  /** Pixel format for RGB frames */
  format: 'rgb8' | 'bgr8' | 'yuv420' | 'nv12';
  /** Whether depth channel is expected (RealSense / OAK-D) */
  depth_enabled: boolean;
  /** Minimum valid depth in metres (for depth cameras) */
  depth_min_m: number;
  /** Maximum valid depth in metres (for depth cameras) */
  depth_max_m: number;
  /** Directory where frame files are written by the capture process */
  frame_dir: string;
  /** Maximum number of frames to keep queued before dropping oldest */
  max_frames_queued: number;
  /** Emit perception:update events so the brain can react to each frame */
  emit_perception: boolean;
}

export interface PhysicalCameraState {
  source: string;
  connected: boolean;
  frameCount: number;
  depthFrameCount: number;
  lastFrameAt: number | null;
  lastFramePath: string | null;
  lastDepthPath: string | null;
  errors: number;
  captureType: 'uvc' | 'csi' | 'realsense' | 'oak' | 'unknown';
}

function detectCaptureType(source: string): PhysicalCameraState['captureType'] {
  if (source.startsWith('realsense://')) return 'realsense';
  if (source.startsWith('oak://')) return 'oak';
  if (source.startsWith('csi://')) return 'csi';
  if (source.startsWith('/dev/video')) return 'uvc';
  return 'unknown';
}

export const physicalCameraHandler: TraitHandler<PhysicalCameraConfig> = {
  name: 'physical_camera_input',

  defaultConfig: {
    source: '/dev/video0',
    width: 1920,
    height: 1080,
    fps: 30,
    format: 'rgb8',
    depth_enabled: false,
    depth_min_m: 0.1,
    depth_max_m: 10.0,
    frame_dir: '/tmp/holo-frames',
    max_frames_queued: 5,
    emit_perception: true,
  },

  onAttach(node: HSPlusNode, config: PhysicalCameraConfig): void {
    const state: PhysicalCameraState = {
      source: config.source,
      connected: false,
      frameCount: 0,
      depthFrameCount: 0,
      lastFrameAt: null,
      lastFramePath: null,
      lastDepthPath: null,
      errors: 0,
      captureType: detectCaptureType(config.source),
    };
    node.__camInputState = state;
  },

  onDetach(node: HSPlusNode): void {
    delete node.__camInputState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: PhysicalCameraConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__camInputState as PhysicalCameraState | undefined;
    if (!state) return;

    const t = typeof event === 'string' ? event : (event as { type: string }).type;

    switch (t) {
      case 'camera:open':
        state.connected = true;
        state.source = config.source;
        state.captureType = detectCaptureType(config.source);
        context.emit?.('camera:opened', {
          source: state.source,
          captureType: state.captureType,
          width: config.width,
          height: config.height,
          fps: config.fps,
          depthEnabled: config.depth_enabled,
        });
        break;

      case 'camera:frame': {
        if (!state.connected) return;
        const frame = event as {
          type: string;
          path?: string;
          width?: number;
          height?: number;
          timestamp?: number;
          seq?: number;
        };
        state.frameCount++;
        state.lastFrameAt = frame.timestamp ?? Date.now();
        state.lastFramePath = frame.path ?? null;

        if (config.emit_perception) {
          context.emit?.('perception:update', {
            source: state.source,
            captureType: state.captureType,
            frameSeq: frame.seq ?? state.frameCount,
            timestamp: state.lastFrameAt,
            framePath: state.lastFramePath,
            depthPath: state.lastDepthPath,
            width: frame.width ?? config.width,
            height: frame.height ?? config.height,
          });
        }
        break;
      }

      case 'camera:depth_frame': {
        if (!state.connected || !config.depth_enabled) return;
        const df = event as {
          type: string;
          path?: string;
          timestamp?: number;
          seq?: number;
          minM?: number;
          maxM?: number;
        };
        state.depthFrameCount++;
        state.lastDepthPath = df.path ?? null;
        context.emit?.('depth:update', {
          source: state.source,
          depthPath: state.lastDepthPath,
          frameSeq: df.seq ?? state.depthFrameCount,
          timestamp: df.timestamp ?? Date.now(),
          minM: df.minM ?? config.depth_min_m,
          maxM: df.maxM ?? config.depth_max_m,
        });
        break;
      }

      case 'camera:error': {
        state.errors++;
        const err = event as { type: string; message?: string };
        context.emit?.('camera:error', { source: state.source, message: err.message ?? 'unknown' });
        break;
      }

      case 'camera:close':
        state.connected = false;
        state.lastFramePath = null;
        state.lastDepthPath = null;
        context.emit?.('camera:closed', { source: state.source });
        break;
    }
  },
};

export default physicalCameraHandler;
