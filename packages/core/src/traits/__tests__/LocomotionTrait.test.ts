import { describe, it, expect, beforeEach } from 'vitest';
import { locomotionHandler } from '../LocomotionTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('LocomotionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('mover');
    node.position = [0, 0, 0];
    ctx = createMockContext();
  });

  describe('lifecycle', () => {
    it('attaches state and emits locomotion:attached', () => {
      attachTrait(locomotionHandler, node, { mode: 'walk' }, ctx);
      expect((node as any).__locomotionState).toBeDefined();
      expect((node as any).__locomotionState.mode).toBe('walk');
      expect(getEventCount(ctx, 'locomotion:attached')).toBe(1);
    });

    it('cleans up on detach', () => {
      attachTrait(locomotionHandler, node, {}, ctx);
      locomotionHandler.onDetach?.(node as any, locomotionHandler.defaultConfig!, ctx as any);
      expect((node as any).__locomotionState).toBeUndefined();
    });
  });

  describe('path mode', () => {
    it('integrates position toward the waypoint and emits set_position', () => {
      const cfg = {
        mode: 'path' as const,
        path_waypoints: [[10, 0, 0]] as [number, number, number][],
        speed: 50,
      };
      attachTrait(locomotionHandler, node, cfg, ctx);
      ctx.clearEvents();

      updateTrait(locomotionHandler, node, cfg, ctx, 0.1);
      expect(getEventCount(ctx, 'set_position')).toBeGreaterThanOrEqual(1);
      const pos = (node as any).__locomotionState.position;
      expect(pos[0]).toBeGreaterThan(0); // moved toward +x waypoint
    });

    it('advances pathIndex and emits waypoint_reached on arrival', () => {
      const cfg = {
        mode: 'path' as const,
        path_waypoints: [
          [0.01, 0, 0],
          [10, 0, 0],
        ] as [number, number, number][],
        speed: 5,
        path_loop: true,
      };
      attachTrait(locomotionHandler, node, cfg, ctx);
      ctx.clearEvents();
      updateTrait(locomotionHandler, node, cfg, ctx, 0.1);
      expect(getEventCount(ctx, 'locomotion:waypoint_reached')).toBe(1);
      expect((node as any).__locomotionState.pathIndex).toBe(1);
    });
  });

  describe('VR glide (F.118)', () => {
    it('left-stick input drives glide velocity and moves position', () => {
      const cfg = { mode: 'glide' as const, speed: 4 };
      attachTrait(locomotionHandler, node, cfg, ctx);
      sendEvent(locomotionHandler, node, cfg, ctx, { type: 'locomotion:input', x: 1, z: 0 });
      ctx.clearEvents();
      updateTrait(locomotionHandler, node, cfg, ctx, 0.5);
      expect(getEventCount(ctx, 'set_position')).toBeGreaterThanOrEqual(1);
      expect((node as any).__locomotionState.position[0]).toBeGreaterThan(0);
    });

    it('snap-turn emits set_rotation and respects cooldown', () => {
      const cfg = { snap_turn_angle: 45, snap_turn_cooldown: 0.3 };
      attachTrait(locomotionHandler, node, cfg, ctx);
      sendEvent(locomotionHandler, node, cfg, ctx, { type: 'locomotion:snap_turn', direction: 1 });
      expect(getEventCount(ctx, 'set_rotation')).toBe(1);
      // Second snap immediately is blocked by cooldown.
      sendEvent(locomotionHandler, node, cfg, ctx, { type: 'locomotion:snap_turn', direction: 1 });
      expect(getEventCount(ctx, 'set_rotation')).toBe(1);
    });

    it('teleport request warps position on next update', () => {
      const cfg = { mode: 'teleport' as const };
      attachTrait(locomotionHandler, node, cfg, ctx);
      sendEvent(locomotionHandler, node, cfg, ctx, {
        type: 'locomotion:teleport_request',
        target: [5, 0, -3],
      });
      ctx.clearEvents();
      updateTrait(locomotionHandler, node, cfg, ctx, 0.016);
      expect(getEventCount(ctx, 'locomotion:teleported')).toBe(1);
      const pos = (node as any).__locomotionState.position;
      expect(pos).toEqual([5, 0, -3]);
    });
  });

  describe('command + BT bridge', () => {
    it('locomotion:move with a position destination switches to path mode', () => {
      const cfg = { mode: 'walk' as const };
      attachTrait(locomotionHandler, node, cfg, ctx);
      sendEvent(locomotionHandler, node, cfg, ctx, {
        type: 'locomotion:move',
        destination: [3, 0, 4],
        mode: 'path',
      });
      const state = (node as any).__locomotionState;
      expect(state.mode).toBe('path');
    });

    it('bt_action glide switches mode and replies with action:result', () => {
      const cfg = {};
      attachTrait(locomotionHandler, node, cfg, ctx);
      sendEvent(locomotionHandler, node, cfg, ctx, {
        type: 'bt_action',
        action: 'fly',
        requestId: 'r1',
      });
      expect((node as any).__locomotionState.mode).toBe('fly');
      const result = getLastEvent(ctx, 'action:result');
      expect(result).toMatchObject({ requestId: 'r1', status: 'success' });
    });
  });
});
