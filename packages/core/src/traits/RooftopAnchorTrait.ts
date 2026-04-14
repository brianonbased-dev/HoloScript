/**
 * RooftopAnchor Trait
 *
 * Building rooftop-relative positioning using 3D Tiles or building databases.
 * Places content relative to building rooftops for urban AR.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AnchorState = 'unresolved' | 'resolving' | 'resolved' | 'tracking' | 'unavailable';

interface RooftopAnchorState {
  state: AnchorState;
  isResolved: boolean;
  buildingHeight: number; // meters
  rooftopPosition: [number, number, number];
  groundPosition: { lat: number; lon: number };
  estimatedFloors: number;
  confidence: number;
  anchorHandle: unknown;
}

interface RooftopAnchorConfig {
  latitude: number;
  longitude: number;
  elevation_offset: number; // meters above rooftop
  building_id: string; // Optional specific building ID
  auto_resolve: boolean;
  fallback_height: number; // Default if building not found
  align_to_edge: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const rooftopAnchorHandler: TraitHandler<RooftopAnchorConfig> = {
  name: 'rooftop_anchor',

  defaultConfig: {
    latitude: 0,
    longitude: 0,
    elevation_offset: 0,
    building_id: '',
    auto_resolve: true,
    fallback_height: 10,
    align_to_edge: false,
  },

  onAttach(node, config, context) {
    const state: RooftopAnchorState = {
      state: 'unresolved',
      isResolved: false,
      buildingHeight: 0,
      rooftopPosition: [0, 0, 0],
      groundPosition: { lat: config.latitude, lon: config.longitude },
      estimatedFloors: 0,
      confidence: 0,
      anchorHandle: null,
    };
    node.__rooftopAnchorState = state;

    if (config.auto_resolve) {
      state.state = 'resolving';

      context.emit?.('rooftop_anchor_request', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        buildingId: config.building_id,
        elevationOffset: config.elevation_offset,
        alignToEdge: config.align_to_edge,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__rooftopAnchorState as RooftopAnchorState;
    if (state?.anchorHandle) {
      context.emit?.('rooftop_anchor_release', { node, handle: state.anchorHandle });
    }
    delete node.__rooftopAnchorState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = node.__rooftopAnchorState as RooftopAnchorState;
    if (!state) return;

    // Apply position from resolved anchor
    if (state.state === 'tracking' || state.state === 'resolved') {
      if (node.position) {
        node.position[0] = state.rooftopPosition[0];
        node.position[1] = state.rooftopPosition[1] + config.elevation_offset;
        node.position[2] = state.rooftopPosition[2];
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__rooftopAnchorState as RooftopAnchorState;
    if (!state) return;

    if (event.type === 'rooftop_anchor_resolved') {
      state.state = 'resolved';
      state.isResolved = true;
      state.anchorHandle = event.handle;
      state.buildingHeight = event.buildingHeight as number;
      state.estimatedFloors = (event.floors as number) || Math.floor(state.buildingHeight / 3);
      state.confidence = (event.confidence as number) || 1.0;
      state.rooftopPosition = event.position as typeof state.rooftopPosition;

      context.emit?.('on_rooftop_resolved', {
        node,
        buildingHeight: state.buildingHeight,
        floors: state.estimatedFloors,
        confidence: state.confidence,
      });
    } else if (event.type === 'rooftop_anchor_not_found') {
      // Use fallback height
      state.buildingHeight = config.fallback_height;
      state.state = 'resolved';
      state.isResolved = true;
      state.confidence = 0.5;

      // Request geospatial position with fallback height
      context.emit?.('rooftop_anchor_fallback', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        height: config.fallback_height + config.elevation_offset,
      });

      context.emit?.('on_rooftop_fallback', {
        node,
        fallbackHeight: config.fallback_height,
      });
    } else if (event.type === 'rooftop_pose_update') {
      state.rooftopPosition = event.position as typeof state.rooftopPosition;
      state.state = 'tracking';
    } else if (event.type === 'rooftop_anchor_unavailable') {
      state.state = 'unavailable';

      context.emit?.('on_rooftop_unavailable', {
        node,
        reason: event.reason,
      });
    } else if (event.type === 'rooftop_anchor_query') {
      context.emit?.('rooftop_anchor_info', {
        queryId: event.queryId,
        node,
        state: state.state,
        buildingHeight: state.buildingHeight,
        estimatedFloors: state.estimatedFloors,
        confidence: state.confidence,
        latitude: state.groundPosition.lat,
        longitude: state.groundPosition.lon,
      });
    } else if (event.type === 'rooftop_anchor_resolve') {
      state.state = 'resolving';

      context.emit?.('rooftop_anchor_request', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        buildingId: config.building_id,
        elevationOffset: config.elevation_offset,
      });
    }
  },
};

export default rooftopAnchorHandler;
