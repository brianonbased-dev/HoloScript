/**
 * AudioOcclusion Trait
 *
 * Sound blocked and filtered by physical/virtual geometry.
 * Uses raycasting and material properties for realistic audio occlusion.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type OcclusionMode = 'raycast' | 'simple' | 'none';

interface OccludingObject {
  id: string;
  material: string;
  distance: number;
  transmission: number;
}

interface AudioOcclusionState {
  isOccluded: boolean;
  occlusionAmount: number;
  lowPassFrequency: number;
  targetLowPass: number;
  occludingObjects: OccludingObject[];
  lastRaycastTime: number;
  sourcePosition: { x: number; y: number; z: number };
  listenerPosition: { x: number; y: number; z: number };
}

interface AudioOcclusionConfig {
  mode: OcclusionMode;
  frequency_dependent: boolean;
  low_pass_filter: boolean;
  attenuation_factor: number;
  transmission_factor: number;
  update_rate: number;
  max_occlusion_db: number;
  low_pass_min_freq: number;
  low_pass_max_freq: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateOcclusion(
  occluders: OccludingObject[],
  attenuation: number,
  transmission: number
): number {
  if (occluders.length === 0) return 0;

  let totalOcclusion = 0;
  for (const occluder of occluders) {
    const materialFactor = occluder.transmission * transmission;
    totalOcclusion += attenuation * (1 - materialFactor);
  }

  return Math.min(1, totalOcclusion);
}

// =============================================================================
// HANDLER
// =============================================================================

export const audioOcclusionHandler: TraitHandler<AudioOcclusionConfig> = {
  name: 'audio_occlusion',

  defaultConfig: {
    mode: 'raycast',
    frequency_dependent: true,
    low_pass_filter: true,
    attenuation_factor: 0.5,
    transmission_factor: 0.2,
    update_rate: 15,
    max_occlusion_db: -24,
    low_pass_min_freq: 500,
    low_pass_max_freq: 22000,
  },

  onAttach(node, config, context) {
    const state: AudioOcclusionState = {
      isOccluded: false,
      occlusionAmount: 0,
      lowPassFrequency: config.low_pass_max_freq,
      targetLowPass: config.low_pass_max_freq,
      occludingObjects: [],
      lastRaycastTime: 0,
      sourcePosition: { x: 0, y: 0, z: 0 },
      listenerPosition: { x: 0, y: 0, z: 0 },
    };
    (node as any).__audioOcclusionState = state;

    context.emit?.('audio_occlusion_register', {
      node,
      mode: config.mode,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('audio_occlusion_unregister', { node });
    delete (node as any).__audioOcclusionState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__audioOcclusionState as AudioOcclusionState;
    if (!state || config.mode === 'none') return;

    const now = Date.now();
    const updateInterval = 1000 / config.update_rate;

    // Rate-limited raycast
    if (config.mode === 'raycast' && now - state.lastRaycastTime >= updateInterval) {
      state.lastRaycastTime = now;

      context.emit?.('audio_occlusion_raycast', {
        node,
        from: state.sourcePosition,
        to: state.listenerPosition,
      });
    }

    // Smooth low-pass filter transition
    if (config.low_pass_filter) {
      const smoothSpeed = delta * 10;
      if (state.lowPassFrequency < state.targetLowPass) {
        state.lowPassFrequency = Math.min(
          state.lowPassFrequency + smoothSpeed * 1000,
          state.targetLowPass
        );
      } else if (state.lowPassFrequency > state.targetLowPass) {
        state.lowPassFrequency = Math.max(
          state.lowPassFrequency - smoothSpeed * 1000,
          state.targetLowPass
        );
      }

      context.emit?.('audio_set_lowpass', {
        node,
        frequency: state.lowPassFrequency,
      });
    }

    // Apply volume attenuation
    if (state.occlusionAmount > 0) {
      const db = state.occlusionAmount * config.max_occlusion_db;
      const gain = Math.pow(10, db / 20);

      context.emit?.('audio_set_gain', {
        node,
        gain,
        source: 'occlusion',
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__audioOcclusionState as AudioOcclusionState;
    if (!state) return;

    if (event.type === 'audio_occlusion_raycast_result') {
      const wasOccluded = state.isOccluded;
      state.occludingObjects = (event.occluders as OccludingObject[]) || [];
      state.isOccluded = state.occludingObjects.length > 0;

      state.occlusionAmount = calculateOcclusion(
        state.occludingObjects,
        config.attenuation_factor,
        config.transmission_factor
      );

      // Calculate low-pass target
      if (config.frequency_dependent && state.isOccluded) {
        const freqRange = config.low_pass_max_freq - config.low_pass_min_freq;
        state.targetLowPass = config.low_pass_max_freq - state.occlusionAmount * freqRange;
      } else {
        state.targetLowPass = config.low_pass_max_freq;
      }

      if (state.isOccluded && !wasOccluded) {
        context.emit?.('audio_occlusion_start', {
          node,
          amount: state.occlusionAmount,
          occluders: state.occludingObjects.length,
        });
      } else if (!state.isOccluded && wasOccluded) {
        context.emit?.('audio_occlusion_end', { node });
      }
    } else if (event.type === 'source_position_update') {
      state.sourcePosition = event.position as typeof state.sourcePosition;
    } else if (event.type === 'listener_position_update') {
      state.listenerPosition = event.position as typeof state.listenerPosition;
    }
  },
};

export default audioOcclusionHandler;
