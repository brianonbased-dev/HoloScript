/**
 * HeadTrackedAudio Trait
 *
 * Audio that stays world-anchored while head/listener moves.
 * Compensates for head rotation to maintain stable spatial audio.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AnchorMode = 'world' | 'head' | 'hybrid';

interface HeadTrackedAudioState {
  isPlaying: boolean;
  worldPosition: { x: number; y: number; z: number };
  relativePosition: { x: number; y: number; z: number };
  headRotation: { x: number; y: number; z: number; w: number };
  stabilizedPosition: { x: number; y: number; z: number };
  lastUpdateTime: number;
  audioSourceId: string | null;
}

interface HeadTrackedAudioConfig {
  source: string;
  anchor_mode: AnchorMode;
  tracking_latency_compensation: boolean;
  stabilization: number; // 0-1
  bypass_spatialization: boolean;
  volume: number;
  loop: boolean;
  autoplay: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function applyInverseRotation(
  position: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number; w: number }
): { x: number; y: number; z: number } {
  // Conjugate of quaternion for inverse rotation
  const qx = -rotation.x;
  const qy = -rotation.y;
  const qz = -rotation.z;
  const qw = rotation.w;

  // Rotate position by inverse
  const ix = qw * position.x + qy * position.z - qz * position.y;
  const iy = qw * position.y + qz * position.x - qx * position.z;
  const iz = qw * position.z + qx * position.y - qy * position.x;
  const iw = -qx * position.x - qy * position.y - qz * position.z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const headTrackedAudioHandler: TraitHandler<HeadTrackedAudioConfig> = {
  name: 'head_tracked_audio',

  defaultConfig: {
    source: '',
    anchor_mode: 'world',
    tracking_latency_compensation: true,
    stabilization: 0.5,
    bypass_spatialization: false,
    volume: 1.0,
    loop: false,
    autoplay: false,
  },

  onAttach(node, config, context) {
    const state: HeadTrackedAudioState = {
      isPlaying: false,
      worldPosition: { x: 0, y: 0, z: 0 },
      relativePosition: { x: 0, y: 0, z: 0 },
      headRotation: { x: 0, y: 0, z: 0, w: 1 },
      stabilizedPosition: { x: 0, y: 0, z: 0 },
      lastUpdateTime: 0,
      audioSourceId: null,
    };
    node.__headTrackedAudioState = state;

    // Get initial world position
    if ((node as any).position) {
      state.worldPosition = { ...(node as any).position };
    }

    // Load audio source
    if (config.source) {
      context.emit?.('audio_load_source', {
        node,
        url: config.source,
        spatial: !config.bypass_spatialization,
        loop: config.loop,
        volume: config.volume,
      });
    }

    if (config.autoplay && config.source) {
      state.isPlaying = true;
    }
  },

  onDetach(node, config, context) {
    const state = node.__headTrackedAudioState as HeadTrackedAudioState;
    if (state?.isPlaying) {
      context.emit?.('audio_stop', { node });
    }
    context.emit?.('audio_dispose_source', { node });
    delete node.__headTrackedAudioState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__headTrackedAudioState as HeadTrackedAudioState;
    if (!state || !state.isPlaying) return;

    if (config.anchor_mode === 'world') {
      // Apply inverse head rotation to maintain world position perception
      const compensated = applyInverseRotation(state.worldPosition, state.headRotation);

      // Stabilization smoothing
      const s = config.stabilization;
      state.stabilizedPosition = {
        x: state.stabilizedPosition.x * s + compensated.x * (1 - s),
        y: state.stabilizedPosition.y * s + compensated.y * (1 - s),
        z: state.stabilizedPosition.z * s + compensated.z * (1 - s),
      };

      // Update audio source position
      context.emit?.('audio_set_position', {
        node,
        position: state.stabilizedPosition,
      });
    } else if (config.anchor_mode === 'head') {
      // Audio follows head - relative position stays constant
      context.emit?.('audio_set_position', {
        node,
        position: state.relativePosition,
      });
    } else if (config.anchor_mode === 'hybrid') {
      // Blend between world and head
      const worldCompensated = applyInverseRotation(state.worldPosition, state.headRotation);
      const blend = config.stabilization;

      const hybridPos = {
        x: state.relativePosition.x * (1 - blend) + worldCompensated.x * blend,
        y: state.relativePosition.y * (1 - blend) + worldCompensated.y * blend,
        z: state.relativePosition.z * (1 - blend) + worldCompensated.z * blend,
      };

      context.emit?.('audio_set_position', {
        node,
        position: hybridPos,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__headTrackedAudioState as HeadTrackedAudioState;
    if (!state) return;

    if (event.type === 'head_rotation_update') {
      state.headRotation = event.rotation as typeof state.headRotation;
    } else if (event.type === 'audio_source_loaded') {
      state.audioSourceId = event.sourceId as string;
      if (config.autoplay) {
        state.isPlaying = true;
        context.emit?.('audio_play', { node });
      }
    } else if (event.type === 'audio_play') {
      state.isPlaying = true;
      context.emit?.('audio_start', { node, loop: config.loop, volume: config.volume });
    } else if (event.type === 'audio_stop') {
      state.isPlaying = false;
      context.emit?.('audio_stop', { node });
    } else if (event.type === 'audio_set_world_position') {
      state.worldPosition = event.position as typeof state.worldPosition;
    } else if (event.type === 'audio_set_relative_position') {
      state.relativePosition = event.position as typeof state.relativePosition;
    }
  },
};

export default headTrackedAudioHandler;
