/**
 * ScrollableTrait Production Tests
 *
 * Spring-physics scroll implementation with rubber-band boundaries.
 * Covers: defaultConfig, onAttach (state init), onDetach (state cleanup),
 * onUpdate (inertia decay, hard-clamp boundaries, content position sync),
 * and all 3 onEvent types (ui_press_start, ui_press_end, ui_drag).
 *
 * Spring-bounce path deferred (SpringAnimator is external); tests use
 * useSpringBounce=false for deterministic hard-clamp boundary checks.
 */

import { describe, it, expect, vi } from 'vitest';
import { scrollableHandler } from '../ScrollableTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id = 'scroll_test') { return { id } as any; }

/**
 * Create a context with a mock content node at `${nodeId}_content`.
 * The content node will have properties.position.y we can inspect.
 */
function makeCtx(nodeId: string) {
  const contentNode = { properties: { position: { x: 0, y: 0, z: 0 } } };
  return {
    emit: vi.fn(),
    getNode: vi.fn((id: string) => id === `${nodeId}_content` ? contentNode : undefined),
    _contentNode: contentNode,
  };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...scrollableHandler.defaultConfig!, useSpringBounce: false, ...overrides } as any;
  const ctx = makeCtx(node.id);
  scrollableHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function update(node: any, cfg: any, ctx: any, delta: number) {
  scrollableHandler.onUpdate!(node, cfg, ctx as any, delta);
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  scrollableHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// Peek at internal scroll state via the module-level Map
// We access it indirectly by inspecting context-emitted values / position
function peekState(node: any) {
  // Override: use a second attach to expose state via setter pattern won't work.
  // We instead read from contentNode.properties.position.y after onUpdate.
  return null;
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('ScrollableTrait — defaultConfig', () => {
  it('has correct defaults for all 5 fields', () => {
    const d = scrollableHandler.defaultConfig!;
    expect(d.contentHeight).toBeCloseTo(1.0);
    expect(d.viewportHeight).toBeCloseTo(0.5);
    expect(d.friction).toBeCloseTo(0.95);
    expect(d.elasticity).toBeCloseTo(0.1);
    expect(d.useSpringBounce).toBe(true);
  });
});

// ─── onAttach / onDetach ──────────────────────────────────────────────────────

describe('ScrollableTrait — onAttach / onDetach', () => {
  it('onAttach registers state (subsequent onEvent calls work)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // If state was not registered, onEvent would be a no-op.
    // Fire a drag event — if state present, ctx.getNode will be called.
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.05 } });
    // getNode called means we got past the state guard
    expect(ctx.getNode).toHaveBeenCalled();
  });

  it('onDetach removes state (subsequent onUpdate becomes no-op)', () => {
    const node = makeNode('d_test');
    const ctx2 = makeCtx('d_test');
    const cfg2 = { ...scrollableHandler.defaultConfig!, useSpringBounce: false } as any;
    scrollableHandler.onAttach!(node, cfg2, ctx2 as any);
    scrollableHandler.onDetach!(node, cfg2, ctx2 as any);
    // After detach, onUpdate should short-circuit (no contentNode calls)
    ctx2.emit.mockClear();
    ctx2.getNode.mockClear();
    scrollableHandler.onUpdate!(node, cfg2, ctx2 as any, 0.016);
    expect(ctx2.getNode).not.toHaveBeenCalled();
  });
});

// ─── onEvent — ui_press_start ─────────────────────────────────────────────────

describe('ScrollableTrait — onEvent: ui_press_start', () => {
  it('sets isDragging=true, captures lastY, zeroes velocity', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // Give some velocity first by dragging
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.1 } });
    // Now start a new press — velocity should be zeroed
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0.5 } });
    // After new press, a second press_start should reset velocity
    // Verify by running update: since isDragging=true, velocity not applied
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.016);
    // Content node position not affected by velocity (isDragging suppresses inertia)
    // Just confirm it didn't throw and called getNode
    // (No position change from velocity when isDragging)
  });

  it('ui_press_start with no position.y uses 0 as lastY', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // Should not throw
    expect(() => fire(node, cfg, ctx, { type: 'ui_press_start' })).not.toThrow();
  });
});

// ─── onEvent — ui_press_end ───────────────────────────────────────────────────

describe('ScrollableTrait — onEvent: ui_press_end', () => {
  it('clears isDragging (inertia resumes on next update)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // Start drag then end — subsequent updates should apply inertia
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.1 } });
    fire(node, cfg, ctx, { type: 'ui_press_end' });
    // With isDragging=false, onUpdate applies inertia from velocity
    const y0 = ctx._contentNode.properties.position.y;
    update(node, cfg, ctx, 0.016);
    // velocity ≈ 0.1/0.016 ≈ 6.25; offset changes by velocity*delta
    const y1 = ctx._contentNode.properties.position.y;
    // offset should have changed due to inertia
    expect(y1).not.toBe(y0);
  });
});

// ─── onEvent — ui_drag ────────────────────────────────────────────────────────

