import type { Vector3 } from '../types';
﻿/**
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
  worldPosition: Vector3;
  relativePosition: Vector3;
  headRotation: { x: number; y: number; z: number; w: number };
  stabilizedPosition: Vector3;
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
  position: [number, number, number],
  rotation: { x: number; y: number; z: number; w: number }
): Vector3 {
  // Conjugate of quaternion for inverse rotation
  const qx = -rotation[0];
  const qy = -rotation[1];
  const qz = -rotation[2];
  const qw = rotation[3];

  // Rotate position by inverse
  const ix = qw * position[0] + qy * position[2] - qz * position[1];
  const iy = qw * position[1] + qz * position[0] - qx * position[2];
  const iz = qw * position[2] + qx * position[1] - qy * position[0];
  const iw = -qx * position[0] - qy * position[1] - qz * position[2];

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
      worldPosition: [0, 0, 0 ],
      relativePosition: [0, 0, 0 ],
      headRotation: [0, 0, 0, 1 ],
      stabilizedPosition: [0, 0, 0 ],
      lastUpdateTime: 0,
      audioSourceId: null,
    };
    node.__headTrackedAudioState = state;

    // Get initial world position
    if (node.position) {
      state.worldPosition = { ...node.position };
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
        x: state.stabilizedPosition[0] * s + compensated[0] * (1 - s),
        y: state.stabilizedPosition[1] * s + compensated[1] * (1 - s),
        z: state.stabilizedPosition[2] * s + compensated[2] * (1 - s),
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
        x: state.relativePosition[0] * (1 - blend) + worldCompensated[0] * blend,
        y: state.relativePosition[1] * (1 - blend) + worldCompensated[1] * blend,
        z: state.relativePosition[2] * (1 - blend) + worldCompensated[2] * blend,
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
