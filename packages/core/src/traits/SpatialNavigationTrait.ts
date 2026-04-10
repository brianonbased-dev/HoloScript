/**
 * Spatial Navigation Trait (V43 Tier 2)
 *
 * World-scale AR navigation with path rendering, waypoints, and
 * turn-by-turn guidance overlaid on the physical environment.
 * Integrates with geospatial anchors for outdoor navigation.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type NavigationMode = 'walking' | 'driving' | 'cycling' | 'indoor';
export type PathVisualization = 'arrow' | 'line' | 'breadcrumb' | 'holographic';

export interface SpatialNavigationConfig {
  navigation_mode: NavigationMode;
  path_visualization: PathVisualization;
  show_distance: boolean;
  show_eta: boolean;
  auto_recalculate: boolean;
  recalculate_threshold_m: number; // meters off-path before recalculating
  waypoint_radius_m: number; // meters to consider waypoint reached
  path_color: string;
}

interface Waypoint {
  id: string;
  position: [number, number, number];
  label?: string;
  reached: boolean;
}

interface SpatialNavigationState {
  isNavigating: boolean;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  distanceToNext: number;
  totalDistance: number;
  pathPoints: Array<[number, number, number]>;
  estimatedSeconds: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const spatialNavigationHandler: TraitHandler<SpatialNavigationConfig> = {
  name: 'spatial_navigation',

  defaultConfig: {
    navigation_mode: 'walking',
    path_visualization: 'arrow',
    show_distance: true,
    show_eta: true,
    auto_recalculate: true,
    recalculate_threshold_m: 5.0,
    waypoint_radius_m: 2.0,
    path_color: '#00aaff',
  },

  onAttach(node, config, context) {
    const state: SpatialNavigationState = {
      isNavigating: false,
      waypoints: [],
      currentWaypointIndex: 0,
      distanceToNext: 0,
      totalDistance: 0,
      pathPoints: [],
      estimatedSeconds: 0,
    };
    context.setState({ spatialNavigation: state });
  },

  onUpdate(node, config, context, delta) {
    const state = context.getState().spatialNavigation as SpatialNavigationState | undefined;
    if (!state?.isNavigating || !state.waypoints.length) return;

    const current = state.waypoints[state.currentWaypointIndex];
    if (!current || current.reached) return;

    const playerPos = context.player?.position;
    if (!playerPos) return;

    const dx = playerPos.x - current.position[0];
    const dz = playerPos.z - current.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    state.distanceToNext = dist;

    if (dist <= config.waypoint_radius_m) {
      current.reached = true;
      context.emit('navigation:waypoint_reached', { waypointId: current.id });

      if (state.currentWaypointIndex < state.waypoints.length - 1) {
        state.currentWaypointIndex += 1;
      } else {
        state.isNavigating = false;
        context.emit('navigation:arrived');
      }
    }
  },

  onDetach(node, config, context) {
    const state = context.getState().spatialNavigation as SpatialNavigationState | undefined;
    if (state?.isNavigating) {
      context.emit('navigation:cancelled');
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().spatialNavigation as SpatialNavigationState | undefined;
    if (!state) return;

    if (event.type === 'navigation:start') {
      const payload = event.payload as
        | {
            waypoints?: Array<Record<string, unknown>>;
            totalDistance?: number;
            estimatedSeconds?: number;
          }
        | undefined;
      state.waypoints = (payload?.waypoints ?? []).map(
        (wp: Record<string, unknown>, i: number) => ({
          id: (wp.id as string) ?? `wp_${i}`,
          position: wp.position as [number, number, number],
          label: wp.label as string | undefined,
          reached: false,
        })
      );
      state.currentWaypointIndex = 0;
      state.totalDistance = payload?.totalDistance ?? 0;
      state.estimatedSeconds = payload?.estimatedSeconds ?? 0;
      state.isNavigating = true;
      context.emit('navigation:started', { waypoints: state.waypoints.length });
    } else if (event.type === 'navigation:stop') {
      state.isNavigating = false;
      context.emit('navigation:stopped');
    }
  },
};
