/**
 * SharedWorldTrait Production Tests
 *
 * Synchronized world state across devices for multiplayer XR.
 * Covers: defaultConfig (V43 visionOS fields), onAttach (persona circular layout),
 * onDetach (leave+persist guards), onUpdate (sync rate accumulator + pending updates),
 * and all 10 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { sharedWorldHandler } from '../SharedWorldTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'sw_test' } as any; }
function makeCtx() { return { emit: vi.fn() }; }

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...sharedWorldHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  sharedWorldHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) { return node.__sharedWorldState as any; }
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  sharedWorldHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('SharedWorldTrait — defaultConfig', () => {
  it('has core sync fields', () => {
    const d = sharedWorldHandler.defaultConfig!;
    expect(d.authority_model).toBe('server');
    expect(d.sync_rate).toBe(20);
    expect(d.conflict_resolution).toBe('server_wins');
    expect(d.object_ownership).toBe(true);
    expect(d.late_join_sync).toBe(true);
    expect(d.state_persistence).toBe(false);
    expect(d.max_objects).toBe(1000);
    expect(d.interpolation).toBe(true);
  });

  it('has V43 visionOS spatial persona defaults', () => {
    const d = sharedWorldHandler.defaultConfig!;
    expect(d.persona_count).toBe(4);
    expect(d.persona_feature).toBe('spatial_audio');
    expect(d.avatar_style).toBe('realistic');
    expect(d.spatial_audio_enabled).toBe(true);
    expect(d.activity_type).toBe('collaborative_design');
    expect(d.sync_mode).toBe('realtime');
    expect(d.latency_compensation).toBe(true);
    expect(d.persona_radius).toBeCloseTo(2.0);
    expect(d.height_offset).toBeCloseTo(1.6);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('SharedWorldTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.isSynced).toBe(false);
    expect(s.isHost).toBe(false);
    expect(s.objectCount).toBe(0);
    expect(s.syncedObjects).toBeInstanceOf(Map);
    expect(s.connectedPeers).toBeInstanceOf(Set);
    expect(s.pendingUpdates).toEqual([]);
  });

  it('emits shared_world_init with authorityModel, syncRate, personaCount, activityType', () => {
    const node = makeNode();
    const { ctx } = attach(node, { authority_model: 'host', sync_rate: 60, persona_count: 2, activity_type: 'multiplayer_game' });
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_init', expect.objectContaining({
      authorityModel: 'host', syncRate: 60, personaCount: 2, activityType: 'multiplayer_game',
    }));
  });

  it('creates spatialPersonas in circular layout when persona_count > 0', () => {
    const node = makeNode();
    attach(node, { persona_count: 4, persona_radius: 2.0, height_offset: 1.6, persona_feature: 'eye_contact' });
    const personas = st(node).spatialPersonas as Map<string, any>;
    expect(personas).toBeInstanceOf(Map);
    expect(personas.size).toBe(4);
    const p0 = personas.get('persona_0')!;
    expect(p0.position[1]).toBeCloseTo(1.6); // y = heightOffset
    expect(p0.feature).toBe('eye_contact');
    // persona_0 at angle=0: x=cos(0)*2=2, z=sin(0)*2=0
    expect(p0.position[0]).toBeCloseTo(2.0);
    expect(p0.position[2]).toBeCloseTo(0.0);
  });

  it('persona faces center: rotation = angle + PI', () => {
    const node = makeNode();
    attach(node, { persona_count: 2, persona_radius: 1.0, height_offset: 1.0 });
    const personas = st(node).spatialPersonas as Map<string, any>;
    const p0 = personas.get('persona_0')!;
    expect(p0.rotation).toBeCloseTo(Math.PI); // angle=0, so rotation=0+PI
  });

  it('spatialPersonas is undefined when persona_count is 0', () => {
    const node = makeNode();
    attach(node, { persona_count: 0 });
    expect(st(node).spatialPersonas).toBeUndefined();
  });

  it('activeActivity is set from config.activity_type', () => {
    const node = makeNode();
    attach(node, { activity_type: 'shared_viewing' });
    expect(st(node).activeActivity).toBe('shared_viewing');
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('SharedWorldTrait — onDetach', () => {
  it('no-op (no leave/persist) when not synced', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { state_persistence: true });
    ctx.emit.mockClear();
    sharedWorldHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_leave', expect.any(Object));
  });

  it('emits shared_world_leave when isSynced=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isSynced = true;
    ctx.emit.mockClear();
    sharedWorldHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_leave', expect.any(Object));
  });

  it('emits shared_world_persist when isSynced=true and state_persistence=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { state_persistence: true });
    st(node).isSynced = true;
    ctx.emit.mockClear();
    sharedWorldHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_persist', expect.any(Object));
  });

  it('no persist when state_persistence=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { state_persistence: false });
    st(node).isSynced = true;
    ctx.emit.mockClear();
    sharedWorldHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_persist', expect.any(Object));
  });

  it('removes __sharedWorldState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    sharedWorldHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__sharedWorldState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('SharedWorldTrait — onUpdate', () => {
  it('no-op when not synced', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    sharedWorldHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('accumulates syncAccumulator but does not send before interval', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { sync_rate: 20 }); // interval = 50ms = 0.05s
    st(node).isSynced = true;
    ctx.emit.mockClear();
    sharedWorldHandler.onUpdate!(node, cfg, ctx as any, 0.03); // 30ms < 50ms
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_send_updates', expect.any(Object));
  });

  it('flushes pending updates when interval elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { sync_rate: 10 }); // interval = 100ms
    st(node).isSynced = true;
    st(node).pendingUpdates = [{ nodeId: 'n1', state: {}, version: 1 }];
    ctx.emit.mockClear();
    sharedWorldHandler.onUpdate!(node, cfg, ctx as any, 0.11);
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_send_updates', expect.any(Object));
    expect(st(node).pendingUpdates).toEqual([]);
    expect(st(node).syncAccumulator).toBe(0);
  });

  it('does NOT emit send_updates when pendingUpdates is empty', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { sync_rate: 10 });
    st(node).isSynced = true;
    ctx.emit.mockClear();
    sharedWorldHandler.onUpdate!(node, cfg, ctx as any, 0.11);
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_send_updates', expect.any(Object));
  });
});

// ─── onEvent — shared_world_connected ────────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_connected', () => {
  it('sets isSynced=true + isHost, emits on_world_connected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_connected', isHost: true });
    expect(st(node).isSynced).toBe(true);
    expect(st(node).isHost).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_world_connected', expect.objectContaining({ isHost: true }));
  });

  it('non-host + late_join_sync: emits shared_world_request_state', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { late_join_sync: true });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_connected', isHost: false });
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_request_state', expect.any(Object));
  });

  it('host does NOT request state even when late_join_sync=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { late_join_sync: true });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_connected', isHost: true });
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_request_state', expect.any(Object));
  });
});

// ─── onEvent — shared_world_full_state ───────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_full_state', () => {
  it('populates syncedObjects, emits apply_state per object, updates objectCount', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { interpolation: false });
    ctx.emit.mockClear();
    const objects = [
      { nodeId: 'n1', ownerId: 'u1', state: { pos: [0,0,0] }, version: 3 },
      { nodeId: 'n2', ownerId: null, state: { pos: [1,0,0] }, version: 1 },
    ];
    fire(node, cfg, ctx, { type: 'shared_world_full_state', objects });
    expect(st(node).syncedObjects.size).toBe(2);
    expect(st(node).objectCount).toBe(2);
    const applyEmits = (ctx.emit as any).mock.calls.filter((c: any[]) => c[0] === 'shared_world_apply_state');
    expect(applyEmits.length).toBe(2);
    expect(applyEmits[0][1]).toMatchObject({ targetNodeId: 'n1', interpolate: false });
  });
});

// ─── onEvent — shared_world_register_object ───────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_register_object', () => {
  it('registers object up to max_objects, ownerId honoured when object_ownership=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_objects: 5, object_ownership: true });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: 'u1' });
    expect(st(node).syncedObjects.size).toBe(1);
    expect(st(node).syncedObjects.get('n1')!.ownerId).toBe('u1');
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_object_registered', expect.objectContaining({ nodeId: 'n1' }));
  });

  it('ownerId set to null when object_ownership=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { object_ownership: false });
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n2', ownerId: 'u2' });
    expect(st(node).syncedObjects.get('n2')!.ownerId).toBeNull();
  });

  it('does not register beyond max_objects', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_objects: 1 });
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: null });
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n2', ownerId: null });
    expect(st(node).syncedObjects.size).toBe(1);
  });
});

// ─── onEvent — shared_world_update_object ────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_update_object', () => {
  function setup(cfg: any) {
    const node = makeNode();
    const { ctx } = attach(node, cfg);
    // Register a node owned by u1
    sharedWorldHandler.onEvent!(node, { ...sharedWorldHandler.defaultConfig, ...cfg } as any, ctx as any,
      { type: 'shared_world_register_object', nodeId: 'nA', ownerId: 'u1' } as any);
    ctx.emit.mockClear();
    return { node, cfg: { ...sharedWorldHandler.defaultConfig, ...cfg }, ctx };
  }

  it('applies update when version > current version', () => {
    const { node, cfg, ctx } = setup({ object_ownership: false, conflict_resolution: 'server_wins', interpolation: true });
    st(node).syncedObjects.get('nA')!.version = 2;
    fire(node, cfg, ctx, { type: 'shared_world_update_object', nodeId: 'nA', state: { pos: [1,0,0] }, senderId: 'u2', version: 5 });
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_apply_state', expect.objectContaining({ targetNodeId: 'nA', interpolate: true }));
  });

  it('rejects update from non-owner when conflict_resolution=reject and object_ownership=true', () => {
    const { node, cfg, ctx } = setup({ object_ownership: true, conflict_resolution: 'reject' });
    fire(node, cfg, ctx, { type: 'shared_world_update_object', nodeId: 'nA', state: {}, senderId: 'NOT_OWNER', version: 5 });
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_apply_state', expect.any(Object));
  });

  it('applies update for last_write_wins regardless of version', () => {
    const { node, cfg, ctx } = setup({ object_ownership: false, conflict_resolution: 'last_write_wins' });
    st(node).syncedObjects.get('nA')!.version = 99;
    fire(node, cfg, ctx, { type: 'shared_world_update_object', nodeId: 'nA', state: {}, senderId: 'u2', version: 1 });
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_apply_state', expect.any(Object));
  });
});

// ─── onEvent — shared_world_queue_update ─────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_queue_update', () => {
  it('pushes to pendingUpdates and increments object version', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: null });
    const prevV = st(node).syncedObjects.get('n1')!.version;
    fire(node, cfg, ctx, { type: 'shared_world_queue_update', nodeId: 'n1', state: { x: 1 } });
    expect(st(node).pendingUpdates.length).toBe(1);
    expect(st(node).syncedObjects.get('n1')!.version).toBe(prevV + 1);
  });

  it('no-op for unknown nodeId', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'shared_world_queue_update', nodeId: 'unknown', state: {} });
    expect(st(node).pendingUpdates.length).toBe(0);
  });
});

// ─── onEvent — shared_world_peer_joined ──────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_peer_joined', () => {
  it('adds peer, emits on_peer_joined', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_peer_joined', peerId: 'p1' });
    expect(st(node).connectedPeers.size).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('on_peer_joined', expect.objectContaining({ peerId: 'p1', peerCount: 1 }));
  });

  it('host + late_join_sync: sends full state to new peer', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { late_join_sync: true });
    st(node).isHost = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_peer_joined', peerId: 'p2' });
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_send_full_state', expect.objectContaining({ targetPeerId: 'p2' }));
  });

  it('non-host does NOT send full state', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { late_join_sync: true });
    st(node).isHost = false;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_peer_joined', peerId: 'p3' });
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_send_full_state', expect.any(Object));
  });
});

// ─── onEvent — shared_world_peer_left ────────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_peer_left', () => {
  it('removes peer, emits on_peer_left, clears ownership of owned objects', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { object_ownership: true });
    fire(node, cfg, ctx, { type: 'shared_world_peer_joined', peerId: 'p1' });
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: 'p1' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_peer_left', peerId: 'p1' });
    expect(st(node).connectedPeers.size).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('on_peer_left', expect.objectContaining({ peerId: 'p1', peerCount: 0 }));
    expect(st(node).syncedObjects.get('n1')!.ownerId).toBeNull();
  });
});

// ─── onEvent — shared_world_claim_ownership ───────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_claim_ownership', () => {
  it('claims unowned object and emits shared_world_ownership_changed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: null });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_claim_ownership', nodeId: 'n1', ownerId: 'u3' });
    expect(st(node).syncedObjects.get('n1')!.ownerId).toBe('u3');
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_ownership_changed', expect.objectContaining({ nodeId: 'n1', ownerId: 'u3' }));
  });

  it('cannot claim already-owned object unless authority_model=distributed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { authority_model: 'server' });
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: 'u1' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_claim_ownership', nodeId: 'n1', ownerId: 'u2' });
    expect(st(node).syncedObjects.get('n1')!.ownerId).toBe('u1'); // unchanged
    expect(ctx.emit).not.toHaveBeenCalledWith('shared_world_ownership_changed', expect.any(Object));
  });

  it('distributed authority: can override existing owner', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { authority_model: 'distributed' });
    fire(node, cfg, ctx, { type: 'shared_world_register_object', nodeId: 'n1', ownerId: 'u1' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_claim_ownership', nodeId: 'n1', ownerId: 'u2' });
    expect(st(node).syncedObjects.get('n1')!.ownerId).toBe('u2');
  });
});

// ─── onEvent — shared_world_query ─────────────────────────────────────────────

describe('SharedWorldTrait — onEvent: shared_world_query', () => {
  it('emits shared_world_info with snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isSynced = true;
    st(node).isHost = true;
    st(node).objectCount = 7;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'shared_world_query', queryId: 'sq1' });
    expect(ctx.emit).toHaveBeenCalledWith('shared_world_info', expect.objectContaining({
      queryId: 'sq1', isSynced: true, isHost: true, objectCount: 7,
    }));
  });
});
