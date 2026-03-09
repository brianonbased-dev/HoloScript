import { describe, it, expect, beforeEach } from 'vitest';
import { sharedAnchorHandler } from '../SharedAnchorTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('SharedAnchorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    authority: 'creator' as const,
    resolution_timeout: 10000,
    max_users: 3,
    sync_interval: 1000,
    cloud_provider: 'arcore' as const,
    auto_share: false,
    quality_threshold: 0.5,
  };

  beforeEach(() => {
    node = createMockNode('sa');
    ctx = createMockContext();
    attachTrait(sharedAnchorHandler, node, cfg, ctx);
  });

  it('emits init on attach', () => {
    expect(getEventCount(ctx, 'shared_anchor_init')).toBe(1);
    expect((node as any).__sharedAnchorState.state).toBe('local');
  });

  it('auto_share triggers upload', () => {
    const n = createMockNode('sa2');
    const c = createMockContext();
    attachTrait(sharedAnchorHandler, n, { ...cfg, auto_share: true }, c);
    expect(getEventCount(c, 'shared_anchor_upload')).toBe(1);
    expect((n as any).__sharedAnchorState.state).toBe('uploading');
  });

  it('upload complete marks shared', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_upload_complete',
      cloudAnchorId: 'cloud-1',
      quality: 0.9,
    });
    const s = (node as any).__sharedAnchorState;
    expect(s.isShared).toBe(true);
    expect(s.isCreator).toBe(true);
    expect(s.state).toBe('shared');
    expect(getEventCount(ctx, 'on_anchor_shared')).toBe(1);
  });

  it('upload failed sets error state', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_upload_failed',
      error: 'timeout',
    });
    expect((node as any).__sharedAnchorState.state).toBe('error');
  });

  it('resolve sets synchronized state', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_resolved',
      cloudAnchorId: 'cloud-1',
      handle: 'h',
    });
    const s = (node as any).__sharedAnchorState;
    expect(s.state).toBe('synchronized');
    expect(s.isCreator).toBe(false);
  });

  it('user_joined adds user up to max', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_upload_complete',
      cloudAnchorId: 'c1',
      quality: 1,
    });
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_user_joined',
      userId: 'u1',
    });
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_user_joined',
      userId: 'u2',
    });
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_user_joined',
      userId: 'u3',
    });
    expect((node as any).__sharedAnchorState.sharedUsers.length).toBe(3);
    expect(getEventCount(ctx, 'on_user_joined')).toBe(3);
  });

  it('rejects user when max reached', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_upload_complete',
      cloudAnchorId: 'c1',
      quality: 1,
    });
    for (let i = 0; i < 4; i++) {
      sendEvent(sharedAnchorHandler, node, cfg, ctx, {
        type: 'shared_anchor_user_joined',
        userId: `u${i}`,
      });
    }
    expect(getEventCount(ctx, 'shared_anchor_user_rejected')).toBe(1);
  });

  it('user_left removes user', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_user_joined',
      userId: 'u1',
    });
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_user_left',
      userId: 'u1',
    });
    expect((node as any).__sharedAnchorState.sharedUsers.length).toBe(0);
    expect(getEventCount(ctx, 'on_user_left')).toBe(1);
  });

  it('sync emits periodically when shared', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_upload_complete',
      cloudAnchorId: 'c1',
      quality: 1,
    });
    updateTrait(sharedAnchorHandler, node, cfg, ctx, 1.1); // > 1000ms
    expect(getEventCount(ctx, 'shared_anchor_sync')).toBe(1);
  });

  it('query emits info', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, { type: 'shared_anchor_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'shared_anchor_info')).toBe(1);
  });

  it('detach leaves when shared', () => {
    sendEvent(sharedAnchorHandler, node, cfg, ctx, {
      type: 'shared_anchor_upload_complete',
      cloudAnchorId: 'c1',
      quality: 1,
    });
    sharedAnchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'shared_anchor_leave')).toBe(1);
    expect((node as any).__sharedAnchorState).toBeUndefined();
  });
});
