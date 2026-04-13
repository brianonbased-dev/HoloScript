/**
 * SpatialNavigationTrait Tests
 *
 * Tests for spatial navigation trait covering initialization,
 * navigation start/stop, waypoint management, onUpdate with player
 * position, arrival detection, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spatialNavigationHandler } from '../SpatialNavigationTrait';
import type { SpatialNavigationConfig } from '../SpatialNavigationTrait';
import { createMockNode } from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Extended mock context with setState/getState and player position
// ---------------------------------------------------------------------------

interface StatefulMockContext {
  emit: (event: string, data: unknown) => void;
  emittedEvents: Array<{ event: string; data: unknown }>;
  clearEvents: () => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
  player?: { position: [number, number, number] };
}

function createStatefulMockContext(): StatefulMockContext {
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
  let state: Record<string, unknown> = {};
  return {
    emit(event: string, data: unknown) {
      emittedEvents.push({ event, data });
    },
    emittedEvents,
    clearEvents() {
      emittedEvents.length = 0;
    },
    getState() {
      return state;
    },
    setState(updates: Record<string, unknown>) {
      state = { ...state, ...updates };
    },
    player: undefined,
  };
}

function getLastEvent(ctx: StatefulMockContext, eventType: string) {
  for (let i = ctx.emittedEvents.length - 1; i >= 0; i--) {
    if (ctx.emittedEvents[i].event === eventType) {
      return ctx.emittedEvents[i].data;
    }
  }
  return undefined;
}

function getEventCount(ctx: StatefulMockContext, eventType: string): number {
  return ctx.emittedEvents.filter((e) => e.event === eventType).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpatialNavigationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = spatialNavigationHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('nav-node');
    ctx = createStatefulMockContext();
    spatialNavigationHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('navigation mode defaults to walking', () => {
      expect(defaultConfig.navigation_mode).toBe('walking');
    });

    it('path visualization defaults to arrow', () => {
      expect(defaultConfig.path_visualization).toBe('arrow');
    });

    it('shows distance and ETA', () => {
      expect(defaultConfig.show_distance).toBe(true);
      expect(defaultConfig.show_eta).toBe(true);
    });

    it('auto recalculate enabled with 5m threshold', () => {
      expect(defaultConfig.auto_recalculate).toBe(true);
      expect(defaultConfig.recalculate_threshold_m).toBe(5.0);
    });

    it('waypoint radius is 2m', () => {
      expect(defaultConfig.waypoint_radius_m).toBe(2.0);
    });

    it('path color defaults to blue', () => {
      expect(defaultConfig.path_color).toBe('#00aaff');
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes spatialNavigation state', () => {
      const state = ctx.getState().spatialNavigation as any;
      expect(state).toBeDefined();
      expect(state.isNavigating).toBe(false);
      expect(state.waypoints).toEqual([]);
      expect(state.currentWaypointIndex).toBe(0);
      expect(state.distanceToNext).toBe(0);
      expect(state.totalDistance).toBe(0);
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits navigation:cancelled when navigating', () => {
      const state = ctx.getState().spatialNavigation as any;
      state.isNavigating = true;

      ctx.clearEvents();
      spatialNavigationHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'navigation:cancelled')).toBe(1);
    });

    it('does not emit when not navigating', () => {
      ctx.clearEvents();
      spatialNavigationHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'navigation:cancelled')).toBe(0);
    });
  });

  // =========================================================================
  // navigation:start event
  // =========================================================================

  describe('navigation:start', () => {
    it('starts navigation with waypoints', () => {
      ctx.clearEvents();
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [
            { id: 'wp1', position: [10, 0, 20] },
            { id: 'wp2', position: [30, 0, 40] },
          ],
          totalDistance: 500,
          estimatedSeconds: 120,
        },
      });

      const state = ctx.getState().spatialNavigation as any;
      expect(state.isNavigating).toBe(true);
      expect(state.waypoints).toHaveLength(2);
      expect(state.currentWaypointIndex).toBe(0);
      expect(state.totalDistance).toBe(500);
      expect(state.estimatedSeconds).toBe(120);
    });

    it('assigns IDs to waypoints without IDs', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [{ position: [0, 0, 0] }, { position: [10, 0, 10] }],
        },
      });

      const state = ctx.getState().spatialNavigation as any;
      expect(state.waypoints[0].id).toBe('wp_0');
      expect(state.waypoints[1].id).toBe('wp_1');
    });

    it('marks all waypoints as not reached', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [{ id: 'a', position: [0, 0, 0] }],
        },
      });

      const state = ctx.getState().spatialNavigation as any;
      expect(state.waypoints[0].reached).toBe(false);
    });

    it('emits navigation:started with waypoint count', () => {
      ctx.clearEvents();
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [
            { position: [0, 0, 0] },
            { position: [10, 0, 10] },
            { position: [20, 0, 20] },
          ],
        },
      });

      expect(getEventCount(ctx, 'navigation:started')).toBe(1);
      const data = getLastEvent(ctx, 'navigation:started') as any;
      expect(data.waypoints).toBe(3);
    });
  });

  // =========================================================================
  // navigation:stop event
  // =========================================================================

  describe('navigation:stop', () => {
    it('stops navigation and emits stopped', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: { waypoints: [{ position: [10, 0, 10] }] },
      });
      ctx.clearEvents();

      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:stop',
      });

      const state = ctx.getState().spatialNavigation as any;
      expect(state.isNavigating).toBe(false);
      expect(getEventCount(ctx, 'navigation:stopped')).toBe(1);
    });
  });

  // =========================================================================
  // onUpdate - waypoint detection
  // =========================================================================

  describe('onUpdate waypoint detection', () => {
    it('does nothing when not navigating', () => {
      ctx.player = { position: [0, 0, 0] };
      ctx.clearEvents();

      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.016);
      expect(ctx.emittedEvents).toHaveLength(0);
    });

    it('does nothing when no player position', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: { waypoints: [{ position: [0, 0, 0] }] },
      });
      ctx.clearEvents();

      // No player set on ctx
      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.016);
      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(0);
    });

    it('marks waypoint as reached when player is within radius', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [
            { id: 'wp1', position: [10, 0, 20] },
            { id: 'wp2', position: [30, 0, 40] },
          ],
        },
      });
      ctx.clearEvents();

      // Player is at [10, 0, 20] - exactly at wp1
      ctx.player = { position: [10, 0, 20] };
      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.016);

      const state = ctx.getState().spatialNavigation as any;
      expect(state.waypoints[0].reached).toBe(true);
      expect(state.currentWaypointIndex).toBe(1);
      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(1);
    });

    it('emits navigation:arrived when last waypoint reached', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [{ id: 'only', position: [5, 0, 5] }],
        },
      });
      ctx.clearEvents();

      ctx.player = { position: [5, 0, 5] };
      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.016);

      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(1);
      expect(getEventCount(ctx, 'navigation:arrived')).toBe(1);

      const state = ctx.getState().spatialNavigation as any;
      expect(state.isNavigating).toBe(false);
    });

    it('updates distanceToNext on each frame', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [{ id: 'wp1', position: [100, 0, 0] }],
        },
      });

      ctx.player = { position: [0, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.016);

      const state = ctx.getState().spatialNavigation as any;
      expect(state.distanceToNext).toBeCloseTo(100, 0);
    });

    it('does not re-check already reached waypoints', () => {
      const tightRadius: SpatialNavigationConfig = { ...defaultConfig, waypoint_radius_m: 1.0 };

      spatialNavigationHandler.onEvent!(node as any, tightRadius, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [
            { id: 'wp1', position: [0, 0, 0] },
            { id: 'wp2', position: [50, 0, 0] },
          ],
        },
      });

      // Reach wp1
      ctx.player = { position: [0, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, tightRadius, ctx as any, 0.016);
      ctx.clearEvents();

      // Move to wp1 area again - should not re-trigger
      spatialNavigationHandler.onUpdate!(node as any, tightRadius, ctx as any, 0.016);
      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(0);
    });

    it('player far from waypoint does not trigger arrival', () => {
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [{ id: 'far', position: [1000, 0, 1000] }],
        },
      });
      ctx.clearEvents();

      ctx.player = { position: [0, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.016);

      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(0);
      const state = ctx.getState().spatialNavigation as any;
      expect(state.distanceToNext).toBeGreaterThan(100);
    });
  });

  // =========================================================================
  // Full navigation flow
  // =========================================================================

  describe('full navigation flow', () => {
    it('navigates through multiple waypoints to arrival', () => {
      const config: SpatialNavigationConfig = { ...defaultConfig, waypoint_radius_m: 3.0 };

      spatialNavigationHandler.onEvent!(node as any, config, ctx as any, {
        type: 'navigation:start',
        payload: {
          waypoints: [
            { id: 'a', position: [10, 0, 0] },
            { id: 'b', position: [20, 0, 0] },
            { id: 'c', position: [30, 0, 0] },
          ],
          totalDistance: 30,
        },
      });
      ctx.clearEvents();

      // Reach waypoint A
      ctx.player = { position: [10, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, config, ctx as any, 0.016);
      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(1);

      // Reach waypoint B
      ctx.player = { position: [20, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, config, ctx as any, 0.016);
      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(2);

      // Reach waypoint C (final)
      ctx.player = { position: [30, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, config, ctx as any, 0.016);
      expect(getEventCount(ctx, 'navigation:waypoint_reached')).toBe(3);
      expect(getEventCount(ctx, 'navigation:arrived')).toBe(1);

      const state = ctx.getState().spatialNavigation as any;
      expect(state.isNavigating).toBe(false);
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onUpdate does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      freshCtx.player = { position: [0, 0, 0] };
      spatialNavigationHandler.onUpdate!(node as any, defaultConfig, freshCtx as any, 0.016);
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });

    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      spatialNavigationHandler.onEvent!(node as any, defaultConfig, freshCtx as any, {
        type: 'navigation:start',
        payload: { waypoints: [] },
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
