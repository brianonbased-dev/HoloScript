/**
 * ObjectTrackingTrait Production Tests
 *
 * AR object tracking: init, acquired/lost lifecycle, tracking time accumulation,
 * auto-recovery, anchor management, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { objectTrackingHandler } from '../ObjectTrackingTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'ot-node') {
  return { id } as any;
}

function makeConfig(overrides: any = {}) {
  return { ...objectTrackingHandler.defaultConfig, ...overrides };
}

function makeContext(overrides: Record<string, unknown> = {}) {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
    ...overrides,
  };
}

function getState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().objectTracking;
}

// =============================================================================
// TESTS
// =============================================================================

describe('ObjectTrackingTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    objectTrackingHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes idle tracking state', () => {
      const s = getState(ctx);
      expect(s.isTracking).toBe(false);
      expect(s.trackingLost).toBe(false);
      expect(s.anchorId).toBeNull();
      expect(s.trackingConfidence).toBe(0);
      expect(s.totalTrackingTime).toBe(0);
      expect(s.recoveryAttempts).toBe(0);
    });

    it('emits tracking:init', () => {
      expect(ctx.emit).toHaveBeenCalledWith(
        'tracking:init',
        expect.objectContaining({ nodeId: 'ot-node', target: 'objects' })
      );
    });

    it('has correct defaults', () => {
      const d = objectTrackingHandler.defaultConfig;
      expect(d.tracking_target).toBe('objects');
      expect(d.anchor_persistence).toBe('session');
      expect(d.max_distance).toBe(5.0);
      expect(d.auto_recover).toBe(true);
    });

    it('handler name is object_tracking', () => {
      expect(objectTrackingHandler.name).toBe('object_tracking');
    });
  });

  // ======== ACQUIRED / LOST ========

  describe('tracking lifecycle', () => {
    it('acquires tracking with anchor', () => {
      objectTrackingHandler.onEvent!(node, config, ctx, {
        type: 'tracking:acquired',
        payload: { anchorId: 'anchor_42' },
      });

      const s = getState(ctx);
      expect(s.isTracking).toBe(true);
      expect(s.trackingLost).toBe(false);
      expect(s.anchorId).toBe('anchor_42');
      expect(s.trackingConfidence).toBe(1.0);
    });

    it('applies externally supplied pose updates without computing anchors', () => {
      objectTrackingHandler.onEvent!(node, config, ctx, {
        type: 'tracking:pose',
        payload: {
          anchorId: 'anchor_pose',
          position: [1, 2, 3],
          rotation: [0.1, 0.2, 0.3],
          confidence: 0.72,
          timestampMs: 1234,
          source: 'webxr',
        },
      });

      const s = getState(ctx);
      expect(s.isTracking).toBe(true);
      expect(s.anchorId).toBe('anchor_pose');
      expect(s.lastKnownPosition).toEqual([1, 2, 3]);
      expect(s.lastKnownRotation).toEqual([0.1, 0.2, 0.3]);
      expect(s.trackingConfidence).toBe(0.72);
      expect(s.trackingSource).toBe('event');
      expect(ctx.emit).toHaveBeenCalledWith(
        'tracking:updated',
        expect.objectContaining({
          nodeId: 'ot-node',
          anchorId: 'anchor_pose',
          position: [1, 2, 3],
          source: 'event',
        })
      );
    });

    it('loses tracking', () => {
      objectTrackingHandler.onEvent!(node, config, ctx, {
        type: 'tracking:acquired',
        payload: { anchorId: 'a1' },
      });
      ctx.emit.mockClear();

      objectTrackingHandler.onEvent!(node, config, ctx, {
        type: 'tracking:lost',
        payload: {},
      });

      const s = getState(ctx);
      expect(s.isTracking).toBe(false);
      expect(s.trackingLost).toBe(true);
      expect(s.trackingConfidence).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith(
        'tracking:lost',
        expect.objectContaining({ nodeId: 'ot-node', target: 'objects', anchorId: 'a1' })
      );
    });
  });

  // ======== ON UPDATE ========

  describe('onUpdate', () => {
    it('accumulates tracking time while tracking', () => {
      objectTrackingHandler.onEvent!(node, config, ctx, {
        type: 'tracking:acquired',
        payload: {},
      });

      objectTrackingHandler.onUpdate!(node, config, ctx, 16.67);
      objectTrackingHandler.onUpdate!(node, config, ctx, 16.67);

      expect(getState(ctx).totalTrackingTime).toBeCloseTo(33.34, 1);
    });

    it('pulls AR session pose from TraitContext during tracking updates', () => {
      const arCtx = makeContext({
        arSession: {
          available: true,
          getPose: vi.fn(() => ({
            anchorId: 'session-anchor',
            position: [4, 5, 6],
            rotation: [0.4, 0.5, 0.6],
            confidence: 0.9,
            timestampMs: 5678,
            source: 'arcore',
          })),
        },
      });
      objectTrackingHandler.onAttach(node, config, arCtx);
      objectTrackingHandler.onEvent!(node, config, arCtx, {
        type: 'tracking:acquired',
        payload: {},
      });
      arCtx.emit.mockClear();

      objectTrackingHandler.onUpdate!(node, config, arCtx, 1);

      const s = getState(arCtx);
      expect(s.lastKnownPosition).toEqual([4, 5, 6]);
      expect(s.lastKnownRotation).toEqual([0.4, 0.5, 0.6]);
      expect(s.trackingConfidence).toBe(0.9);
      expect(s.trackingSource).toBe('ar_session');
      expect(arCtx.emit).toHaveBeenCalledWith(
        'tracking:updated',
        expect.objectContaining({
          nodeId: 'ot-node',
          anchorId: 'session-anchor',
          position: [4, 5, 6],
          source: 'ar_session',
        })
      );
    });

    it('does NOT accumulate time when not tracking', () => {
      objectTrackingHandler.onUpdate!(node, config, ctx, 16.67);
      expect(getState(ctx).totalTrackingTime).toBe(0);
    });

    it('attempts recovery when tracking lost and auto_recover enabled', () => {
      objectTrackingHandler.onEvent!(node, config, ctx, { type: 'tracking:acquired', payload: {} });
      objectTrackingHandler.onEvent!(node, config, ctx, { type: 'tracking:lost', payload: {} });
      ctx.emit.mockClear();

      objectTrackingHandler.onUpdate!(node, config, ctx, 16);

      expect(getState(ctx).recoveryAttempts).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith(
        'tracking:recovery_attempt',
        expect.objectContaining({ nodeId: 'ot-node', target: 'objects', attempt: 1 })
      );
    });

    it('does NOT attempt recovery when auto_recover disabled', () => {
      const cfg = makeConfig({ auto_recover: false });
      const c = makeContext();
      objectTrackingHandler.onAttach(node, cfg, c);

      objectTrackingHandler.onEvent!(node, cfg, c, { type: 'tracking:acquired', payload: {} });
      objectTrackingHandler.onEvent!(node, cfg, c, { type: 'tracking:lost', payload: {} });
      c.emit.mockClear();

      objectTrackingHandler.onUpdate!(node, cfg, c, 16);

      expect(c.emit).not.toHaveBeenCalledWith('tracking:recovery_attempt', expect.anything());
    });

    it('no-op update without state', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      objectTrackingHandler.onUpdate!(node, config, noCtx, 16);
      // No crash
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('removes anchor on detach', () => {
      objectTrackingHandler.onEvent!(node, config, ctx, {
        type: 'tracking:acquired',
        payload: { anchorId: 'a99' },
      });
      ctx.emit.mockClear();

      objectTrackingHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'tracking:anchor_removed',
        expect.objectContaining({ nodeId: 'ot-node', target: 'objects', anchorId: 'a99' })
      );
    });

    it('no-op detach without anchor', () => {
      ctx.emit.mockClear();
      objectTrackingHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).not.toHaveBeenCalledWith('tracking:anchor_removed', expect.anything());
    });
  });
});
