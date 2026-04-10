/**
 * GeospatialEnv Trait
 *
 * GPS/lat-lon world-scale environment for outdoor AR.
 * Manages the overall geospatial coordinate system.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AltitudeType = 'terrain' | 'wgs84' | 'egm96';
type LocalizationState =
  | 'idle'
  | 'initializing'
  | 'localizing'
  | 'localized'
  | 'tracking'
  | 'limited'
  | 'unavailable';

interface GeospatialEnvState {
  state: LocalizationState;
  accuracy: number; // horizontal accuracy meters
  verticalAccuracy: number;
  heading: number;
  headingAccuracy: number;
  originLat: number;
  originLon: number;
  originAlt: number;
  lastUpdateTime: number;
  vpsAvailable: boolean;
}

interface GeospatialEnvConfig {
  latitude: number; // Origin latitude
  longitude: number; // Origin longitude
  altitude: number;
  altitude_type: AltitudeType;
  heading: number;
  heading_alignment: boolean;
  accuracy_threshold: number;
  auto_initialize: boolean;
  use_vps: boolean;
  compass_smoothing: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const geospatialEnvHandler: TraitHandler<GeospatialEnvConfig> = {
  name: 'geospatial',

  defaultConfig: {
    latitude: 0,
    longitude: 0,
    altitude: 0,
    altitude_type: 'terrain',
    heading: 0,
    heading_alignment: true,
    accuracy_threshold: 5,
    auto_initialize: true,
    use_vps: true,
    compass_smoothing: 0.8,
  },

  onAttach(node, config, context) {
    const state: GeospatialEnvState = {
      state: 'idle',
      accuracy: Infinity,
      verticalAccuracy: Infinity,
      heading: config.heading,
      headingAccuracy: Infinity,
      originLat: config.latitude,
      originLon: config.longitude,
      originAlt: config.altitude,
      lastUpdateTime: 0,
      vpsAvailable: false,
    };
    node.__geospatialEnvState = state;

    if (config.auto_initialize) {
      state.state = 'initializing';
      context.emit?.('geospatial_env_initialize', {
        node,
        origin: {
          latitude: config.latitude,
          longitude: config.longitude,
          altitude: config.altitude,
          altitudeType: config.altitude_type,
        },
        useVPS: config.use_vps,
      });
    }
  },

  onDetach(node, config, context) {
    context.emit?.('geospatial_env_shutdown', { node });
    delete node.__geospatialEnvState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__geospatialEnvState as GeospatialEnvState;
    if (!state) return;

    state.lastUpdateTime += delta;

    // Check for state transitions based on accuracy
    if (state.state === 'localizing' || state.state === 'localized') {
      if (state.accuracy <= config.accuracy_threshold) {
        // Transition to tracking state when accuracy is good
        state.state = 'tracking';
        context.emit?.('on_geospatial_tracking', {
          node,
          accuracy: state.accuracy,
        });
      } else if (state.accuracy > config.accuracy_threshold * 3) {
        state.state = 'limited';
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__geospatialEnvState as GeospatialEnvState;
    if (!state) return;

    if (event.type === 'geospatial_initialized') {
      state.state = 'localizing';
      state.vpsAvailable = event.vpsAvailable as boolean;

      context.emit?.('on_geospatial_initialized', {
        node,
        vpsAvailable: state.vpsAvailable,
      });
    } else if (event.type === 'geospatial_pose_update') {
      state.accuracy = event.accuracy as number;
      state.verticalAccuracy = event.verticalAccuracy as number;
      state.headingAccuracy = event.headingAccuracy as number;

      // Apply compass smoothing
      if (config.heading_alignment) {
        const newHeading = event.heading as number;
        state.heading =
          state.heading * config.compass_smoothing + newHeading * (1 - config.compass_smoothing);
      }

      if (state.state === 'localizing') {
        state.state = 'localized';
        context.emit?.('on_geospatial_localized', {
          node,
          accuracy: state.accuracy,
        });
      }
    } else if (event.type === 'geospatial_vps_result') {
      state.vpsAvailable = event.available as boolean;

      if (state.vpsAvailable) {
        state.accuracy = Math.min(state.accuracy, event.accuracy as number);
      }
    } else if (event.type === 'geospatial_set_origin') {
      state.originLat = event.latitude as number;
      state.originLon = event.longitude as number;
      state.originAlt = event.altitude as number;

      context.emit?.('geospatial_origin_update', {
        node,
        latitude: state.originLat,
        longitude: state.originLon,
        altitude: state.originAlt,
      });
    } else if (event.type === 'geospatial_query_state') {
      context.emit?.('geospatial_state_response', {
        queryId: event.queryId,
        node,
        state: state.state,
        accuracy: state.accuracy,
        verticalAccuracy: state.verticalAccuracy,
        heading: state.heading,
        headingAccuracy: state.headingAccuracy,
        vpsAvailable: state.vpsAvailable,
      });
    } else if (event.type === 'geospatial_unavailable') {
      state.state = 'unavailable';
      context.emit?.('on_geospatial_unavailable', {
        node,
        reason: event.reason,
      });
    }
  },
};

export default geospatialEnvHandler;
