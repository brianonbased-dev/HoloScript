import { describe, it, expect, beforeEach } from 'vitest';
import { patrolHandler } from '../PatrolTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

const waypoints = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 10, y: 0, z: 10 },
];

describe('PatrolTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('patrol-guard');
    node.position = { x: 0, y: 0, z: 0 };
    ctx = createMockContext();
  });

  describe('lifecycle', () => {
    it('attaches and emits patrol_started', () => {
      attachTrait(patrolHandler, node, { waypoints }, ctx);
      expect((node as any).__patrolState).toBeDefined();
      expect(getEventCount(ctx, 'patrol_started')).toBe(1);
    });

    it('does not emit patrol_started with no waypoints', () => {
      attachTrait(patrolHandler, node, { waypoints: [] }, ctx);
      expect(getEventCount(ctx, 'patrol_started')).toBe(0);
    });

    it('cleans up on detach', () => {
      attachTrait(patrolHandler, node, { waypoints }, ctx);
      patrolHandler.onDetach?.(node as any, patrolHandler.defaultConfig, ctx as any);
      expect((node as any).__patrolState).toBeUndefined();
    });
  });

  describe('movement', () => {
    it('moves toward current waypoint', () => {
      node.position = { x: 0, y: 0, z: 0 };
      attachTrait(patrolHandler, node, { waypoints, speed: 100 }, ctx);
      ctx.clearEvents();

      updateTrait(patrolHandler, node, { waypoints, speed: 100 }, ctx, 0.01);
      expect(getEventCount(ctx, 'set_position')).toBeGreaterThanOrEqual(1);
    });

    it('emits patrol_waypoint_reached on arrival', () => {
      node.position = { x: 9.95, y: 0, z: 0 }; // Very close to wp[1]
      attachTrait(patrolHandler, node, { waypoints, speed: 10 }, ctx);
      const state = (node as any).__patrolState;
      state.currentIndex = 1;
      ctx.clearEvents();

      updateTrait(patrolHandler, node, { waypoints, speed: 10 }, ctx, 0.1);
      expect(getEventCount(ctx, 'patrol_waypoint_reached')).toBe(1);
    });
  });

  describe('waiting', () => {
    it('waits at waypoint before moving to next', () => {
      attachTrait(patrolHandler, node, { waypoints, wait_time: 1, mode: 'loop' }, ctx);
      const state = (node as any).__patrolState;
      state.isWaiting = true;
      state.waitTimer = 0;
      ctx.clearEvents();

      updateTrait(patrolHandler, node, { waypoints, wait_time: 1 }, ctx, 0.5);
      expect(state.isWaiting).toBe(true); // Still waiting

      updateTrait(patrolHandler, node, { waypoints, wait_time: 1 }, ctx, 0.6);
      expect(state.isWaiting).toBe(false); // Done waiting
    });
  });

  describe('patrol modes', () => {
    it('loop mode wraps around', () => {
      attachTrait(patrolHandler, node, { waypoints, mode: 'loop' }, ctx);
      const state = (node as any).__patrolState;
      state.currentIndex = 2; // At last waypoint
      state.isWaiting = true;
      state.waitTimer = 100; // Exceed wait time

      updateTrait(patrolHandler, node, { waypoints, mode: 'loop', wait_time: 1 }, ctx, 0.1);
      expect(state.currentIndex).toBe(0); // Wrapped
    });

    it('once mode marks completed', () => {
      attachTrait(patrolHandler, node, { waypoints, mode: 'once' }, ctx);
      const state = (node as any).__patrolState;
      state.currentIndex = 2; // At last waypoint
      state.isWaiting = true;
      state.waitTimer = 100;

      updateTrait(patrolHandler, node, { waypoints, mode: 'once', wait_time: 1 }, ctx, 0.1);
      expect(state.completed).toBe(true);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      attachTrait(patrolHandler, node, { waypoints }, ctx);
    });

    it('patrol_pause stops patrol', () => {
      sendEvent(patrolHandler, node, { waypoints }, ctx, { type: 'patrol_pause' });
      expect((node as any).__patrolState.isPaused).toBe(true);
      expect(getEventCount(ctx, 'patrol_paused')).toBe(1);
    });

    it('patrol_resume restarts patrol', () => {
      sendEvent(patrolHandler, node, { waypoints }, ctx, { type: 'patrol_pause' });
      sendEvent(patrolHandler, node, { waypoints }, ctx, { type: 'patrol_resume' });
      expect((node as any).__patrolState.isPaused).toBe(false);
    });

    it('patrol_goto jumps to waypoint index', () => {
      sendEvent(patrolHandler, node, { waypoints }, ctx, { type: 'patrol_goto', waypointIndex: 2 });
      expect((node as any).__patrolState.currentIndex).toBe(2);
    });

    it('patrol_reset resets to initial state', () => {
      const state = (node as any).__patrolState;
      state.currentIndex = 2;
      state.isPaused = true;
      sendEvent(patrolHandler, node, { waypoints }, ctx, { type: 'patrol_reset' });
      expect(state.currentIndex).toBe(0);
      expect(state.isPaused).toBe(false);
    });

    it('patrol_alert triggers alert state', () => {
      sendEvent(patrolHandler, node, { waypoints, alert_on_detection: true }, ctx, {
        type: 'patrol_alert',
        position: { x: 5, y: 0, z: 5 },
      });
      const state = (node as any).__patrolState;
      expect(state.isAlerted).toBe(true);
      expect(getEventCount(ctx, 'patrol_alerted')).toBe(1);
    });
  });

  describe('alert handling', () => {
    it('resumes after alert timeout', () => {
      attachTrait(
        patrolHandler,
        node,
        { waypoints, alert_on_detection: true, alert_wait_time: 1, resume_after_alert: true },
        ctx
      );
      sendEvent(patrolHandler, node, { waypoints, alert_on_detection: true }, ctx, {
        type: 'patrol_alert',
        position: { x: 5, y: 0, z: 5 },
      });

      const state = (node as any).__patrolState;
      expect(state.isAlerted).toBe(true);

      // Update past the alert wait time
      updateTrait(
        patrolHandler,
        node,
        { waypoints, alert_wait_time: 1, resume_after_alert: true },
        ctx,
        1.5
      );
      expect(state.isAlerted).toBe(false);
      expect(getEventCount(ctx, 'patrol_alert_ended')).toBe(1);
    });
  });
});
