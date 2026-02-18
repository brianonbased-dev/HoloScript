import { describe, it, expect, beforeEach } from 'vitest';
import { sharedWorldHandler } from '../SharedWorldTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('SharedWorldTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    authority_model: 'host' as const,
    sync_rate: 10,
    conflict_resolution: 'last_write_wins' as const,
    object_ownership: true,
    late_join_sync: true,
    state_persistence: false,
    max_objects: 100,
    interpolation: true,
    persona_count: 4,
    persona_feature: 'spatial_audio' as const,
    avatar_style: 'realistic' as const,
    spatial_audio_enabled: true,
    activity_type: 'collaborative_design' as const,
    sync_mode: 'realtime' as const,
    latency_compensation: true,
    persona_radius: 2.0,
    height_offset: 1.6,
  };

  beforeEach(() => {
    node = createMockNode('shared');
    ctx = createMockContext();
    attachTrait(sharedWorldHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__sharedWorldState;
    expect(state).toBeDefined();
    expect(state.isSynced).toBe(false);
    expect(state.objectCount).toBe(0);
  });

  it('emits shared_world_init on attach', () => {
    expect(getEventCount(ctx, 'shared_world_init')).toBe(1);
  });

  it('shared_world_register_object adds synced object', () => {
    sendEvent(sharedWorldHandler, node, cfg, ctx, {
      type: 'shared_world_register_object',
      nodeId: 'obj1',
      ownerId: 'user1',
    });
    const state = (node as any).__sharedWorldState;
    expect(state.syncedObjects.size).toBe(1);
    expect(state.objectCount).toBe(1);
  });

  it('shared_world_peer_joined adds peer', () => {
    sendEvent(sharedWorldHandler, node, cfg, ctx, {
      type: 'shared_world_peer_joined',
      peerId: 'peer1',
    });
    expect((node as any).__sharedWorldState.connectedPeers.has('peer1')).toBe(true);
    expect(getEventCount(ctx, 'on_peer_joined')).toBe(1);
  });

  it('shared_world_peer_left removes peer', () => {
    sendEvent(sharedWorldHandler, node, cfg, ctx, {
      type: 'shared_world_peer_joined', peerId: 'peer1',
    });
    sendEvent(sharedWorldHandler, node, cfg, ctx, {
      type: 'shared_world_peer_left', peerId: 'peer1',
    });
    expect((node as any).__sharedWorldState.connectedPeers.has('peer1')).toBe(false);
  });

  it('spatial personas initialized', () => {
    const state = (node as any).__sharedWorldState;
    expect(state.spatialPersonas).toBeDefined();
    expect(state.spatialPersonas.size).toBe(4);
  });

  it('detach cleans up', () => {
    sharedWorldHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__sharedWorldState).toBeUndefined();
  });
});
