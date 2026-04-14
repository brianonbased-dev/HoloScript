import type { Vector3 } from '../types';
/**
 * PlaneDetection Trait
 *
 * Detect real-world surfaces for mixed reality placement.
 * Supports floor, wall, ceiling, and table surface detection.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type PlaneMode = 'horizontal' | 'vertical' | 'all';
type PlaneClassification = 'floor' | 'wall' | 'ceiling' | 'table' | 'door' | 'window' | 'unknown';

interface DetectedPlane {
  id: string;
  classification: PlaneClassification;
  center: Vector3;
  extent: { width: number; height: number };
  normal: Vector3;
  vertices: Array<[number, number, number]>;
  area: number;
  lastUpdated: number;
  confidence: number;
}

interface PlaneDetectionState {
  planes: Map<string, DetectedPlane>;
  lastUpdateTime: number;
  isDetecting: boolean;
  selectedPlane: string | null;
  hitTestResults: Array<{ planeId: string; point: Vector3 }>;
}

interface PlaneDetectionConfig {
  mode: PlaneMode;
  min_area: number;
  max_planes: number;
  update_interval: number;
  visual_mesh: boolean;
  classification: boolean;
  semantic_labels: boolean;
  merge_coplanar: boolean;
  plane_timeout: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const planeDetectionHandler: TraitHandler<PlaneDetectionConfig> = {
  name: 'plane_detection',

  defaultConfig: {
    mode: 'all',
    min_area: 0.25,
    max_planes: 10,
    update_interval: 100,
    visual_mesh: false,
    classification: true,
    semantic_labels: false,
    merge_coplanar: true,
    plane_timeout: 2000,
  },

  onAttach(node, config, context) {
    const state: PlaneDetectionState = {
      planes: new Map(),
      lastUpdateTime: 0,
      isDetecting: false,
      selectedPlane: null,
      hitTestResults: [],
    };
    node.__planeDetectionState = state;

    // Start plane detection
    context.emit?.('plane_detection_start', {
      node,
      mode: config.mode,
      classification: config.classification,
    });
    state.isDetecting = true;
  },

  onDetach(node, config, context) {
    const state = node.__planeDetectionState as PlaneDetectionState;
    if (state?.isDetecting) {
      context.emit?.('plane_detection_stop', { node });
    }
    delete node.__planeDetectionState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__planeDetectionState as PlaneDetectionState;
    if (!state || !state.isDetecting) return;

    const now = Date.now();

    // Rate-limited update check
    if (now - state.lastUpdateTime < config.update_interval) return;
    state.lastUpdateTime = now;

    // Remove stale planes
    const toRemove: string[] = [];
    for (const [id, plane] of state.planes) {
      if (now - plane.lastUpdated > config.plane_timeout) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      const plane = state.planes.get(id);
      state.planes.delete(id);

      context.emit?.('plane_lost', {
        node,
        planeId: id,
        classification: plane?.classification,
      });

      if (config.visual_mesh) {
        context.emit?.('plane_mesh_remove', { planeId: id });
      }
    }

    // Update visual meshes if enabled
    if (config.visual_mesh) {
      for (const [id, plane] of state.planes) {
        context.emit?.('plane_mesh_update', {
          planeId: id,
          vertices: plane.vertices,
          center: plane.center,
          normal: plane.normal,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__planeDetectionState as PlaneDetectionState;
    if (!state) return;

    if (event.type === 'plane_detected') {
      const planeData = event.plane as DetectedPlane;

      // Filter by mode
      if (config.mode === 'horizontal') {
        if (Math.abs(planeData.normal[1]) < 0.8) return;
      } else if (config.mode === 'vertical') {
        if (Math.abs(planeData.normal[1]) > 0.2) return;
      }

      // Filter by area
      if (planeData.area < config.min_area) return;

      // Limit plane count
      if (state.planes.size >= config.max_planes && !state.planes.has(planeData.id)) {
        // Find smallest plane to replace
        let smallest: { id: string; area: number } | null = null;
        for (const [id, p] of state.planes) {
          if (!smallest || p.area < smallest.area) {
            smallest = { id, area: p.area };
          }
        }
        if (smallest && smallest.area < planeData.area) {
          state.planes.delete(smallest.id);
          context.emit?.('plane_lost', { node, planeId: smallest.id });
        } else {
          return; // Don't add new plane
        }
      }

      const isNew = !state.planes.has(planeData.id);
      planeData.lastUpdated = Date.now();
      state.planes.set(planeData.id, planeData);

      if (isNew) {
        context.emit?.('plane_found', {
          node,
          planeId: planeData.id,
          classification: planeData.classification,
          center: planeData.center,
          area: planeData.area,
        });

        if (config.visual_mesh) {
          context.emit?.('plane_mesh_create', {
            planeId: planeData.id,
            vertices: planeData.vertices,
            classification: planeData.classification,
          });
        }
      } else {
        context.emit?.('plane_updated', {
          node,
          planeId: planeData.id,
          center: planeData.center,
          extent: planeData.extent,
        });
      }
    } else if (event.type === 'plane_hit_test') {
      // Perform hit test against planes
      const ray = event.ray as {
        origin: Vector3;
        direction: Vector3;
      };
      const results: Array<{
        planeId: string;
        point: Vector3;
        distance: number;
      }> = [];

      for (const [id, plane] of state.planes) {
        // Simple plane-ray intersection
        const denom =
          plane.normal[0] * ray.direction[0] +
          plane.normal[1] * ray.direction[1] +
          plane.normal[2] * ray.direction[2];

        if (Math.abs(denom) < 0.0001) continue;

        const d = -(
          plane.normal[0] * plane.center[0] +
          plane.normal[1] * plane.center[1] +
          plane.normal[2] * plane.center[2]
        );

        const t =
          -(
            plane.normal[0] * ray.origin[0] +
            plane.normal[1] * ray.origin[1] +
            plane.normal[2] * ray.origin[2] +
            d
          ) / denom;

        if (t < 0) continue;

        const point: Vector3 = [
          ray.origin[0] + t * ray.direction[0],
          ray.origin[1] + t * ray.direction[1],
          ray.origin[2] + t * ray.direction[2],
        ];

        results.push({ planeId: id, point, distance: t });
      }

      results.sort((a, b) => a.distance - b.distance);
      state.hitTestResults = results.map((r) => ({ planeId: r.planeId, point: r.point }));

      context.emit?.('plane_hit_test_result', {
        node,
        results: state.hitTestResults,
        queryId: event.queryId,
      });
    } else if (event.type === 'plane_select') {
      state.selectedPlane = event.planeId as string;
    } else if (event.type === 'plane_detection_pause') {
      state.isDetecting = false;
    } else if (event.type === 'plane_detection_resume') {
      state.isDetecting = true;
    }
  },
};

export default planeDetectionHandler;
