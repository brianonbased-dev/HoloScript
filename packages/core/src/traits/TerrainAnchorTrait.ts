import type { Vector3 } from '../types';
/**
 * TerrainAnchor Trait
 *
 * Ground-relative positioning using terrain elevation data.
 * Places content on real-world terrain surface.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AnchorState = 'unresolved' | 'resolving' | 'resolved' | 'tracking' | 'unavailable';

interface TerrainAnchorState {
  state: AnchorState;
  isResolved: boolean;
  terrainHeight: number; // meters above sea level
  surfaceNormal: Vector3;
  localPosition: Vector3;
  localRotation: { x: number; y: number; z: number; w: number };
  confidence: number;
  anchorHandle: unknown;
}

interface TerrainAnchorConfig {
  latitude: number;
  longitude: number;
  elevation_offset: number; // meters above terrain
  terrain_following: boolean; // Update with terrain changes
  surface_normal_alignment: boolean;
  auto_resolve: boolean;
  smoothing: number; // 0-1
}

// =============================================================================
// HANDLER
// =============================================================================

export const terrainAnchorHandler: TraitHandler<TerrainAnchorConfig> = {
  name: 'terrain_anchor',

  defaultConfig: {
    latitude: 0,
    longitude: 0,
    elevation_offset: 0,
    terrain_following: true,
    surface_normal_alignment: true,
    auto_resolve: true,
    smoothing: 0.9,
  },

  onAttach(node, config, context) {
    const state: TerrainAnchorState = {
      state: 'unresolved',
      isResolved: false,
      terrainHeight: 0,
      surfaceNormal: [0, 1, 0 ],
      localPosition: [0, 0, 0 ],
      localRotation: [0, 0, 0, 1 ],
      confidence: 0,
      anchorHandle: null,
    };
    node.__terrainAnchorState = state;

    if (config.auto_resolve) {
      state.state = 'resolving';

      context.emit?.('terrain_anchor_request', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        elevationOffset: config.elevation_offset,
        followTerrain: config.terrain_following,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__terrainAnchorState as TerrainAnchorState;
    if (state?.anchorHandle) {
      context.emit?.('terrain_anchor_release', { node, handle: state.anchorHandle });
    }
    delete node.__terrainAnchorState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = node.__terrainAnchorState as TerrainAnchorState;
    if (!state) return;

    if (state.state === 'tracking' || state.state === 'resolved') {
      // Apply position
      if (node.position) {
        if (config.smoothing > 0) {
          const s = config.smoothing;
          node.position[0] = node.position[0] * s + state.localPosition[0] * (1 - s);
          node.position[1] =
            node.position[1] * s + (state.localPosition[1] + config.elevation_offset) * (1 - s);
          node.position[2] = node.position[2] * s + state.localPosition[2] * (1 - s);
        } else {
          node.position[0] = state.localPosition[0];
          node.position[1] = state.localPosition[1] + config.elevation_offset;
          node.position[2] = state.localPosition[2];
        }
      }

      // Apply surface normal alignment
      if (config.surface_normal_alignment && node.rotation) {
        if (config.smoothing > 0) {
          const s = config.smoothing;
          node.rotation[0] = node.rotation[0] * s + state.localRotation[0] * (1 - s);
          node.rotation[1] = node.rotation[1] * s + state.localRotation[1] * (1 - s);
          node.rotation[2] = node.rotation[2] * s + state.localRotation[2] * (1 - s);
          if (node.rotation[3] !== undefined) {
            node.rotation[3] = node.rotation[3] * s + state.localRotation[3] * (1 - s);
          }
        } else {
          node.rotation[0] = state.localRotation[0];
          node.rotation[1] = state.localRotation[1];
          node.rotation[2] = state.localRotation[2];
          if (node.rotation[3] !== undefined) {
            node.rotation[3] = state.localRotation[3];
          }
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__terrainAnchorState as TerrainAnchorState;
    if (!state) return;

    if (event.type === 'terrain_anchor_resolved') {
      state.state = 'resolved';
      state.isResolved = true;
      state.anchorHandle = event.handle;
      state.terrainHeight = event.terrainHeight as number;
      state.confidence = (event.confidence as number) || 1.0;
      state.localPosition = event.position as typeof state.localPosition;

      if (event.surfaceNormal) {
        state.surfaceNormal = event.surfaceNormal as typeof state.surfaceNormal;

        // Calculate rotation from surface normal
        if (config.surface_normal_alignment) {
          const up = state.surfaceNormal;
          // Simple rotation calculation - align Y axis with surface normal
          const angle = Math.acos(up[1]);
          const axis = [-up[2], 0, up[0] ];
          const len = Math.sqrt(axis[0] * axis[0] + axis[2] * axis[2]);

          if (len > 0.001) {
            const halfAngle = angle / 2;
            const s = Math.sin(halfAngle) / len;
            state.localRotation = {
              x: axis[0] * s,
              y: 0,
              z: axis[2] * s,
              w: Math.cos(halfAngle),
            };
          }
        }
      }

      context.emit?.('on_terrain_resolved', {
        node,
        terrainHeight: state.terrainHeight,
        confidence: state.confidence,
      });
    } else if (event.type === 'terrain_pose_update') {
      state.localPosition = event.position as typeof state.localPosition;
      state.terrainHeight = event.terrainHeight as number;

      if (event.surfaceNormal) {
        state.surfaceNormal = event.surfaceNormal as typeof state.surfaceNormal;
      }

      state.state = 'tracking';
    } else if (event.type === 'terrain_anchor_unavailable') {
      state.state = 'unavailable';

      context.emit?.('on_terrain_unavailable', {
        node,
        reason: event.reason,
      });
    } else if (event.type === 'terrain_anchor_resolve') {
      state.state = 'resolving';

      context.emit?.('terrain_anchor_request', {
        node,
        latitude: config.latitude,
        longitude: config.longitude,
        elevationOffset: config.elevation_offset,
        followTerrain: config.terrain_following,
      });
    } else if (event.type === 'terrain_anchor_query') {
      context.emit?.('terrain_anchor_info', {
        queryId: event.queryId,
        node,
        state: state.state,
        terrainHeight: state.terrainHeight,
        surfaceNormal: state.surfaceNormal,
        confidence: state.confidence,
        latitude: config.latitude,
        longitude: config.longitude,
      });
    }
  },
};

export default terrainAnchorHandler;
