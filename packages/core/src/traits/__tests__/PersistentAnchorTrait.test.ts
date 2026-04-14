import { describe, it, expect, beforeEach } from 'vitest';
import { persistentAnchorHandler } from '../PersistentAnchorTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('PersistentAnchorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    storage: 'local' as const,
    ttl: 86400000,
    auto_resolve: true,
    name: 'test-anchor',
    fallback_position: [1, 2, 3] as [number, number, number],
    max_resolve_attempts: 3,
    resolve_timeout: 10000,
  };

  beforeEach(() => {
    node = createMockNode('pa');
    node.position = [0, 0, 0 ];
    node.rotation = [0, 0, 0, 1 ];
    ctx = createMockContext();
    attachTrait(persistentAnchorHandler, node, cfg, ctx);
  });

  it('auto-resolves on attach when name set', () => {
    expect((node as any).__persistentAnchorState.state).toBe('resolving');
    expect(getEventCount(ctx, 'persistent_anchor_load')).toBe(1);
  });

  it('loaded event resolves anchor', () => {
    sendEvent(persistentAnchorHandler, node, cfg, ctx, {
      type: 'persistent_anchor_loaded',
      id: 'a1',
      handle: 'h1',
      createdAt: Date.now(),
    });
    const s = (node as any).__persistentAnchorState;
    expect(s.state).toBe('resolved');
    expect(s.isResolved).toBe(true);
    expect(getEventCount(ctx, 'on_persistent_anchor_resolved')).toBe(1);
  });

  it('not_found after max attempts uses fallback', () => {
    for (let i = 0; i < 3; i++) {
      sendEvent(persistentAnchorHandler, node, cfg, ctx, { type: 'persistent_anchor_not_found' });
    }
    const s = (node as any).__persistentAnchorState;
    expect(s.state).toBe('unresolved');
    expect(s.localPosition.x).toBe(1);
    expect(getEventCount(ctx, 'on_persistent_anchor_fallback')).toBe(1);
  });

  it('pose_update sets tracking state', () => {
    sendEvent(persistentAnchorHandler, node, cfg, ctx, {
      type: 'persistent_anchor_pose_update',
      position: [5, 6, 7],
      rotation: [0, 1, 0, 0 ],
    });
    const s = (node as any).__persistentAnchorState;
    expect(s.state).toBe('tracking');
    expect(s.localPosition.x).toBe(5);
  });

  it('create request emits creation event', () => {
    sendEvent(persistentAnchorHandler, node, cfg, ctx, { type: 'persistent_anchor_create' });
    expect(getEventCount(ctx, 'persistent_anchor_create_request')).toBe(1);
  });

  it('created event stores id and handle', () => {
    sendEvent(persistentAnchorHandler, node, cfg, ctx, {
      type: 'persistent_anchor_created',
      id: 'new1',
      handle: 'h2',
    });
    const s = (node as any).__persistentAnchorState;
    expect(s.persistedId).toBe('new1');
    expect(s.state).toBe('resolved');
    expect(getEventCount(ctx, 'on_persistent_anchor_created')).toBe(1);
  });

  it('delete clears state', () => {
    sendEvent(persistentAnchorHandler, node, cfg, ctx, {
      type: 'persistent_anchor_created',
      id: 'del1',
      handle: 'h3',
    });
    sendEvent(persistentAnchorHandler, node, cfg, ctx, { type: 'persistent_anchor_delete' });
    const s = (node as any).__persistentAnchorState;
    expect(s.persistedId).toBeNull();
    expect(s.state).toBe('unresolved');
  });

  it('query returns state', () => {
    sendEvent(persistentAnchorHandler, node, cfg, ctx, {
      type: 'persistent_anchor_query',
      queryId: 'q1',
    });
    const r = getLastEvent(ctx, 'persistent_anchor_info') as any;
    expect(r.queryId).toBe('q1');
    expect(r.name).toBe('test-anchor');
  });

  it('detach saves anchor and cleans up', () => {
    // Set up a resolved anchor with a handle
    sendEvent(persistentAnchorHandler, node, cfg, ctx, {
      type: 'persistent_anchor_created',
      id: 'sv1',
      handle: 'hSave',
    });
    persistentAnchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__persistentAnchorState).toBeUndefined();
    expect(getEventCount(ctx, 'persistent_anchor_save')).toBe(1);
  });
});
