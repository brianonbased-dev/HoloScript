/**
 * SharedAnchorTrait Production Tests
 *
 * Multi-user anchor sharing for co-located MR experiences.
 * Covers: defaultConfig, onAttach (auto_share on/off), onDetach (leave guard),
 * onUpdate (sync accumulator, rate limiting), and all 8 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { sharedAnchorHandler } from '../SharedAnchorTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'sa_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...sharedAnchorHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  sharedAnchorHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__sharedAnchorState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  sharedAnchorHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('SharedAnchorTrait — defaultConfig', () => {
  it('has 7 fields with correct defaults', () => {
    const d = sharedAnchorHandler.defaultConfig!;
    expect(d.authority).toBe('creator');
    expect(d.resolution_timeout).toBe(10000);
    expect(d.max_users).toBe(10);
    expect(d.sync_interval).toBe(1000);
    expect(d.cloud_provider).toBe('arcore');
    expect(d.auto_share).toBe(false);
    expect(d.quality_threshold).toBe(0.5);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('SharedAnchorTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.state).toBe('local');
    expect(s.sharedUsers).toHaveLength(0);
    expect(s.isShared).toBe(false);
    expect(s.cloudAnchorId).toBeNull();
    expect(s.isCreator).toBe(false);
    expect(s.syncAccumulator).toBe(0);
    expect(s.localAnchorHandle).toBeNull();
    expect(s.quality).toBe(0);
  });

  it('always emits shared_anchor_init with provider', () => {
    const node = makeNode();
    const { ctx } = attach(node, { cloud_provider: 'azure' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_init',
      expect.objectContaining({ provider: 'azure' })
    );
  });

  it('auto_share=true: state=uploading + emits shared_anchor_upload', () => {
    const node = makeNode();
    const { ctx } = attach(node, { auto_share: true, cloud_provider: 'arkit' });
    expect(st(node).state).toBe('uploading');
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_upload',
      expect.objectContaining({ provider: 'arkit' })
    );
  });

  it('auto_share=false: state stays local, no upload emit', () => {
    const node = makeNode();
    const { ctx } = attach(node, { auto_share: false });
    expect(st(node).state).toBe('local');
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_anchor_upload', expect.any(Object));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('SharedAnchorTrait — onDetach', () => {
  it('emits shared_anchor_leave when isShared=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isShared = true;
    st(node).cloudAnchorId = 'cloud-id';
    ctx.emit.mockClear();
    sharedAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_leave',
      expect.objectContaining({ cloudAnchorId: 'cloud-id' })
    );
  });

  it('does NOT emit shared_anchor_leave when isShared=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    sharedAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_anchor_leave', expect.any(Object));
  });

  it('removes __sharedAnchorState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    sharedAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__sharedAnchorState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('SharedAnchorTrait — onUpdate', () => {
  it('no-op when not shared', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    sharedAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('accumulates delta*1000 in syncAccumulator', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { sync_interval: 1000 });
    st(node).isShared = true;
    ctx.emit.mockClear();
    sharedAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.3); // 300ms
    expect(st(node).syncAccumulator).toBeCloseTo(300);
    expect(ctx.emit).not.toHaveBeenCalled(); // not yet at 1000ms
  });

  it('resets accumulator and emits shared_anchor_sync when interval elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { sync_interval: 250 });
    st(node).isShared = true;
    st(node).cloudAnchorId = 'cid';
    st(node).syncAccumulator = 240;
    ctx.emit.mockClear();
    sharedAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.02); // +20ms → 260ms >= 250
    expect(st(node).syncAccumulator).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_sync',
      expect.objectContaining({ cloudAnchorId: 'cid' })
    );
  });
});

// ─── onEvent — shared_anchor_upload_complete ──────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_upload_complete', () => {
  it('marks shared, creator, stores cloudId, emits on_anchor_shared', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, {
      type: 'shared_anchor_upload_complete',
      cloudAnchorId: 'cloud-abc',
      quality: 0.9,
    });
    const s = st(node);
    expect(s.cloudAnchorId).toBe('cloud-abc');
    expect(s.isShared).toBe(true);
    expect(s.isCreator).toBe(true);
    expect(s.state).toBe('shared');
    expect(s.quality).toBeCloseTo(0.9);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_anchor_shared',
      expect.objectContaining({ cloudAnchorId: 'cloud-abc', quality: 0.9 })
    );
  });

  it('defaults quality to 1.0 when not provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'shared_anchor_upload_complete', cloudAnchorId: 'cid' });
    expect(st(node).quality).toBe(1.0);
  });
});

// ─── onEvent — shared_anchor_upload_failed ────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_upload_failed', () => {
  it('sets state=error and emits on_anchor_share_failed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'shared_anchor_upload_failed', error: 'network timeout' });
    expect(st(node).state).toBe('error');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_anchor_share_failed',
      expect.objectContaining({ error: 'network timeout' })
    );
  });
});

// ─── onEvent — shared_anchor_resolve ──────────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_resolve', () => {
  it('sets state=resolving and emits shared_anchor_resolve_request', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cloud_provider: 'azure', resolution_timeout: 5000 });
    fire(node, cfg, ctx, { type: 'shared_anchor_resolve', cloudAnchorId: 'remote-id' });
    expect(st(node).state).toBe('resolving');
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_resolve_request',
      expect.objectContaining({
        cloudAnchorId: 'remote-id',
        provider: 'azure',
        timeout: 5000,
      })
    );
  });
});

// ─── onEvent — shared_anchor_resolved ────────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_resolved', () => {
  it('marks synchronized, isShared, not creator, emits on_anchor_resolved', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, {
      type: 'shared_anchor_resolved',
      cloudAnchorId: 'rid',
      handle: { h: 1 },
    });
    const s = st(node);
    expect(s.cloudAnchorId).toBe('rid');
    expect(s.isShared).toBe(true);
    expect(s.isCreator).toBe(false);
    expect(s.state).toBe('synchronized');
    expect(s.localAnchorHandle).toEqual({ h: 1 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_anchor_resolved',
      expect.objectContaining({ cloudAnchorId: 'rid' })
    );
  });
});

// ─── onEvent — shared_anchor_user_joined ─────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_user_joined', () => {
  it('adds user to sharedUsers and emits on_user_joined', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_users: 5 });
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u1' });
    expect(st(node).sharedUsers).toHaveLength(1);
    expect(st(node).sharedUsers[0].userId).toBe('u1');
    expect(st(node).sharedUsers[0].isResolved).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_user_joined',
      expect.objectContaining({ userId: 'u1', userCount: 1 })
    );
  });

  it('rejects user when max_users reached and emits shared_anchor_user_rejected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_users: 1 });
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u1' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u2' });
    expect(st(node).sharedUsers).toHaveLength(1); // still 1
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_user_rejected',
      expect.objectContaining({
        userId: 'u2',
        reason: 'max_users_reached',
      })
    );
  });
});

// ─── onEvent — shared_anchor_user_resolved ────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_user_resolved', () => {
  it('marks user.isResolved=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_users: 5 });
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u1' });
    fire(node, cfg, ctx, { type: 'shared_anchor_user_resolved', userId: 'u1' });
    expect(st(node).sharedUsers[0].isResolved).toBe(true);
  });

  it('unknown userId ignored gracefully', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    expect(() =>
      fire(node, cfg, ctx, { type: 'shared_anchor_user_resolved', userId: 'ghost' })
    ).not.toThrow();
  });
});

// ─── onEvent — shared_anchor_user_left ────────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_user_left', () => {
  it('removes user and emits on_user_left', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_users: 5 });
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u1' });
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u2' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_anchor_user_left', userId: 'u1' });
    const users = st(node).sharedUsers;
    expect(users).toHaveLength(1);
    expect(users[0].userId).toBe('u2');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_user_left',
      expect.objectContaining({ userId: 'u1', userCount: 1 })
    );
  });
});

// ─── onEvent — shared_anchor_share (manual) ───────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_share', () => {
  it('triggers upload when not yet shared', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cloud_provider: 'arcore' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_anchor_share' });
    expect(st(node).state).toBe('uploading');
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_upload',
      expect.objectContaining({ provider: 'arcore' })
    );
  });

  it('does NOT trigger upload when already shared', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isShared = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_anchor_share' });
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_anchor_upload', expect.any(Object));
  });
});

// ─── onEvent — shared_anchor_query ────────────────────────────────────────────

describe('SharedAnchorTrait — onEvent: shared_anchor_query', () => {
  it('emits shared_anchor_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_users: 5 });
    st(node).state = 'synchronized';
    st(node).cloudAnchorId = 'qid';
    st(node).isCreator = true;
    st(node).quality = 0.8;
    fire(node, cfg, ctx, { type: 'shared_anchor_user_joined', userId: 'u1' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_anchor_query', queryId: 'qs1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'shared_anchor_info',
      expect.objectContaining({
        queryId: 'qs1',
        state: 'synchronized',
        cloudAnchorId: 'qid',
        isCreator: true,
        userCount: 1,
        quality: 0.8,
      })
    );
  });
});
