/**
 * RopeTrait Tests
 *
 * Tests for rope/cable physics simulation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ropeHandler } from '../RopeTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('RopeTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('rope-node');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(ropeHandler.defaultConfig.segments).toBe(20);
      expect(ropeHandler.defaultConfig.length).toBe(5);
      expect(ropeHandler.defaultConfig.stiffness).toBe(0.9);
    });

    it('should attach and initialize state', () => {
      attachTrait(ropeHandler, node, {}, ctx);

      const state = (node as any).__ropeState;
      expect(state).toBeDefined();
      expect(state.segments).toBeDefined();
      expect(state.isSimulating).toBe(true); // Simulation starts on attach
    });

    it('should create segments on attach', () => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 20,
          length: 5.0,
        },
        ctx
      );

      const state = (node as any).__ropeState;
      expect(state.segments.length).toBe(21); // segments + 1 for endpoints
    });

    it('should have correct initial length', () => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
          length: 5.0,
        },
        ctx
      );

      const state = (node as any).__ropeState;
      expect(state.currentLength).toBe(5.0);
    });
  });

  describe('anchor points', () => {
    beforeEach(() => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
          length: 2.0,
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should send attach event', () => {
      sendEvent(ropeHandler, node, {}, ctx, {
        type: 'rope_attach',
        endpoint: 'start',
        targetNodeId: 'hook-node',
      });

      expect(getEventCount(ctx, 'rope_create_attachment')).toBe(1);
    });

    it('should send detach event', () => {
      sendEvent(ropeHandler, node, {}, ctx, {
        type: 'rope_detach',
        endpoint: 'end',
      });

      expect(getEventCount(ctx, 'rope_remove_attachment')).toBe(1);
    });
  });

  describe('physics simulation', () => {
    beforeEach(() => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
          length: 2.0,
          gravity_scale: 1.0,
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should be simulating after attach', () => {
      const state = (node as any).__ropeState;
      expect(state.isSimulating).toBe(true);
    });

    it('should update segment positions from event', () => {
      const state = (node as any).__ropeState;

      sendEvent(ropeHandler, node, {}, ctx, {
        type: 'rope_segment_update',
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: -0.2, z: 0 },
          { x: 0, y: -0.4, z: 0 },
        ],
        tension: 5.0,
      });

      expect(state.segments[0].position.x).toBe(0);
      expect(state.tension).toBe(5.0);
    });
  });

  describe('stiffness', () => {
    it('should accept stiffness config', () => {
      attachTrait(
        ropeHandler,
        node,
        {
          stiffness: 0.9,
        },
        ctx
      );

      const state = (node as any).__ropeState;
      expect(state).toBeDefined();
    });
  });

  describe('damping', () => {
    it('should accept damping config', () => {
      attachTrait(
        ropeHandler,
        node,
        {
          damping: 0.05,
        },
        ctx
      );

      const state = (node as any).__ropeState;
      expect(state).toBeDefined();
    });
  });

  describe('external forces', () => {
    beforeEach(() => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should apply force to segment', () => {
      sendEvent(ropeHandler, node, {}, ctx, {
        type: 'rope_apply_force',
        segmentIndex: 5,
        force: { x: 2, y: 0, z: 0 },
      });

      expect(getEventCount(ctx, 'rope_external_force')).toBe(1);
    });
  });

  describe('rope breaking', () => {
    beforeEach(() => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
          breakable: true,
          break_force: 100,
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should be breakable when configured', () => {
      const state = (node as any).__ropeState;
      expect(state.isSnapped).toBe(false);
    });
  });

  describe('rope repair', () => {
    beforeEach(() => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
          breakable: true,
        },
        ctx
      );

      const state = (node as any).__ropeState;
      state.isSnapped = true;
      state.snapPoint = 5;
      ctx.clearEvents();
    });

    it('should repair snapped rope', () => {
      sendEvent(ropeHandler, node, {}, ctx, {
        type: 'rope_repair',
      });

      const state = (node as any).__ropeState;
      expect(state.isSnapped).toBe(false);
      expect(state.snapPoint).toBeNull();
      expect(getEventCount(ctx, 'rope_reconnect')).toBe(1);
    });
  });

  describe('pause and resume', () => {
    beforeEach(() => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should pause simulation', () => {
      sendEvent(ropeHandler, node, {}, ctx, {
        type: 'rope_pause',
      });

      const state = (node as any).__ropeState;
      expect(state.isSimulating).toBe(false);
    });

    it('should resume simulation', () => {
      sendEvent(ropeHandler, node, {}, ctx, { type: 'rope_pause' });
      sendEvent(ropeHandler, node, {}, ctx, { type: 'rope_resume' });

      const state = (node as any).__ropeState;
      expect(state.isSimulating).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up on detach', () => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 10,
        },
        ctx
      );

      ropeHandler.onDetach?.(node, ropeHandler.defaultConfig, ctx);

      expect((node as any).__ropeState).toBeUndefined();
    });
  });

  describe('query', () => {
    it('should respond to query event', () => {
      attachTrait(
        ropeHandler,
        node,
        {
          segments: 15,
          length: 3.0,
          stiffness: 0.7,
        },
        ctx
      );
      ctx.clearEvents();

      sendEvent(ropeHandler, node, { segments: 15, length: 3.0, stiffness: 0.7 }, ctx, {
        type: 'rope_query',
        queryId: 'test-query',
      });

      const info = getLastEvent(ctx, 'rope_info');
      expect(info).toBeDefined();
      expect(info.queryId).toBe('test-query');
      expect(info.segmentCount).toBe(16); // segments + 1
      expect(info.isSimulating).toBe(true);
    });
  });
});
