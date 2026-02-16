import { describe, it, expect, beforeEach } from 'vitest';
import { UIRenderer } from '../ui/UIRenderer';

// =============================================================================
// C271 — UI Renderer
// =============================================================================

describe('UIRenderer', () => {
  let renderer: UIRenderer;
  beforeEach(() => { renderer = new UIRenderer(); });

  it('constructor creates root node', () => {
    expect(renderer.getRoot()).toBeDefined();
    expect(renderer.getRoot().type).toBe('container');
  });

  it('createNode returns node with defaults', () => {
    const btn = renderer.createNode('button');
    expect(btn.interactive).toBe(true);
    expect(btn.focusable).toBe(true);
  });

  it('container and text are not interactive', () => {
    const c = renderer.createNode('container');
    const t = renderer.createNode('text');
    expect(c.interactive).toBe(false);
    expect(t.interactive).toBe(false);
  });

  it('addChild sets parent-child relationship', () => {
    const parent = renderer.createNode('container');
    const child = renderer.createNode('button');
    renderer.addChild(parent, child);
    expect(parent.children).toContain(child);
    expect(child.parent).toBe(parent);
  });

  it('removeChild detaches', () => {
    const parent = renderer.createNode('container');
    const child = renderer.createNode('button');
    renderer.addChild(parent, child);
    renderer.removeChild(parent, child);
    expect(parent.children).not.toContain(child);
    expect(child.parent).toBeNull();
  });

  it('removeNode cleans up from map', () => {
    const node = renderer.createNode('button');
    renderer.addChild(renderer.getRoot(), node);
    expect(renderer.removeNode(node.id)).toBe(true);
    expect(renderer.getNode(node.id)).toBeUndefined();
  });

  it('findByTag locates tagged node', () => {
    const btn = renderer.createNode('button', 'startBtn');
    renderer.addChild(renderer.getRoot(), btn);
    expect(renderer.findByTag('startBtn')?.id).toBe(btn.id);
  });

  it('hitTest returns interactive node at coordinates', () => {
    const btn = renderer.createNode('button');
    btn.rect = { x: 50, y: 50, width: 100, height: 40 };
    renderer.addChild(renderer.getRoot(), btn);
    const hit = renderer.hitTest(60, 60);
    expect(hit).not.toBeNull();
    expect(hit!.node.id).toBe(btn.id);
  });

  it('hitTest returns null for miss', () => {
    expect(renderer.hitTest(9999, 9999)).toBeNull();
  });

  it('hitTest skips invisible nodes', () => {
    const btn = renderer.createNode('button');
    btn.rect = { x: 0, y: 0, width: 100, height: 100 };
    btn.style.visible = false;
    renderer.addChild(renderer.getRoot(), btn);
    expect(renderer.hitTest(50, 50)).toBeNull();
  });

  it('setFocus and getFocusedNode', () => {
    const btn = renderer.createNode('button');
    renderer.addChild(renderer.getRoot(), btn);
    expect(renderer.setFocus(btn.id)).toBe(true);
    expect(renderer.getFocusedNode()?.id).toBe(btn.id);
  });

  it('setFocus rejects non-focusable node', () => {
    const container = renderer.createNode('container');
    renderer.addChild(renderer.getRoot(), container);
    expect(renderer.setFocus(container.id)).toBe(false);
  });

  it('focusNext cycles through focusable nodes', () => {
    const b1 = renderer.createNode('button');
    const b2 = renderer.createNode('button');
    renderer.addChild(renderer.getRoot(), b1);
    renderer.addChild(renderer.getRoot(), b2);
    const first = renderer.focusNext();
    expect(first).not.toBeNull();
    const second = renderer.focusNext();
    expect(second).not.toBeNull();
    expect(first!.id).not.toBe(second!.id);
  });

  it('dirty tracking marks and clears', () => {
    renderer.markDirty('abc');
    expect(renderer.getDirtyNodes()).toContain('abc');
    renderer.clearDirty();
    expect(renderer.getDirtyNodes()).toHaveLength(0);
  });
});
