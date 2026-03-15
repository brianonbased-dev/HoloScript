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
  surfaceNormal: { x: number; y: number; z: number };
  localPosition: { x: number; y: number; z: number };
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
      surfaceNormal: { x: 0, y: 1, z: 0 },
      localPosition: { x: 0, y: 0, z: 0 },
      localRotation: { x: 0, y: 0, z: 0, w: 1 },
      confidence: 0,
      anchorHandle: null,
    };
    (node as any).__terrainAnchorState = state;

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
    const state = (node as any).__terrainAnchorState as TerrainAnchorState;
    if (state?.anchorHandle) {
      context.emit?.('terrain_anchor_release', { node, handle: state.anchorHandle });
    }
    delete (node as any).__terrainAnchorState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = (node as any).__terrainAnchorState as TerrainAnchorState;
    if (!state) return;

    if (state.state === 'tracking' || state.state === 'resolved') {
      // Apply position
      if ((node as any).position) {
        if (config.smoothing > 0) {
          const s = config.smoothing;
          (node as any).position.x = (node as any).position.x * s + state.localPosition.x * (1 - s);
          (node as any).position.y =
            (node as any).position.y * s +
            (state.localPosition.y + config.elevation_offset) * (1 - s);
          (node as any).position.z = (node as any).position.z * s + state.localPosition.z * (1 - s);
        } else {
          (node as any).position.x = state.localPosition.x;
          (node as any).position.y = state.localPosition.y + config.elevation_offset;
          (node as any).position.z = state.localPosition.z;
        }
      }

      // Apply surface normal alignment
      if (config.surface_normal_alignment && (node as any).rotation) {
        if (config.smoothing > 0) {
          const s = config.smoothing;
          (node as any).rotation.x = (node as any).rotation.x * s + state.localRotation.x * (1 - s);
          (node as any).rotation.y = (node as any).rotation.y * s + state.localRotation.y * (1 - s);
          (node as any).rotation.z = (node as any).rotation.z * s + state.localRotation.z * (1 - s);
          if ((node as any).rotation.w !== undefined) {
            (node as any).rotation.w =
              (node as any).rotation.w * s + state.localRotation.w * (1 - s);
          }
        } else {
          (node as any).rotation.x = state.localRotation.x;
          (node as any).rotation.y = state.localRotation.y;
          (node as any).rotation.z = state.localRotation.z;
          if ((node as any).rotation.w !== undefined) {
            (node as any).rotation.w = state.localRotation.w;
          }
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__terrainAnchorState as TerrainAnchorState;
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
          const angle = Math.acos(up.y);
          const axis = { x: -up.z, y: 0, z: up.x };
          const len = Math.sqrt(axis.x * axis.x + axis.z * axis.z);

          if (len > 0.001) {
            const halfAngle = angle / 2;
            const s = Math.sin(halfAngle) / len;
            state.localRotation = {
              x: axis.x * s,
              y: 0,
              z: axis.z * s,
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
