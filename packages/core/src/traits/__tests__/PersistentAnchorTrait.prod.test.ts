/**
 * PersistentAnchorTrait Production Tests
 *
 * Anchor that survives session restarts via local or cloud storage.
 * Covers: defaultConfig, onAttach (auto_resolve on/off), onDetach (save guard),
 * onUpdate (TTL expired, stale, position apply), and all 7 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { persistentAnchorHandler } from '../PersistentAnchorTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'pa_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...persistentAnchorHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  persistentAnchorHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__persistentAnchorState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  persistentAnchorHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('PersistentAnchorTrait — defaultConfig', () => {
  it('has 7 fields with correct defaults', () => {
    const d = persistentAnchorHandler.defaultConfig!;
    expect(d.storage).toBe('local');
    expect(d.ttl).toBe(86400000);
    expect(d.auto_resolve).toBe(true);
    expect(d.name).toBe('');
    expect(d.fallback_position).toEqual([0, 0, 0]);
    expect(d.max_resolve_attempts).toBe(3);
    expect(d.resolve_timeout).toBe(10000);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('PersistentAnchorTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.state).toBe('unresolved'); // no name → no auto_resolve
    expect(s.persistedId).toBeNull();
    expect(s.isResolved).toBe(false);
    expect(s.resolveAttempts).toBe(0);
    expect(s.localPosition).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.localRotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(s.anchorHandle).toBeNull();
  });

  it('auto_resolve=true + name set: state=resolving + emits persistent_anchor_load', () => {
    const node = makeNode();
    const { ctx } = attach(node, { auto_resolve: true, name: 'my_anchor', storage: 'cloud' });
    expect(st(node).state).toBe('resolving');
    expect(ctx.emit).toHaveBeenCalledWith(
      'persistent_anchor_load',
      expect.objectContaining({
        name: 'my_anchor',
        storage: 'cloud',
      })
    );
  });

  it('auto_resolve=true but no name: state stays unresolved, no emit', () => {
    const node = makeNode();
    const { ctx } = attach(node, { auto_resolve: true, name: '' });
    expect(st(node).state).toBe('unresolved');
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('auto_resolve=false: state stays unresolved, no emit', () => {
    const node = makeNode();
    const { ctx } = attach(node, { auto_resolve: false, name: 'anchor' });
    expect(st(node).state).toBe('unresolved');
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('PersistentAnchorTrait — onDetach', () => {
  it('emits persistent_anchor_save when anchorHandle exists + name set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'anchor', storage: 'local', ttl: 3600 });
    st(node).anchorHandle = { type: 'anchor-ref' };
    ctx.emit.mockClear();
    persistentAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'persistent_anchor_save',
      expect.objectContaining({
        name: 'anchor',
        storage: 'local',
        ttl: 3600,
      })
    );
  });

  it('no save emit when anchorHandle is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'anchor' });
    ctx.emit.mockClear();
    persistentAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('persistent_anchor_save', expect.any(Object));
  });

  it('no save emit when name is empty (even with handle)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: '' });
    st(node).anchorHandle = { type: 'anchor-ref' };
    ctx.emit.mockClear();
    persistentAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('persistent_anchor_save', expect.any(Object));
  });

  it('removes __persistentAnchorState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    persistentAnchorHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__persistentAnchorState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('PersistentAnchorTrait — onUpdate', () => {
  it('no-op when state not resolved or tracking', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { ttl: 0 });
    ctx.emit.mockClear();
    persistentAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('marks expired and emits on_persistent_anchor_expired when age > ttl', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { ttl: 1000, name: 'a' });
    const s = st(node);
    s.isResolved = true;
    s.createdAt = Date.now() - 2000; // 2 seconds old, ttl=1s
    ctx.emit.mockClear();
    persistentAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(s.state).toBe('expired');
    expect(s.isResolved).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_persistent_anchor_expired',
      expect.objectContaining({ name: 'a' })
    );
  });

  it('marks stale when age > ttl * 0.9 but not yet expired', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { ttl: 1000 });
    const s = st(node);
    s.isResolved = true;
    s.createdAt = Date.now() - 950; // 950ms old, 90% = 900ms
    ctx.emit.mockClear();
    persistentAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(s.state).toBe('stale');
    expect(ctx.emit).not.toHaveBeenCalledWith('on_persistent_anchor_expired', expect.any(Object));
  });

  it('ttl=0 means no expiry even with old anchor', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { ttl: 0 });
    const s = st(node);
    s.isResolved = true;
    s.createdAt = Date.now() - 999_999_999;
    ctx.emit.mockClear();
    persistentAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(s.state).not.toBe('expired');
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('applies localPosition to node.position when state=tracking', () => {
    const node = { ...makeNode(), position: [0, 0, 0] };
    const { cfg, ctx } = attach(node, { ttl: 0 });
    const s = st(node);
    s.state = 'tracking';
    s.localPosition = { x: 1, y: 2, z: 3 };
    persistentAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.position.x).toBe(1);
    expect(node.position.y).toBe(2);
    expect(node.position.z).toBe(3);
  });

  it('applies localRotation to node.rotation when state=resolved', () => {
    const node = { ...makeNode(), rotation: { x: 0, y: 0, z: 0, w: 0 } };
    const { cfg, ctx } = attach(node, { ttl: 0 });
    const s = st(node);
    s.state = 'resolved';
    s.localRotation = { x: 0, y: 0.707, z: 0, w: 0.707 };
    persistentAnchorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.rotation.w).toBeCloseTo(0.707);
  });
});

// ─── onEvent — persistent_anchor_loaded ───────────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_loaded', () => {
  it('marks resolved, stores id/handle, emits on_persistent_anchor_resolved', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'myAnchor', auto_resolve: false });
    fire(node, cfg, ctx, {
      type: 'persistent_anchor_loaded',
      id: 'anchor-123',
      handle: { ref: 'x' },
    });
    const s = st(node);
    expect(s.persistedId).toBe('anchor-123');
    expect(s.isResolved).toBe(true);
    expect(s.state).toBe('resolved');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_persistent_anchor_resolved',
      expect.objectContaining({
        name: 'myAnchor',
        id: 'anchor-123',
      })
    );
  });

  it('uses event.createdAt if provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { auto_resolve: false });
    const past = Date.now() - 5000;
    fire(node, cfg, ctx, {
      type: 'persistent_anchor_loaded',
      id: 'a1',
      handle: {},
      createdAt: past,
    });
    expect(Math.abs(st(node).createdAt - past)).toBeLessThanOrEqual(10);
  });
});

// ─── onEvent — persistent_anchor_not_found ────────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_not_found', () => {
  it('increments resolveAttempts but no fallback below threshold', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_resolve_attempts: 3, auto_resolve: false });
    fire(node, cfg, ctx, { type: 'persistent_anchor_not_found' });
    expect(st(node).resolveAttempts).toBe(1);
    expect(ctx.emit).not.toHaveBeenCalledWith('on_persistent_anchor_fallback', expect.any(Object));
  });

  it('uses fallback position after max_resolve_attempts reached', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      max_resolve_attempts: 2,
      fallback_position: [5, 0, 5],
      auto_resolve: false,
    });
    fire(node, cfg, ctx, { type: 'persistent_anchor_not_found' });
    fire(node, cfg, ctx, { type: 'persistent_anchor_not_found' });
    const s = st(node);
    expect(s.localPosition).toEqual({ x: 5, y: 0, z: 5 });
    expect(s.state).toBe('unresolved');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_persistent_anchor_fallback',
      expect.objectContaining({
        fallbackPosition: [5, 0, 5],
      })
    );
  });
});

// ─── onEvent — persistent_anchor_pose_update ──────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_pose_update', () => {
  it('updates position/rotation and sets state=tracking', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { auto_resolve: false });
    const pos = { x: 1, y: 2, z: 3 };
    const rot = { x: 0, y: 1, z: 0, w: 0 };
    fire(node, cfg, ctx, { type: 'persistent_anchor_pose_update', position: pos, rotation: rot });
    expect(st(node).localPosition).toEqual(pos);
    expect(st(node).localRotation).toEqual(rot);
    expect(st(node).state).toBe('tracking');
  });
});

// ─── onEvent — persistent_anchor_create ───────────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_create', () => {
  it('emits persistent_anchor_create_request with node position if available', () => {
    const node = {
      ...makeNode(),
      position: [10, 0, 20],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };
    const { cfg, ctx } = attach(node, {
      name: 'new_anchor',
      storage: 'cloud',
      ttl: 7200,
      auto_resolve: false,
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'persistent_anchor_create' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'persistent_anchor_create_request',
      expect.objectContaining({
        name: 'new_anchor',
        storage: 'cloud',
        ttl: 7200,
        position: [10, 0, 20],
      })
    );
  });

  it('uses default {0,0,0} position when node has no position', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'n', auto_resolve: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'persistent_anchor_create' });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'persistent_anchor_create_request'
    )?.[1];
    expect(call.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ─── onEvent — persistent_anchor_created ──────────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_created', () => {
  it('stores id/handle, sets resolved, emits on_persistent_anchor_created', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'newAnchor', auto_resolve: false });
    fire(node, cfg, ctx, {
      type: 'persistent_anchor_created',
      id: 'anchor-new',
      handle: { ref: 'y' },
    });
    const s = st(node);
    expect(s.persistedId).toBe('anchor-new');
    expect(s.isResolved).toBe(true);
    expect(s.state).toBe('resolved');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_persistent_anchor_created',
      expect.objectContaining({
        name: 'newAnchor',
        id: 'anchor-new',
      })
    );
  });
});

// ─── onEvent — persistent_anchor_delete ───────────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_delete', () => {
  it('emits delete_request and resets state', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'anchor', storage: 'local', auto_resolve: false });
    st(node).persistedId = 'aid';
    st(node).isResolved = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'persistent_anchor_delete' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'persistent_anchor_delete_request',
      expect.objectContaining({ id: 'aid' })
    );
    expect(st(node).persistedId).toBeNull();
    expect(st(node).isResolved).toBe(false);
    expect(st(node).state).toBe('unresolved');
  });
});

// ─── onEvent — persistent_anchor_query ────────────────────────────────────────

describe('PersistentAnchorTrait — onEvent: persistent_anchor_query', () => {
  it('emits persistent_anchor_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { name: 'qa', ttl: 3600, auto_resolve: false });
    st(node).persistedId = 'qid';
    st(node).state = 'resolved';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'persistent_anchor_query', queryId: 'q9' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'persistent_anchor_info',
      expect.objectContaining({
        queryId: 'q9',
        name: 'qa',
        id: 'qid',
        state: 'resolved',
      })
    );
  });

  it('ttlRemaining = Infinity when ttl=0', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { ttl: 0, auto_resolve: false });
    fire(node, cfg, ctx, { type: 'persistent_anchor_query', queryId: 'q0' });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'persistent_anchor_info'
    )?.[1];
    expect(call.ttlRemaining).toBe(Infinity);
  });
});
