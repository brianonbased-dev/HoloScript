import type { Vector3 } from '../types';
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
  listenerPosition: Vector3;
  listenerOrientation: {
    forward: Vector3;
    up: Vector3;
  };
  /** Last config snapshot — drives change-detection emits in onUpdate. */
  lastInterpolation: Interpolation;
  lastCrossfadeTime: number;
  lastNearField: boolean;
  lastItdModel: 'spherical' | 'measured';
  lastDatabase: HRTFDatabase;
  lastSofaUrl: string;
  /** Last listener pose we emitted — drives debounce in onUpdate. */
  lastEmittedPosition: Vector3;
  lastEmittedRotation: Vector3 | null;
}

/**
 * Squared-distance threshold below which a listener pose change does
 * NOT re-emit `hrtf_listener_update`. 0.0001 m² ≈ 1 cm — finer than
 * head-radius (0.0875 m), and the audio renderer already crossfades
 * over `crossfade_time` ms so sub-cm jitter is below perceptual floor.
 */
const POSITION_CHANGE_THRESHOLD_SQ = 0.0001;

/**
 * Squared rotation-component threshold for re-emit. 0.0001 rad² ≈
 * 0.57° — well below the head-orientation JND (~3° azimuth).
 */
const ROTATION_CHANGE_THRESHOLD_SQ = 0.0001;

function distanceSq(a: Vector3, b: Vector3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
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
      listenerPosition: [0, 0, 0],
      listenerOrientation: { forward: [0, 0, -1], up: [0, 1, 0] },
      lastInterpolation: config.interpolation,
      lastCrossfadeTime: config.crossfade_time,
      lastNearField: config.enable_near_field,
      lastItdModel: config.itd_model,
      lastDatabase: config.database,
      lastSofaUrl: config.custom_sofa_url,
      lastEmittedPosition: [0, 0, 0],
      lastEmittedRotation: null,
    };
    node.__hrtfState = state;

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
    delete node.__hrtfState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__hrtfState as HRTFState;
    if (!state || !state.isActive) return;

    // ---- Profile change ------------------------------------------------
    if (config.profile !== state.currentProfile) {
      state.currentProfile = config.profile;
      context.emit?.('hrtf_change_profile', {
        node,
        profile: config.profile,
        crossfadeTime: config.crossfade_time,
      });
    }

    // ---- Database / custom SOFA URL change -----------------------------
    // If the active database flips at runtime (rare but supported per the
    // HRTFDatabase union), or the custom_sofa_url changes, re-issue the
    // load request. The audio backend is responsible for crossfading
    // between databases over `crossfade_time` ms.
    if (config.custom_sofa_url && config.custom_sofa_url !== state.lastSofaUrl) {
      state.lastSofaUrl = config.custom_sofa_url;
      state.databaseLoaded = false;
      context.emit?.('hrtf_load_custom', { node, url: config.custom_sofa_url });
    } else if (!config.custom_sofa_url && config.database !== state.lastDatabase) {
      state.lastDatabase = config.database;
      state.databaseLoaded = false;
      context.emit?.('hrtf_load_database', {
        node,
        database: config.database,
        profile: config.profile,
      });
    }

    // ---- Configuration parameter changes -------------------------------
    // interpolation, crossfade_time, head_radius, enable_near_field, and
    // itd_model are all carried by `hrtf_configure`. Detect any drift
    // from the last applied snapshot and re-emit a single configure event
    // (audio backend re-applies them atomically).
    const configChanged =
      config.interpolation !== state.lastInterpolation ||
      config.crossfade_time !== state.lastCrossfadeTime ||
      config.head_radius !== state.headRadius ||
      config.enable_near_field !== state.lastNearField ||
      config.itd_model !== state.lastItdModel;
    if (configChanged) {
      state.lastInterpolation = config.interpolation;
      state.lastCrossfadeTime = config.crossfade_time;
      state.headRadius = config.head_radius;
      state.lastNearField = config.enable_near_field;
      state.lastItdModel = config.itd_model;
      context.emit?.('hrtf_configure', {
        node,
        interpolation: config.interpolation,
        crossfadeTime: config.crossfade_time,
        headRadius: config.head_radius,
        nearField: config.enable_near_field,
        itdModel: config.itd_model,
      });
    }

    // ---- Listener pose tracking ----------------------------------------
    // HRTF rendering depends on relative source-to-listener geometry.
    // Pull the current headset pose from VRContext each frame and emit
    // `hrtf_listener_update` when it crosses the perceptual threshold.
    // (The trait's onEvent path also accepts `listener_update` events
    // from non-VR runtimes that compute pose elsewhere; both paths feed
    // the same emit.)
    const vr = (context as { vr?: { headset?: { position?: Vector3; rotation?: Vector3 } } }).vr;
    const headsetPos = vr?.headset?.position;
    const headsetRot = vr?.headset?.rotation;
    if (headsetPos && Array.isArray(headsetPos) && headsetPos.length === 3) {
      const movedFar = distanceSq(headsetPos, state.lastEmittedPosition) > POSITION_CHANGE_THRESHOLD_SQ;
      const rotatedFar =
        headsetRot && Array.isArray(headsetRot) && headsetRot.length === 3
          ? state.lastEmittedRotation === null ||
            distanceSq(headsetRot, state.lastEmittedRotation) > ROTATION_CHANGE_THRESHOLD_SQ
          : false;
      if (movedFar || rotatedFar) {
        state.listenerPosition = [headsetPos[0], headsetPos[1], headsetPos[2]];
        state.lastEmittedPosition = [headsetPos[0], headsetPos[1], headsetPos[2]];
        if (headsetRot && Array.isArray(headsetRot) && headsetRot.length === 3) {
          state.lastEmittedRotation = [headsetRot[0], headsetRot[1], headsetRot[2]];
        }
        context.emit?.('hrtf_listener_update', {
          node,
          position: state.listenerPosition,
          orientation: state.listenerOrientation,
          headsetRotation: state.lastEmittedRotation,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__hrtfState as HRTFState;
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
