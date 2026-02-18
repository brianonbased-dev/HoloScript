/**
 * SharePlayTrait Production Tests
 *
 * Session lifecycle, participant tracking, property sync,
 * and edge cases for Apple SharePlay integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sharePlayHandler } from '../SharePlayTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'sp-node') {
  return { id } as any;
}

function makeConfig(overrides: Partial<Parameters<typeof sharePlayHandler.onAttach>[1]> = {}) {
  return { ...sharePlayHandler.defaultConfig, ...overrides };
}

/** Context with setState/getState emulation (SharePlayTrait uses this pattern) */
function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}

function getSharePlayState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().sharePlay;
}

// =============================================================================
// TESTS
// =============================================================================

describe('SharePlayTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    sharePlayHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes idle session state', () => {
      const s = getSharePlayState(ctx);
      expect(s.sessionState).toBe('idle');
      expect(s.sessionId).toBeNull();
      expect(s.isHost).toBe(false);
      expect(s.participants.size).toBe(0);
      expect(s.syncedProperties).toEqual({});
    });

    it('emits shareplay:ready on attach', () => {
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:ready', {
        activity: 'Shared Experience',
      });
    });

    it('has sensible defaults', () => {
      const d = sharePlayHandler.defaultConfig;
      expect(d.activity_title).toBe('Shared Experience');
      expect(d.max_participants).toBe(8);
      expect(d.auto_join).toBe(true);
      expect(d.sync_policy).toBe('full_state');
    });

    it('handler name is shareplay', () => {
      expect(sharePlayHandler.name).toBe('shareplay');
    });
  });

  // ======== SESSION LIFECYCLE ========

  describe('session lifecycle', () => {
    it('starts session as host', () => {
      ctx.emit.mockClear();

      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:start',
        payload: { sessionId: 'sess_1' },
      });

      const s = getSharePlayState(ctx);
      expect(s.sessionState).toBe('active');
      expect(s.sessionId).toBe('sess_1');
      expect(s.isHost).toBe(true);
      expect(s.startedAt).toBeGreaterThan(0);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:started', {
        sessionId: 'sess_1',
        activity: 'Shared Experience',
      });
    });

    it('auto-generates sessionId when none provided', () => {
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:start',
        payload: {},
      });

      const s = getSharePlayState(ctx);
      expect(s.sessionId).toMatch(/^sp_\d+$/);
    });

    it('joins session as guest', () => {
      ctx.emit.mockClear();

      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:join',
        payload: { sessionId: 'sess_2' },
      });

      const s = getSharePlayState(ctx);
      expect(s.sessionState).toBe('active');
      expect(s.sessionId).toBe('sess_2');
      expect(s.isHost).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:joined', { sessionId: 'sess_2' });
    });

    it('ends session and clears participants', () => {
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:start',
        payload: { sessionId: 'sess_3' },
      });
      getSharePlayState(ctx).participants.set('p1', { id: 'p1', displayName: 'A', isHost: false, joinedAt: Date.now() });
      ctx.emit.mockClear();

      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:end',
        payload: {},
      });

      const s = getSharePlayState(ctx);
      expect(s.sessionState).toBe('ended');
      expect(s.participants.size).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:ended', { sessionId: 'sess_3' });
    });
  });

  // ======== PARTICIPANT TRACKING ========

  describe('participant tracking', () => {
    it('adds participant', () => {
      ctx.emit.mockClear();

      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:participant_joined',
        payload: { id: 'user_1', displayName: 'Alice', isHost: false, joinedAt: Date.now() },
      });

      const s = getSharePlayState(ctx);
      expect(s.participants.size).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:participant_joined', expect.objectContaining({
        participantId: 'user_1',
        displayName: 'Alice',
        count: 1,
      }));
    });

    it('enforces max_participants', () => {
      const cfg = makeConfig({ max_participants: 2 });
      const c = makeContext();
      sharePlayHandler.onAttach(node, cfg, c);

      // Add 2 participants
      for (let i = 0; i < 2; i++) {
        sharePlayHandler.onEvent!(node, cfg, c, {
          type: 'shareplay:participant_joined',
          payload: { id: `u${i}`, displayName: `P${i}`, isHost: false, joinedAt: Date.now() },
        });
      }
      c.emit.mockClear();

      // 3rd should be rejected
      sharePlayHandler.onEvent!(node, cfg, c, {
        type: 'shareplay:participant_joined',
        payload: { id: 'overflow', displayName: 'Extra', isHost: false, joinedAt: Date.now() },
      });

      expect(getSharePlayState(c).participants.size).toBe(2);
      expect(c.emit).not.toHaveBeenCalledWith('shareplay:participant_joined', expect.anything());
    });

    it('removes participant', () => {
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:participant_joined',
        payload: { id: 'u1', displayName: 'Bob', isHost: false, joinedAt: Date.now() },
      });
      ctx.emit.mockClear();

      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:participant_left',
        payload: { id: 'u1' },
      });

      expect(getSharePlayState(ctx).participants.size).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:participant_left', expect.objectContaining({
        participantId: 'u1',
        count: 0,
      }));
    });
  });

  // ======== PROPERTY SYNC ========

  describe('property sync', () => {
    it('merges synced properties', () => {
      ctx.emit.mockClear();

      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:sync',
        payload: { properties: { score: 42, level: 3 } },
      });

      const s = getSharePlayState(ctx);
      expect(s.syncedProperties).toEqual({ score: 42, level: 3 });
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:state_synced', {
        properties: ['score', 'level'],
      });
    });

    it('merges with existing properties', () => {
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:sync',
        payload: { properties: { a: 1 } },
      });
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:sync',
        payload: { properties: { b: 2 } },
      });

      expect(getSharePlayState(ctx).syncedProperties).toEqual({ a: 1, b: 2 });
    });

    it('ignores sync with no properties', () => {
      ctx.emit.mockClear();
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:sync',
        payload: {},
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('shareplay:state_synced', expect.anything());
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits ended when session is active on detach', () => {
      sharePlayHandler.onEvent!(node, config, ctx, {
        type: 'shareplay:start',
        payload: { sessionId: 'detach_sess' },
      });
      ctx.emit.mockClear();

      sharePlayHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith('shareplay:ended', { sessionId: 'detach_sess' });
    });

    it('does NOT emit ended when session is idle', () => {
      ctx.emit.mockClear();
      sharePlayHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).not.toHaveBeenCalledWith('shareplay:ended', expect.anything());
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const bare = makeNode('bare');
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };

      sharePlayHandler.onEvent!(bare, config, noCtx, {
        type: 'shareplay:start',
        payload: {},
      });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
