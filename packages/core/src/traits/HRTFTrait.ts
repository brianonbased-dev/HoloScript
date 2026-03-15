/**
 * HRTF Trait
 *
 * Head-Related Transfer Function for realistic binaural 3D audio.
 * Supports multiple HRTF databases and personalization.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type HRTFDatabase = 'cipic' | 'listen' | 'ari' | 'thu' | 'custom';
type Interpolation = 'nearest' | 'bilinear' | 'sphere';

interface HRTFState {
  isActive: boolean;
  currentProfile: string;
  databaseLoaded: boolean;
  subjectId: number | null;
  headRadius: number;
  listenerPosition: { x: number; y: number; z: number };
  listenerOrientation: {
    forward: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
  };
}

interface HRTFConfig {
  profile: string;
  database: HRTFDatabase;
  custom_sofa_url: string;
  interpolation: Interpolation;
  crossfade_time: number;
  head_radius: number;
  enable_near_field: boolean;
  itd_model: 'spherical' | 'measured';
}

// =============================================================================
// HANDLER
// =============================================================================

export const hrtfHandler: TraitHandler<HRTFConfig> = {
  name: 'hrtf',

  defaultConfig: {
    profile: 'generic',
    database: 'cipic',
    custom_sofa_url: '',
    interpolation: 'bilinear',
    crossfade_time: 50,
    head_radius: 0.0875,
    enable_near_field: true,
    itd_model: 'spherical',
  },

  onAttach(node, config, context) {
    const state: HRTFState = {
      isActive: true,
      currentProfile: config.profile,
      databaseLoaded: false,
      subjectId: null,
      headRadius: config.head_radius,
      listenerPosition: { x: 0, y: 0, z: 0 },
      listenerOrientation: { forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
    };
    (node as any).__hrtfState = state;

    // Request HRTF database load
    if (config.custom_sofa_url) {
      context.emit?.('hrtf_load_custom', {
        node,
        url: config.custom_sofa_url,
      });
    } else {
      context.emit?.('hrtf_load_database', {
        node,
        database: config.database,
        profile: config.profile,
      });
    }

    context.emit?.('hrtf_configure', {
      node,
      interpolation: config.interpolation,
      crossfadeTime: config.crossfade_time,
      headRadius: config.head_radius,
      nearField: config.enable_near_field,
      itdModel: config.itd_model,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('hrtf_disable', { node });
    delete (node as any).__hrtfState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__hrtfState as HRTFState;
    if (!state || !state.isActive) return;

    // Profile change
    if (config.profile !== state.currentProfile) {
      state.currentProfile = config.profile;
      context.emit?.('hrtf_change_profile', {
        node,
        profile: config.profile,
        crossfadeTime: config.crossfade_time,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__hrtfState as HRTFState;
    if (!state) return;

    if (event.type === 'hrtf_database_loaded') {
      state.databaseLoaded = true;
      state.subjectId = event.subjectId as number | null;
      context.emit?.('hrtf_ready', { node, subjectId: state.subjectId });
    } else if (event.type === 'listener_update') {
      state.listenerPosition = event.position as typeof state.listenerPosition;
      state.listenerOrientation = event.orientation as typeof state.listenerOrientation;

      context.emit?.('hrtf_listener_update', {
        node,
        position: state.listenerPosition,
        orientation: state.listenerOrientation,
      });
    } else if (event.type === 'hrtf_set_head_radius') {
      state.headRadius = event.radius as number;
      context.emit?.('hrtf_configure', {
        node,
        headRadius: state.headRadius,
      });
    } else if (event.type === 'hrtf_enable') {
      state.isActive = true;
    } else if (event.type === 'hrtf_disable') {
      state.isActive = false;
    }
  },
};

export default hrtfHandler;
