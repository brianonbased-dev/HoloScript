/**
 * SpatialNavigationTrait Production Tests
 *
 * World-scale AR navigation: waypoint start/stop, onUpdate proximity
 * detection, waypoint reached events, arrival, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spatialNavigationHandler } from '../SpatialNavigationTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'nav-node') { return { id } as any; }

function makeConfig(overrides: any = {}) {
  return { ...spatialNavigationHandler.defaultConfig, ...overrides };
}

function makeContext(playerPos?: { x: number; y: number; z: number }) {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
    player: playerPos ? { position: playerPos } : undefined,
  };
}

function getState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().spatialNavigation;
}

const SAMPLE_WAYPOINTS = [
  { id: 'wp1', position: [10, 0, 0], label: 'First' },
  { id: 'wp2', position: [20, 0, 0], label: 'Second' },
  { id: 'wp3', position: [30, 0, 0], label: 'End' },
];

// =============================================================================
// TESTS
// =============================================================================

describe('SpatialNavigationTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes idle state', () => {
      const ctx = makeContext();
      spatialNavigationHandler.onAttach(node, config, ctx);
      const s = getState(ctx);
      expect(s.isNavigating).toBe(false);
      expect(s.waypoints).toEqual([]);
      expect(s.currentWaypointIndex).toBe(0);
      expect(s.totalDistance).toBe(0);
    });

    it('has correct defaults', () => {
      const d = spatialNavigationHandler.defaultConfig;
      expect(d.navigation_mode).toBe('walking');
      expect(d.path_visualization).toBe('arrow');
      expect(d.waypoint_radius_m).toBe(2.0);
      expect(d.auto_recalculate).toBe(true);
    });

    it('handler name is spatial_navigation', () => {
      expect(spatialNavigationHandler.name).toBe('spatial_navigation');
    });
  });

  // ======== START / STOP ========

  describe('navigation start/stop', () => {
    it('starts navigation with waypoints', () => {
      const ctx = makeContext();
      spatialNavigationHandler.onAttach(node, config, ctx);
      ctx.emit.mockClear();

      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: SAMPLE_WAYPOINTS, totalDistance: 30, estimatedSeconds: 120 },
      });

      const s = getState(ctx);
      expect(s.isNavigating).toBe(true);
      expect(s.waypoints).toHaveLength(3);
      expect(s.totalDistance).toBe(30);
      expect(s.estimatedSeconds).toBe(120);
      expect(ctx.emit).toHaveBeenCalledWith('navigation:started', { waypoints: 3 });
    });

    it('stops navigation', () => {
      const ctx = makeContext();
      spatialNavigationHandler.onAttach(node, config, ctx);
      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: SAMPLE_WAYPOINTS },
      });
      ctx.emit.mockClear();

      spatialNavigationHandler.onEvent!(node, config, ctx, { type: 'navigation:stop', payload: {} });

      expect(getState(ctx).isNavigating).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('navigation:stopped');
    });
  });

  // ======== ON UPDATE — WAYPOINT PROXIMITY ========

  describe('onUpdate — waypoint proximity', () => {
    it('detects waypoint reached when within radius', () => {
      const ctx = makeContext({ x: 10, y: 0, z: 0 }); // At wp1 position
      spatialNavigationHandler.onAttach(node, config, ctx);
      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: SAMPLE_WAYPOINTS },
      });
      ctx.emit.mockClear();

      spatialNavigationHandler.onUpdate!(node, config, ctx, 0.016);

      expect(ctx.emit).toHaveBeenCalledWith('navigation:waypoint_reached', { waypointId: 'wp1' });
      expect(getState(ctx).currentWaypointIndex).toBe(1);
    });

    it('emits arrival when last waypoint reached', () => {
      const ctx = makeContext({ x: 30, y: 0, z: 0 }); // At final wp3 position
      spatialNavigationHandler.onAttach(node, config, ctx);
      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: [{ id: 'only', position: [30, 0, 0] }] },
      });
      ctx.emit.mockClear();

      spatialNavigationHandler.onUpdate!(node, config, ctx, 0.016);

      expect(ctx.emit).toHaveBeenCalledWith('navigation:waypoint_reached', { waypointId: 'only' });
      expect(ctx.emit).toHaveBeenCalledWith('navigation:arrived');
      expect(getState(ctx).isNavigating).toBe(false);
    });

    it('does NOT trigger when player is far from waypoint', () => {
      const ctx = makeContext({ x: 100, y: 0, z: 100 }); // Far away
      spatialNavigationHandler.onAttach(node, config, ctx);
      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: SAMPLE_WAYPOINTS },
      });
      ctx.emit.mockClear();

      spatialNavigationHandler.onUpdate!(node, config, ctx, 0.016);

      expect(ctx.emit).not.toHaveBeenCalledWith('navigation:waypoint_reached', expect.anything());
    });

    it('skips update when not navigating', () => {
      const ctx = makeContext({ x: 10, y: 0, z: 0 });
      spatialNavigationHandler.onAttach(node, config, ctx);
      ctx.emit.mockClear();

      spatialNavigationHandler.onUpdate!(node, config, ctx, 0.016);

      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('skips update when no player position', () => {
      const ctx = makeContext(); // no player
      spatialNavigationHandler.onAttach(node, config, ctx);
      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: SAMPLE_WAYPOINTS },
      });
      ctx.emit.mockClear();

      spatialNavigationHandler.onUpdate!(node, config, ctx, 0.016);

      expect(ctx.emit).not.toHaveBeenCalledWith('navigation:waypoint_reached', expect.anything());
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits cancelled when navigating', () => {
      const ctx = makeContext();
      spatialNavigationHandler.onAttach(node, config, ctx);
      spatialNavigationHandler.onEvent!(node, config, ctx, {
        type: 'navigation:start',
        payload: { waypoints: SAMPLE_WAYPOINTS },
      });
      ctx.emit.mockClear();

      spatialNavigationHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('navigation:cancelled');
    });

    it('no-op detach when idle', () => {
      const ctx = makeContext();
      spatialNavigationHandler.onAttach(node, config, ctx);
      ctx.emit.mockClear();

      spatialNavigationHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).not.toHaveBeenCalledWith('navigation:cancelled');
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) } as any;
      spatialNavigationHandler.onEvent!(node, config, noCtx, { type: 'navigation:start', payload: {} });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
