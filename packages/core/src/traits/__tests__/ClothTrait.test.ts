import { describe, it, expect, beforeEach } from 'vitest';
import { clothHandler } from '../ClothTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('ClothTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    resolution: 4,
    stiffness: 0.8,
    damping: 0.01,
    mass: 1.0,
    gravity_scale: 1.0,
    wind_response: 0.5,
    collision_margin: 0.01,
    self_collision: false,
    tearable: true,
    tear_threshold: 100,
    pin_vertices: [
      [0, 0],
      [0, 3],
    ] as Array<[number, number]>,
  };

  beforeEach(() => {
    node = createMockNode('cloth');
    ctx = createMockContext();
    attachTrait(clothHandler, node, cfg, ctx);
  });

  it('initializes mesh grid', () => {
    const state = (node as any).__clothState;
    expect(state.isSimulating).toBe(true);
    expect(state.vertices).toHaveLength(4);
    expect(state.vertices[0]).toHaveLength(4);
  });

  it('pinned vertices are marked', () => {
    const state = (node as any).__clothState;
    expect(state.vertices[0][0].isPinned).toBe(true);
    expect(state.vertices[0][3].isPinned).toBe(true);
    expect(state.vertices[1][1].isPinned).toBe(false);
  });

  it('creates structural constraints', () => {
    const state = (node as any).__clothState;
    // 4x4 grid: horizontal = 4*3=12, vertical = 3*4=12 => 24
    expect(state.constraints.length).toBe(24);
  });

  it('wind_update changes wind force', () => {
    sendEvent(clothHandler, node, cfg, ctx, {
      type: 'wind_update',
      direction: [5, 0, 0 ],
    });
    expect((node as any).__clothState.windForce.x).toBe(5);
  });

  it('pin_vertex pins a vertex', () => {
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_pin_vertex', x: 2, y: 2 });
    expect((node as any).__clothState.vertices[2][2].isPinned).toBe(true);
    expect(getEventCount(ctx, 'cloth_update_pin')).toBe(1);
  });

  it('unpin_vertex unpins', () => {
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_unpin_vertex', x: 0, y: 0 });
    expect((node as any).__clothState.vertices[0][0].isPinned).toBe(false);
  });

  it('constraint_break tears cloth when tearable', () => {
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_constraint_break', constraintIndex: 0 });
    const state = (node as any).__clothState;
    expect(state.constraints[0].broken).toBe(true);
    expect(state.isTorn).toBe(true);
    expect(getEventCount(ctx, 'on_cloth_tear')).toBe(1);
  });

  it('reset reinitializes mesh', () => {
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_constraint_break', constraintIndex: 0 });
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_reset' });
    const state = (node as any).__clothState;
    expect(state.isTorn).toBe(false);
    expect(state.constraints[0].broken).toBe(false);
  });

  it('pause and resume work', () => {
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_pause' });
    expect((node as any).__clothState.isSimulating).toBe(false);
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_resume' });
    expect((node as any).__clothState.isSimulating).toBe(true);
  });

  it('query returns info', () => {
    sendEvent(clothHandler, node, cfg, ctx, { type: 'cloth_query', queryId: 'cq' });
    const info = getLastEvent(ctx, 'cloth_info');
    expect(info.queryId).toBe('cq');
    expect(info.vertexCount).toBe(16);
    expect(info.constraintCount).toBe(24);
  });

  it('detach cleans up', () => {
    clothHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'cloth_destroy')).toBe(1);
    expect((node as any).__clothState).toBeUndefined();
  });
});