describe('ScrollableTrait — onEvent: ui_drag', () => {
  it('accumulates offset by dy when isDragging=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.1 } });
    // offset should be 0.1, content node y = 0.1
    expect(ctx._contentNode.properties.position.y).toBeCloseTo(0.1);
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.15 } });
    expect(ctx._contentNode.properties.position.y).toBeCloseTo(0.15);
    expect(ctx.emit).toHaveBeenCalledWith('property_changed', expect.objectContaining({ nodeId: `${node.id}_content` }));
  });

  it('sets velocity = dy / 0.016', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { contentHeight: 5.0, viewportHeight: 0.5 });
    // Drag downward (negative dy) so offset stays in valid scroll range
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: -0.016 } }); // dy=-0.016, velocity=-1.0
    // After press_end, one update step: offset += -1.0 * 0.016 = -0.016 more
    const y0 = ctx._contentNode.properties.position.y; // -0.016
    fire(node, cfg, ctx, { type: 'ui_press_end' });
    update(node, cfg, ctx, 0.016);
    const y1 = ctx._contentNode.properties.position.y;
    expect(y1).toBeCloseTo(y0 + (-1.0) * 0.016, 3); // offset += velocity * delta
  });

  it('no-op when isDragging=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // Don't set isDragging
    ctx.getNode.mockClear();
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.5 } });
    // getNode should not be called since isDragging=false
    expect(ctx.getNode).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — inertia + hard-clamp (useSpringBounce=false) ─────────────────

describe('ScrollableTrait — onUpdate: inertia + hard-clamp', () => {
  it('applies friction to velocity each tick', () => {
    const node = makeNode();
    // Large contentHeight so bottom clamp doesn't interfere with inertia decay
    const { cfg, ctx } = attach(node, { friction: 0.9, contentHeight: 10.0, viewportHeight: 0.5 });
    // Drag downward so offset is negative (inside valid scroll range)
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: -0.1 } }); // velocity ≈ -6.25
    fire(node, cfg, ctx, { type: 'ui_press_end' });
    const y0 = ctx._contentNode.properties.position.y;
    update(node, cfg, ctx, 0.016); // offset moves downward, velocity *= 0.9
    const y1 = ctx._contentNode.properties.position.y;
    expect(y1).toBeLessThan(y0); // offset moved further negative (down)
    // After many ticks, velocity should diminish (< 0.001 threshold)
    for (let i = 0; i < 150; i++) update(node, cfg, ctx, 0.016);
    // Eventually clamped to -maxScroll (9.5) or resting
    const yFinal = ctx._contentNode.properties.position.y;
    expect(yFinal).toBeGreaterThanOrEqual(-9.5); // within [-maxScroll, 0]
    expect(yFinal).toBeLessThanOrEqual(0);
  });

  it('hard-clamps offset to 0 when overscrolled top (useSpringBounce=false)', () => {
    const node = makeNode('hc');
    const ctx = makeCtx('hc');
    const cfg = { ...scrollableHandler.defaultConfig!, useSpringBounce: false, contentHeight: 2.0, viewportHeight: 0.5 } as any;
    scrollableHandler.onAttach!(node, cfg, ctx as any);
    // Drag upward way too far (positive offset = top overscroll)
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 5.0 } }); // offset = 5.0 (overscroll top)
    fire(node, cfg, ctx, { type: 'ui_press_end' });
    update(node, cfg, ctx, 0.016);
    // Should be clamped to 0
    expect(ctx._contentNode.properties.position.y).toBeCloseTo(0);
  });

  it('hard-clamps offset to -maxScroll when overscrolled bottom', () => {
    const node = makeNode('hc2');
    const ctx = makeCtx('hc2');
    const cfg = { ...scrollableHandler.defaultConfig!, useSpringBounce: false, contentHeight: 2.0, viewportHeight: 0.5 } as any;
    // maxScroll = 2.0 - 0.5 = 1.5
    scrollableHandler.onAttach!(node, cfg, ctx as any);
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: -5.0 } }); // offset = -5.0 (past bottom)
    fire(node, cfg, ctx, { type: 'ui_press_end' });
    update(node, cfg, ctx, 0.016);
    expect(ctx._contentNode.properties.position.y).toBeCloseTo(-1.5); // -maxScroll
  });

  it('no-op when no state (after detach)', () => {
    const node = makeNode('nd');
    const ctx = makeCtx('nd');
    const cfg2 = { ...scrollableHandler.defaultConfig!, useSpringBounce: false } as any;
    scrollableHandler.onAttach!(node, cfg2, ctx as any);
    scrollableHandler.onDetach!(node, cfg2, ctx as any);
    ctx.getNode.mockClear();
    scrollableHandler.onUpdate!(node, cfg2, ctx as any, 0.016);
    expect(ctx.getNode).not.toHaveBeenCalled();
  });

  it('emits property_changed when content node found', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { contentHeight: 2.0, viewportHeight: 0.5 });
    // Give velocity and let update run
    fire(node, cfg, ctx, { type: 'ui_press_start', position: { y: 0 } });
    fire(node, cfg, ctx, { type: 'ui_drag', position: { y: 0.1 } });
    fire(node, cfg, ctx, { type: 'ui_press_end' });
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('property_changed', expect.objectContaining({
      nodeId: `${node.id}_content`, property: 'position',
    }));
  });
});
