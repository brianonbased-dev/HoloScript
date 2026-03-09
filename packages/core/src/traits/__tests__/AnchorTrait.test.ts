import { describe, it, expect, beforeEach } from 'vitest';
import { anchorHandler } from '../AnchorTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('AnchorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    anchor_type: 'spatial' as const,
    tracking_quality: 'high' as const,
    offset: [0, 0.1, 0] as [number, number, number],
    alignment: 'gravity' as const,
    fallback_behavior: 'freeze' as const,
    timeout_ms: 5000,
    persist: false,
    recovery_attempts: 3,
  };

  beforeEach(() => {
    node = createMockNode('anchor');
    ctx = createMockContext();
    attachTrait(anchorHandler, node, cfg, ctx);
  });

  it('initializes in initializing state', () => {
    const s = (node as any).__anchorState;
    expect(s.trackingState).toBe('initializing');
    expect(s.isAnchored).toBe(false);
  });

  it('emits anchor_request on attach', () => {
    expect(getEventCount(ctx, 'anchor_request')).toBe(1);
  });

  it('anchor_created starts tracking', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    const s = (node as any).__anchorState;
    expect(s.anchorId).toBe('anc1');
    expect(s.isAnchored).toBe(true);
    expect(s.trackingState).toBe('tracking');
    expect(getEventCount(ctx, 'anchor_ready')).toBe(1);
  });

  it('anchor_pose_update updates pose', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    sendEvent(anchorHandler, node, cfg, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc1',
      pose: {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        confidence: 0.9,
      },
    });
    expect((node as any).__anchorState.pose.position).toEqual({ x: 1, y: 2, z: 3 });
    expect((node as any).__anchorState.updateCount).toBe(1);
  });

  it('ignores pose update for wrong anchor', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    sendEvent(anchorHandler, node, cfg, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc999',
      pose: {},
    });
    expect((node as any).__anchorState.updateCount).toBe(0);
  });

  it('anchor_tracking_lost transitions to lost', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_tracking_lost', anchorId: 'anc1' });
    expect((node as any).__anchorState.trackingState).toBe('lost');
    expect(getEventCount(ctx, 'anchor_lost')).toBe(1);
  });

  it('recovers from lost on pose update', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_tracking_lost', anchorId: 'anc1' });
    sendEvent(anchorHandler, node, cfg, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc1',
      pose: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 1 },
    });
    expect((node as any).__anchorState.trackingState).toBe('tracking');
    expect(getEventCount(ctx, 'anchor_recovered')).toBe(1);
  });

  it('applies offset in update when tracking', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    sendEvent(anchorHandler, node, cfg, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc1',
      pose: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 1 },
    });
    ctx.clearEvents();
    updateTrait(anchorHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'set_position')).toBe(1);
  });

  it('cleans up on detach', () => {
    sendEvent(anchorHandler, node, cfg, ctx, { type: 'anchor_created', anchorId: 'anc1' });
    anchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__anchorState).toBeUndefined();
    expect(getEventCount(ctx, 'anchor_release')).toBe(1);
  });
});
