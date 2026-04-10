/**
 * ReverbZone Trait
 *
 * Spatial reverb zones with room acoustics simulation.
 * Supports box, sphere, and custom shapes with smooth transitions.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ReverbPreset =
  | 'room'
  | 'hall'
  | 'cathedral'
  | 'cave'
  | 'outdoor'
  | 'bathroom'
  | 'studio'
  | 'custom';
type ZoneShape = 'box' | 'sphere' | 'convex';

interface ReverbZoneState {
  listenersInZone: Set<string>;
  currentWetLevel: number;
  targetWetLevel: number;
  blendProgress: number;
  isActive: boolean;
  convolverLoaded: boolean;
}

interface ReverbZoneConfig {
  preset: ReverbPreset;
  size: number;
  decay_time: number;
  damping: number;
  diffusion: number;
  pre_delay: number;
  wet_level: number;
  dry_level: number;
  shape: ZoneShape;
  priority: number;
  blend_distance: number;
  impulse_response_url: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const reverbZoneHandler: TraitHandler<ReverbZoneConfig> = {
  name: 'reverb_zone',

  defaultConfig: {
    preset: 'room',
    size: 10,
    decay_time: 1.5,
    damping: 0.5,
    diffusion: 0.7,
    pre_delay: 20,
    wet_level: 0.3,
    dry_level: 1.0,
    shape: 'box',
    priority: 0,
    blend_distance: 2,
    impulse_response_url: '',
  },

  onAttach(node, config, context) {
    const state: ReverbZoneState = {
      listenersInZone: new Set(),
      currentWetLevel: 0,
      targetWetLevel: 0,
      blendProgress: 0,
      isActive: true,
      convolverLoaded: false,
    };
    node.__reverbZoneState = state;

    // Register reverb zone
    context.emit?.('reverb_zone_register', {
      node,
      preset: config.preset,
      decayTime: config.decay_time,
      damping: config.damping,
      diffusion: config.diffusion,
      preDelay: config.pre_delay,
      shape: config.shape,
      size: config.size,
      priority: config.priority,
      impulseResponseUrl: config.impulse_response_url,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('reverb_zone_unregister', { node });
    delete node.__reverbZoneState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__reverbZoneState as ReverbZoneState;
    if (!state || !state.isActive) return;

    // Smooth blend toward target wet level
    const blendSpeed = delta * 2; // 0.5 seconds to blend

    if (state.currentWetLevel < state.targetWetLevel) {
      state.currentWetLevel = Math.min(state.currentWetLevel + blendSpeed, state.targetWetLevel);
    } else if (state.currentWetLevel > state.targetWetLevel) {
      state.currentWetLevel = Math.max(state.currentWetLevel - blendSpeed, state.targetWetLevel);
    }

    // Update reverb mix
    if (state.listenersInZone.size > 0) {
      context.emit?.('reverb_update_mix', {
        node,
        wetLevel: state.currentWetLevel * config.wet_level,
        dryLevel: config.dry_level,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__reverbZoneState as ReverbZoneState;
    if (!state) return;

    if (event.type === 'listener_enter_zone') {
      const listenerId = event.listenerId as string;
      const wasEmpty = state.listenersInZone.size === 0;

      state.listenersInZone.add(listenerId);
      state.targetWetLevel = 1;

      if (wasEmpty) {
        context.emit?.('reverb_zone_enter', {
          node,
          listenerId,
          preset: config.preset,
        });
      }
    } else if (event.type === 'listener_exit_zone') {
      const listenerId = event.listenerId as string;
      state.listenersInZone.delete(listenerId);

      if (state.listenersInZone.size === 0) {
        state.targetWetLevel = 0;
        context.emit?.('reverb_zone_exit', { node, listenerId });
      }
    } else if (event.type === 'listener_distance_update') {
      const distance = event.distance as number;

      // Blend based on distance from zone edge
      if (distance < config.blend_distance) {
        state.targetWetLevel = 1 - distance / config.blend_distance;
      } else {
        state.targetWetLevel = 0;
      }
    } else if (event.type === 'convolver_loaded') {
      state.convolverLoaded = true;
      context.emit?.('reverb_zone_ready', { node });
    } else if (event.type === 'reverb_zone_set_preset') {
      context.emit?.('reverb_zone_update', {
        node,
        preset: event.preset,
        decayTime: event.decayTime ?? config.decay_time,
      });
    }
  },
};

export default reverbZoneHandler;
