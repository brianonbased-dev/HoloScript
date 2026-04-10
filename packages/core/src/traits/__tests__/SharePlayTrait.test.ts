/**
 * SharePlayTrait Tests
 *
 * Tests for Apple SharePlay integration trait covering initialization,
 * session lifecycle (start/join/end), participant management,
 * state synchronization, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sharePlayHandler } from '../SharePlayTrait';
import type { SharePlayConfig } from '../SharePlayTrait';
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

describe('SharePlayTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = sharePlayHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('shareplay-node');
    ctx = createStatefulMockContext();
    sharePlayHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('activity title defaults to Shared Experience', () => {
      expect(defaultConfig.activity_title).toBe('Shared Experience');
    });

    it('max participants defaults to 8', () => {
      expect(defaultConfig.max_participants).toBe(8);
    });

    it('auto_join is enabled', () => {
      expect(defaultConfig.auto_join).toBe(true);
    });

    it('sync_policy defaults to full_state', () => {
      expect(defaultConfig.sync_policy).toBe('full_state');
    });

    it('spatial_audio is enabled', () => {
      expect(defaultConfig.spatial_audio).toBe(true);
    });

    it('fallback_to_screen_share is disabled', () => {
      expect(defaultConfig.fallback_to_screen_share).toBe(false);
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes sharePlay state', () => {
      const state = ctx.getState().sharePlay as any;
      expect(state).toBeDefined();
      expect(state.sessionState).toBe('idle');
      expect(state.sessionId).toBeNull();
      expect(state.isHost).toBe(false);
      expect(state.participants.size).toBe(0);
      expect(state.syncedProperties).toEqual({});
      expect(state.startedAt).toBeNull();
    });

    it('emits shareplay:ready with activity title', () => {
      expect(getEventCount(ctx, 'shareplay:ready')).toBe(1);
      const data = getLastEvent(ctx, 'shareplay:ready') as any;
      expect(data.activity).toBe('Shared Experience');
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits shareplay:ended when session is active', () => {
      const state = ctx.getState().sharePlay as any;
      state.sessionState = 'active';
      state.sessionId = 'session-123';

      ctx.clearEvents();
      sharePlayHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'shareplay:ended')).toBe(1);
      const data = getLastEvent(ctx, 'shareplay:ended') as any;
      expect(data.sessionId).toBe('session-123');
    });

    it('does not emit when session is idle', () => {
      ctx.clearEvents();
      sharePlayHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'shareplay:ended')).toBe(0);
    });
  });

  // =========================================================================
  // shareplay:start event
  // =========================================================================

  describe('shareplay:start', () => {
    it('starts session as host', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:start',
        payload: { sessionId: 'sess-1' },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.sessionState).toBe('active');
      expect(state.sessionId).toBe('sess-1');
      expect(state.isHost).toBe(true);
      expect(state.startedAt).toBeDefined();
    });

    it('emits shareplay:started with session info', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:start',
        payload: {},
      });

      expect(getEventCount(ctx, 'shareplay:started')).toBe(1);
      const data = getLastEvent(ctx, 'shareplay:started') as any;
      expect(data.activity).toBe('Shared Experience');
      expect(data.sessionId).toBeDefined();
    });
  });

  // =========================================================================
  // shareplay:join event
  // =========================================================================

  describe('shareplay:join', () => {
    it('joins session as non-host', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:join',
        payload: { sessionId: 'existing-session' },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.sessionState).toBe('active');
      expect(state.sessionId).toBe('existing-session');
      expect(state.isHost).toBe(false);
      expect(state.startedAt).toBeDefined();
    });

    it('emits shareplay:joined', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:join',
        payload: { sessionId: 'sess-2' },
      });

      expect(getEventCount(ctx, 'shareplay:joined')).toBe(1);
    });
  });

  // =========================================================================
  // shareplay:end event
  // =========================================================================

  describe('shareplay:end', () => {
    it('ends session and clears participants', () => {
      // Start and add a participant
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:start',
        payload: {},
      });
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:participant_joined',
        payload: { id: 'p1', displayName: 'Alice', isHost: false, joinedAt: Date.now() },
      });
      ctx.clearEvents();

      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:end',
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.sessionState).toBe('ended');
      expect(state.participants.size).toBe(0);
      expect(getEventCount(ctx, 'shareplay:ended')).toBe(1);
    });
  });

  // =========================================================================
  // shareplay:participant_joined event
  // =========================================================================

  describe('shareplay:participant_joined', () => {
    it('adds participant to the session', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:participant_joined',
        payload: { id: 'user-1', displayName: 'Alice', isHost: false, joinedAt: Date.now() },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.participants.size).toBe(1);
      expect(state.participants.has('user-1')).toBe(true);

      expect(getEventCount(ctx, 'shareplay:participant_joined')).toBe(1);
      const data = getLastEvent(ctx, 'shareplay:participant_joined') as any;
      expect(data.displayName).toBe('Alice');
      expect(data.count).toBe(1);
    });

    it('respects max_participants limit', () => {
      const smallMax: SharePlayConfig = { ...defaultConfig, max_participants: 2 };

      sharePlayHandler.onEvent!(node as any, smallMax, ctx as any, {
        type: 'shareplay:participant_joined',
        payload: { id: 'p1', displayName: 'Alice', isHost: false, joinedAt: 1 },
      });
      sharePlayHandler.onEvent!(node as any, smallMax, ctx as any, {
        type: 'shareplay:participant_joined',
        payload: { id: 'p2', displayName: 'Bob', isHost: false, joinedAt: 2 },
      });
      // Third should be rejected
      sharePlayHandler.onEvent!(node as any, smallMax, ctx as any, {
        type: 'shareplay:participant_joined',
        payload: { id: 'p3', displayName: 'Charlie', isHost: false, joinedAt: 3 },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.participants.size).toBe(2);
    });
  });

  // =========================================================================
  // shareplay:participant_left event
  // =========================================================================

  describe('shareplay:participant_left', () => {
    it('removes participant from session', () => {
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:participant_joined',
        payload: { id: 'p1', displayName: 'Alice', isHost: false, joinedAt: 1 },
      });
      ctx.clearEvents();

      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:participant_left',
        payload: { id: 'p1' },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.participants.size).toBe(0);
      expect(getEventCount(ctx, 'shareplay:participant_left')).toBe(1);
      const data = getLastEvent(ctx, 'shareplay:participant_left') as any;
      expect(data.participantId).toBe('p1');
      expect(data.count).toBe(0);
    });
  });

  // =========================================================================
  // shareplay:sync event
  // =========================================================================

  describe('shareplay:sync', () => {
    it('merges synced properties', () => {
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:sync',
        payload: { properties: { score: 42, level: 3 } },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.syncedProperties.score).toBe(42);
      expect(state.syncedProperties.level).toBe(3);
    });

    it('emits shareplay:state_synced with property keys', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:sync',
        payload: { properties: { color: 'red', size: 10 } },
      });

      expect(getEventCount(ctx, 'shareplay:state_synced')).toBe(1);
      const data = getLastEvent(ctx, 'shareplay:state_synced') as any;
      expect(data.properties).toContain('color');
      expect(data.properties).toContain('size');
    });

    it('does not emit when no properties provided', () => {
      ctx.clearEvents();
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:sync',
        payload: {},
      });

      expect(getEventCount(ctx, 'shareplay:state_synced')).toBe(0);
    });

    it('preserves existing properties when merging', () => {
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:sync',
        payload: { properties: { a: 1 } },
      });
      sharePlayHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'shareplay:sync',
        payload: { properties: { b: 2 } },
      });

      const state = ctx.getState().sharePlay as any;
      expect(state.syncedProperties.a).toBe(1);
      expect(state.syncedProperties.b).toBe(2);
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      sharePlayHandler.onEvent!(node as any, defaultConfig, freshCtx as any, {
        type: 'shareplay:start',
        payload: {},
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
