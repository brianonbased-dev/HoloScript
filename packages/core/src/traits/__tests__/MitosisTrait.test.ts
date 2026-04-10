import { describe, it, expect, beforeEach } from 'vitest';
import { mitosisHandler } from '../MitosisTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('MitosisTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    strategy: 'collaborative' as const,
    max_children: 5,
    auto_cleanup: true,
  };

  beforeEach(() => {
    node = createMockNode('mt');
    ctx = createMockContext();
    attachTrait(mitosisHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    expect(getEventCount(ctx, 'mitosis_init')).toBe(1);
    const s = (node as any).__mitosisState;
    expect(s.active_children).toEqual([]);
    expect(s.tasks_delegated).toBe(0);
    expect(s.completed_tasks).toBe(0);
  });

  it('mitosis_spawned adds child', () => {
    sendEvent(mitosisHandler, node, cfg, ctx, {
      type: 'mitosis_spawned',
      childId: 'child-1',
      parentId: (node as any).id,
    });
    const s = (node as any).__mitosisState;
    expect(s.active_children).toContain('child-1');
    expect(s.tasks_delegated).toBe(1);
    expect(getEventCount(ctx, 'on_mitosis_spawned')).toBe(1);
  });

  it('ignores spawn for different parent', () => {
    sendEvent(mitosisHandler, node, cfg, ctx, {
      type: 'mitosis_spawned',
      childId: 'child-1',
      parentId: 'other-parent',
    });
    const s = (node as any).__mitosisState;
    expect(s.active_children.length).toBe(0);
  });

  it('mitosis_child_complete syncs and merges (collaborative)', () => {
    (node as any).properties = {};
    sendEvent(mitosisHandler, node, cfg, ctx, {
      type: 'mitosis_child_complete',
      childId: 'child-1',
      parentId: (node as any).id,
      result: { score: 42 },
    });
    const s = (node as any).__mitosisState;
    expect(s.completed_tasks).toBe(1);
    expect((node as any).properties.score).toBe(42);
    expect(getEventCount(ctx, 'mitosis_synced')).toBe(1);
  });

  it('mitosis_child_failed emits error', () => {
    sendEvent(mitosisHandler, node, cfg, ctx, {
      type: 'mitosis_child_failed',
      childId: 'child-1',
      error: 'timeout',
    });
    expect(getEventCount(ctx, 'on_mitosis_error')).toBe(1);
  });

  it('detach with auto_cleanup despawns children', () => {
    sendEvent(mitosisHandler, node, cfg, ctx, {
      type: 'mitosis_spawned',
      childId: 'child-1',
      parentId: (node as any).id,
    });
    sendEvent(mitosisHandler, node, cfg, ctx, {
      type: 'mitosis_spawned',
      childId: 'child-2',
      parentId: (node as any).id,
    });
    mitosisHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'mitosis_despawn_child')).toBe(2);
    expect((node as any).__mitosisState).toBeUndefined();
  });
});
