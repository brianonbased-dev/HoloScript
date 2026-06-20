/**
 * Passthrough Camera Trait
 *
 * Declares a mixed-reality passthrough camera frame source as DATA (F.126). The capability is
 * consumed by compile targets — the Quest target (QuestCompiler) reads this config to emit the
 * Camera2 passthrough controller (vendor camera selection, max-resolution capture, YUV luminance).
 * The handler itself holds NO platform code; emit lives in the compiler that walks the trait.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface PassthroughCameraConfig {
  /** Runtime permission the platform requires for headset cameras. */
  permission: string;
  /** Vendor camera_source selector (Meta com.meta.extra_metadata.camera_source). */
  camera_source: number;
  /** Vendor position selector (Meta com.meta.extra_metadata.position). */
  camera_position: number;
  /** Fallback capture width if the sensor max-size query fails. */
  frame_width: number;
  /** Fallback capture height if the sensor max-size query fails. */
  frame_height: number;
  /** 'max' = capture at the sensor's largest advertised YUV size (more px per QR module). */
  capture: string;
  /** Pixel format requested from the camera. */
  format: string;
  /** Which plane the decoder consumes ('luminance' = Y plane). */
  plane: string;
  /** Live viewfinder downscale factor (capture / N) shown on the panel. */
  preview_downscale: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const passthroughCameraHandler: TraitHandler<PassthroughCameraConfig> = {
  name: 'passthrough_camera',

  defaultConfig: {
    permission: 'horizonos.permission.HEADSET_CAMERA',
    camera_source: 0,
    camera_position: 0,
    frame_width: 1280,
    frame_height: 960,
    capture: 'max',
    format: 'YUV_420_888',
    plane: 'luminance',
    preview_downscale: 4,
  },

  onAttach(node, _config, context) {
    context.emit?.('camera:ready', { node: node.id });
  },

  onEvent(node, _config, context, event) {
    if (event.type === 'camera:start') {
      context.emit?.('camera:started', { node: node.id });
    } else if (event.type === 'camera:stop') {
      context.emit?.('camera:stopped', { node: node.id });
    }
  },
};

export default passthroughCameraHandler;
