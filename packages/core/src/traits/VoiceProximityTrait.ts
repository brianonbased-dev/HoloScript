/**
 * VoiceProximity Trait
 *
 * Spatial voice chat with distance-based attenuation and zones.
 * Supports logarithmic, linear, and custom falloff curves.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type FalloffCurve = 'linear' | 'logarithmic' | 'exponential' | 'custom';

interface VoiceZone {
  id: string;
  type: 'public' | 'private' | 'team';
  bounds: { center: { x: number; y: number; z: number }; radius: number };
  volumeMultiplier: number;
}

interface VoiceProximityState {
  currentAttenuation: number;
  targetAttenuation: number;
  distanceToListener: number;
  isMuted: boolean;
  activeZone: string | null;
  voiceActive: boolean;
  panningVector: { x: number; y: number; z: number };
}

interface VoiceProximityConfig {
  min_distance: number;
  max_distance: number;
  falloff: FalloffCurve;
  directional: boolean;
  cone_inner_angle: number;
  cone_outer_angle: number;
  cone_outer_gain: number;
  zones: VoiceZone[];
  enable_hrtf: boolean;
  voice_activity_detection: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateAttenuation(
  distance: number,
  minDist: number,
  maxDist: number,
  curve: FalloffCurve
): number {
  if (distance <= minDist) return 1;
  if (distance >= maxDist) return 0;

  const normalized = (distance - minDist) / (maxDist - minDist);

  switch (curve) {
    case 'linear':
      return 1 - normalized;
    case 'logarithmic':
      return 1 - Math.log10(1 + normalized * 9) / Math.log10(10);
    case 'exponential':
      return Math.pow(1 - normalized, 2);
    default:
      return 1 - normalized;
  }
}

function isInZone(position: [number, number, number], zone: VoiceZone): boolean {
  const dx = position.x - zone.bounds.center.x;
  const dy = position.y - zone.bounds.center.y;
  const dz = position.z - zone.bounds.center.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  return distSq <= zone.bounds.radius * zone.bounds.radius;
}

// =============================================================================
// HANDLER
// =============================================================================

export const voiceProximityHandler: TraitHandler<VoiceProximityConfig> = {
  name: 'voice_proximity',

  defaultConfig: {
    min_distance: 1,
    max_distance: 20,
    falloff: 'logarithmic',
    directional: false,
    cone_inner_angle: 360,
    cone_outer_angle: 360,
    cone_outer_gain: 0,
    zones: [],
    enable_hrtf: true,
    voice_activity_detection: true,
  },

  onAttach(node, config, context) {
    const state: VoiceProximityState = {
      currentAttenuation: 1.0,
      targetAttenuation: 1.0,
      distanceToListener: 0,
      isMuted: false,
      activeZone: null,
      voiceActive: false,
      panningVector: { x: 0, y: 0, z: 0 },
    };
    node.__voiceProximityState = state;

    context.emit?.('voice_proximity_register', {
      node,
      minDistance: config.min_distance,
      maxDistance: config.max_distance,
      directional: config.directional,
      coneAngles: {
        inner: config.cone_inner_angle,
        outer: config.cone_outer_angle,
        outerGain: config.cone_outer_gain,
      },
      enableHRTF: config.enable_hrtf,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('voice_proximity_unregister', { node });
    delete node.__voiceProximityState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__voiceProximityState as VoiceProximityState;
    if (!state || state.isMuted) return;

    // Smooth attenuation transition
    const smoothSpeed = delta * 5;
    if (state.currentAttenuation < state.targetAttenuation) {
      state.currentAttenuation = Math.min(
        state.currentAttenuation + smoothSpeed,
        state.targetAttenuation
      );
    } else if (state.currentAttenuation > state.targetAttenuation) {
      state.currentAttenuation = Math.max(
        state.currentAttenuation - smoothSpeed,
        state.targetAttenuation
      );
    }

    // Apply attenuation
    if (state.voiceActive) {
      context.emit?.('voice_set_gain', {
        node,
        gain: state.currentAttenuation,
      });

      // Apply HRTF panning
      if (config.enable_hrtf) {
        context.emit?.('voice_set_panning', {
          node,
          vector: state.panningVector,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__voiceProximityState as VoiceProximityState;
    if (!state) return;

    if (event.type === 'voice_distance_update') {
      const distance = event.distance as number;
      const listenerPos = event.listenerPosition as { x: number; y: number; z: number };
      const speakerPos = event.speakerPosition as { x: number; y: number; z: number };

      state.distanceToListener = distance;

      // Calculate base attenuation
      let attenuation = calculateAttenuation(
        distance,
        config.min_distance,
        config.max_distance,
        config.falloff
      );

      // Apply zone modifiers
      for (const zone of config.zones) {
        if (isInZone(speakerPos, zone) && isInZone(listenerPos, zone)) {
          attenuation *= zone.volumeMultiplier;
          state.activeZone = zone.id;
          break;
        } else if (zone.type === 'private') {
          // Private zone - no audio if not both in zone
          if (isInZone(speakerPos, zone) !== isInZone(listenerPos, zone)) {
            attenuation = 0;
          }
        }
      }

      state.targetAttenuation = attenuation;

      // Calculate panning vector
      if (distance > 0) {
        state.panningVector = {
          x: (speakerPos.x - listenerPos.x) / distance,
          y: (speakerPos.y - listenerPos.y) / distance,
          z: (speakerPos.z - listenerPos.z) / distance,
        };
      }

      context.emit?.('voice_proximity_changed', {
        node,
        distance,
        attenuation: state.targetAttenuation,
        zone: state.activeZone,
      });
    } else if (event.type === 'voice_activity') {
      state.voiceActive = event.active as boolean;
    } else if (event.type === 'voice_mute') {
      state.isMuted = event.muted as boolean;
      if (state.isMuted) {
        context.emit?.('voice_set_gain', { node, gain: 0 });
      }
    } else if (event.type === 'voice_zone_enter') {
      const zoneId = event.zoneId as string;
      state.activeZone = zoneId;
      context.emit?.('voice_zone_changed', { node, zoneId });
    } else if (event.type === 'voice_zone_exit') {
      state.activeZone = null;
    }
  },
};

export default voiceProximityHandler;
