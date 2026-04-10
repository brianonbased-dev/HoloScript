/**
 * ObjectTrackingTrait Tests
 *
 * Tests for object tracking trait covering initialization, tracking acquisition,
 * tracking loss, auto-recovery, onUpdate behavior, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { objectTrackingHandler } from '../ObjectTrackingTrait';
import type { ObjectTrackingConfig } from '../ObjectTrackingTrait';
import { createMockNode } from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Extended mock context with setState/getState
// ---------------------------------------------------------------------------

interface StatefulMockContext {
  emit: (event: string, data: unknown) => void;
  emittedEvents: Array<{ event: string; data: unknown }>;
  clearEvents: () => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
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

describe('ObjectTrackingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = objectTrackingHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('tracking-node');
    ctx = createStatefulMockContext();
    objectTrackingHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('tracks objects by default', () => {
      expect(defaultConfig.tracking_target).toBe('objects');
    });

    it('uses session persistence', () => {
      expect(defaultConfig.anchor_persistence).toBe('session');
    });

    it('medium tracking quality', () => {
      expect(defaultConfig.tracking_quality).toBe('medium');
    });

    it('max distance is 5 meters', () => {
      expect(defaultConfig.max_distance).toBe(5.0);
    });

    it('update rate is 30 Hz', () => {
      expect(defaultConfig.update_rate_hz).toBe(30);
    });

    it('auto_recover is enabled', () => {
      expect(defaultConfig.auto_recover).toBe(true);
    });

    it('visualization is off', () => {
      expect(defaultConfig.visualization).toBe(false);
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes objectTracking state', () => {
      const state = ctx.getState().objectTracking as any;
      expect(state).toBeDefined();
      expect(state.isTracking).toBe(false);
      expect(state.trackingLost).toBe(false);
      expect(state.anchorId).toBeNull();
      expect(state.lastKnownPosition).toBeNull();
      expect(state.trackingConfidence).toBe(0);
      expect(state.totalTrackingTime).toBe(0);
      expect(state.recoveryAttempts).toBe(0);
    });

    it('emits tracking:init with target', () => {
      expect(getEventCount(ctx, 'tracking:init')).toBe(1);
      const data = getLastEvent(ctx, 'tracking:init') as any;
      expect(data.target).toBe('objects');
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits tracking:anchor_removed when anchor exists', () => {
      const state = ctx.getState().objectTracking as any;
      state.anchorId = 'anchor-123';

      ctx.clearEvents();
      objectTrackingHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'tracking:anchor_removed')).toBe(1);
      const data = getLastEvent(ctx, 'tracking:anchor_removed') as any;
      expect(data.anchorId).toBe('anchor-123');
    });

    it('does not emit when no anchor exists', () => {
      ctx.clearEvents();
      objectTrackingHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'tracking:anchor_removed')).toBe(0);
    });
  });

  // =========================================================================
  // tracking:acquired event
  // =========================================================================

  describe('tracking:acquired', () => {
    it('sets tracking state to active', () => {
      ctx.clearEvents();
      objectTrackingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'tracking:acquired',
        payload: { anchorId: 'anchor-abc' },
      });

      const state = ctx.getState().objectTracking as any;
      expect(state.isTracking).toBe(true);
      expect(state.trackingLost).toBe(false);
      expect(state.anchorId).toBe('anchor-abc');
      expect(state.trackingConfidence).toBe(1.0);
    });
  });

  // =========================================================================
  // tracking:lost event
  // =========================================================================

  describe('tracking:lost', () => {
    it('sets tracking lost state and emits event', () => {
      // First acquire tracking
      objectTrackingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'tracking:acquired',
        payload: { anchorId: 'anchor-1' },
      });
      ctx.clearEvents();

      objectTrackingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'tracking:lost',
      });

      const state = ctx.getState().objectTracking as any;
      expect(state.isTracking).toBe(false);
      expect(state.trackingLost).toBe(true);
      expect(state.trackingConfidence).toBe(0);
      expect(getEventCount(ctx, 'tracking:lost')).toBe(1);
    });
  });

  // =========================================================================
  // onUpdate
  // =========================================================================

  describe('onUpdate', () => {
    it('accumulates tracking time when tracking is active', () => {
      const state = ctx.getState().objectTracking as any;
      state.isTracking = true;

      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.5);
      expect(state.totalTrackingTime).toBe(0.5);

      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.3);
      expect(state.totalTrackingTime).toBeCloseTo(0.8);
    });

    it('does not accumulate time when not tracking', () => {
      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 1.0);

      const state = ctx.getState().objectTracking as any;
      expect(state.totalTrackingTime).toBe(0);
    });

    it('attempts recovery when tracking lost and auto_recover enabled', () => {
      const state = ctx.getState().objectTracking as any;
      state.trackingLost = true;

      ctx.clearEvents();
      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.1);

      expect(state.recoveryAttempts).toBe(1);
      expect(getEventCount(ctx, 'tracking:recovery_attempt')).toBe(1);
    });

    it('does not attempt recovery when auto_recover disabled', () => {
      const noRecover: ObjectTrackingConfig = { ...defaultConfig, auto_recover: false };
      const state = ctx.getState().objectTracking as any;
      state.trackingLost = true;

      ctx.clearEvents();
      objectTrackingHandler.onUpdate!(node as any, noRecover, ctx as any, 0.1);

      expect(state.recoveryAttempts).toBe(0);
      expect(getEventCount(ctx, 'tracking:recovery_attempt')).toBe(0);
    });

    it('increments recovery attempts on each update', () => {
      const state = ctx.getState().objectTracking as any;
      state.trackingLost = true;

      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.1);
      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.1);
      objectTrackingHandler.onUpdate!(node as any, defaultConfig, ctx as any, 0.1);

      expect(state.recoveryAttempts).toBe(3);
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onUpdate does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      objectTrackingHandler.onUpdate!(node as any, defaultConfig, freshCtx as any, 0.5);
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
