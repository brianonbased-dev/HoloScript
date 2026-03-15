/**
 * GeospatialAnchor Trait
 *
 * Lat/lon/alt world anchoring for outdoor AR experiences.
 * Uses GPS and ARCore/ARKit geospatial APIs.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AltitudeType = 'terrain' | 'rooftop' | 'absolute' | 'relative_to_ground';
type AnchorState = 'unresolved' | 'resolving' | 'resolved' | 'tracking' | 'limited' | 'lost';

interface GeospatialAnchorState {
  state: AnchorState;
  accuracy: number; // meters
  headingAccuracy: number; // degrees
  resolvedPosition: { lat: number; lon: number; alt: number } | null;
  localPosition: { x: number; y: number; z: number };
  retryCount: number;
  lastUpdateTime: number;
  anchorHandle: unknown;
}

interface GeospatialAnchorConfig {
  latitude: number;
  longitude: number;
  altitude: number;
  altitude_type: AltitudeType;
  heading: number; // degrees from north
  accuracy_threshold: number; // meters
  visual_indicator: boolean;
  auto_resolve: boolean;
  retry_on_lost: boolean;
  max_retries: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// =============================================================================
// HANDLER
// =============================================================================

export const geospatialAnchorHandler: TraitHandler<GeospatialAnchorConfig> = {
  name: 'geospatial_anchor',

  defaultConfig: {
    latitude: 0,
    longitude: 0,
    altitude: 0,
    altitude_type: 'terrain',
    heading: 0,
    accuracy_threshold: 10,
    visual_indicator: false,
    auto_resolve: true,
    retry_on_lost: true,
    max_retries: 3,
  },

  onAttach(node, config, context) {
    const state: GeospatialAnchorState = {
      state: 'unresolved',
      accuracy: Infinity,
      headingAccuracy: Infinity,
      resolvedPosition: null,
      localPosition: { x: 0, y: 0, z: 0 },
      retryCount: 0,
      lastUpdateTime: 0,
      anchorHandle: null,
    };
    (node as any).__geospatialAnchorState = state;

    if (config.auto_resolve) {
      state.state = 'resolving';
      context.emit?.('geospatial_anchor_request', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        altitude: config.altitude,
        altitudeType: config.altitude_type,
        heading: config.heading,
      });
    }

    if (config.visual_indicator) {
      context.emit?.('geospatial_indicator_show', {
        node,
        state: 'resolving',
      });
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__geospatialAnchorState as GeospatialAnchorState;
    if (state?.anchorHandle) {
      context.emit?.('geospatial_anchor_release', { node, handle: state.anchorHandle });
    }
    if (config.visual_indicator) {
      context.emit?.('geospatial_indicator_hide', { node });
    }
    delete (node as any).__geospatialAnchorState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__geospatialAnchorState as GeospatialAnchorState;
    if (!state) return;

    state.lastUpdateTime += delta;

    // Update visual indicator
    if (config.visual_indicator) {
      context.emit?.('geospatial_indicator_update', {
        node,
        state: state.state,
        accuracy: state.accuracy,
      });
    }

    // Apply local position from resolved anchor
    if (state.state === 'tracking' || state.state === 'resolved') {
      if ((node as any).position) {
        (node as any).position.x = state.localPosition.x;
        (node as any).position.y = state.localPosition.y;
        (node as any).position.z = state.localPosition.z;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__geospatialAnchorState as GeospatialAnchorState;
    if (!state) return;

    if (event.type === 'geospatial_anchor_resolved') {
      state.state = 'resolved';
      state.anchorHandle = event.handle;
      state.resolvedPosition = {
        lat: event.latitude as number,
        lon: event.longitude as number,
        alt: event.altitude as number,
      };
      state.accuracy = event.accuracy as number;

      context.emit?.('on_geospatial_anchor_resolved', {
        node,
        latitude: event.latitude,
        longitude: event.longitude,
        altitude: event.altitude,
        accuracy: state.accuracy,
      });
    } else if (event.type === 'geospatial_pose_update') {
      state.localPosition = event.localPosition as typeof state.localPosition;
      state.accuracy = event.accuracy as number;
      state.headingAccuracy = event.headingAccuracy as number;

      if (state.accuracy <= config.accuracy_threshold) {
        state.state = 'tracking';
      } else {
        state.state = 'limited';
      }
    } else if (event.type === 'geospatial_tracking_lost') {
      state.state = 'lost';

      if (config.retry_on_lost && state.retryCount < config.max_retries) {
        state.retryCount++;
        state.state = 'resolving';

        context.emit?.('geospatial_anchor_request', {
          node,
          latitude: config.latitude,
          longitude: config.longitude,
          altitude: config.altitude,
          altitudeType: config.altitude_type,
          heading: config.heading,
        });
      } else {
        context.emit?.('on_geospatial_anchor_lost', { node });
      }
    } else if (event.type === 'geospatial_anchor_resolve') {
      state.state = 'resolving';
      state.retryCount = 0;

      context.emit?.('geospatial_anchor_request', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        altitude: config.altitude,
        altitudeType: config.altitude_type,
        heading: config.heading,
      });
    } else if (event.type === 'geospatial_query_distance') {
      const targetLat = event.latitude as number;
      const targetLon = event.longitude as number;

      if (state.resolvedPosition) {
        const distance = haversineDistance(
          state.resolvedPosition.lat,
          state.resolvedPosition.lon,
          targetLat,
          targetLon
        );

        context.emit?.('geospatial_distance_result', {
          queryId: event.queryId,
          node,
          distance,
        });
      }
    }
  },
};

export default geospatialAnchorHandler;
