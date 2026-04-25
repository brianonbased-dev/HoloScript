import { describe, it, expect, beforeEach } from 'vitest';
import { UILayoutEngine, createDefaultLayout } from '../ui/UILayout';

// =============================================================================
// C242 — UI Layout Engine
// =============================================================================

describe('UILayoutEngine', () => {
  let engine: UILayoutEngine;
  beforeEach(() => {
    engine = new UILayoutEngine();
  });

  it('createNode returns node with defaults', () => {
    const node = engine.createNode();
    expect(node.id).toBeDefined();
    expect(node.config.direction).toBe('column');
    expect(node.children).toHaveLength(0);
  });

  it('addChild adds to parent', () => {
    const parent = engine.createNode();
    const child = engine.createNode();
    engine.addChild(parent, child);
    expect(parent.children).toHaveLength(1);
  });

  it('compute sets root size from fixed config', () => {
    const root = engine.createNode({
      width: 200,
      height: 100,
      widthMode: 'fixed',
      heightMode: 'fixed',
    });
    engine.compute(root, 800, 600);
    expect(root.result.width).toBe(200);
    expect(root.result.height).toBe(100);
  });

  it('compute fill mode fills container', () => {
    const root = engine.createNode({ widthMode: 'fill', heightMode: 'fill' });
    engine.compute(root, 800, 600);
    expect(root.result.width).toBe(800);
    expect(root.result.height).toBe(600);
  });

  it('compute percent mode calculates correctly', () => {
    const root = engine.createNode({
      widthMode: 'percent',
      width: 50,
      heightMode: 'percent',
      height: 25,
    });
    engine.compute(root, 800, 400);
    expect(root.result.width).toBe(400);
    expect(root.result.height).toBe(100);
  });

  it('column layout stacks children vertically', () => {
    const root = engine.createNode({ direction: 'column', width: 200, height: 200 });
    const c1 = engine.createNode({ width: 200, height: 50 });
    const c2 = engine.createNode({ width: 200, height: 50 });
    engine.addChild(root, c1);
    engine.addChild(root, c2);
    engine.compute(root, 800, 600);
    expect(c1.result[1]).toBe(0);
    expect(c2.result[1]).toBe(50);
  });

  it('row layout stacks children horizontally', () => {
    const root = engine.createNode({ direction: 'row', width: 200, height: 100 });
    const c1 = engine.createNode({ width: 80, height: 100 });
    const c2 = engine.createNode({ width: 80, height: 100 });
    engine.addChild(root, c1);
    engine.addChild(root, c2);
    engine.compute(root, 800, 600);
    expect(c1.result[0]).toBe(0);
    expect(c2.result[0]).toBe(80);
  });

  it('gap adds spacing between children', () => {
    const root = engine.createNode({ direction: 'column', width: 200, height: 200, gap: 10 });
    const c1 = engine.createNode({ width: 200, height: 30 });
    const c2 = engine.createNode({ width: 200, height: 30 });
    engine.addChild(root, c1);
    engine.addChild(root, c2);
    engine.compute(root, 800, 600);
    expect(c2.result[1]).toBe(40); // 30 + 10 gap
  });

  it('padding offsets children', () => {
    const root = engine.createNode({
      direction: 'column',
      width: 200,
      height: 200,
      padding: { top: 15, right: 0, bottom: 0, left: 20 },
    });
    const c = engine.createNode({ width: 50, height: 30 });
    engine.addChild(root, c);
    engine.compute(root, 800, 600);
    expect(c.result[0]).toBe(20);
    expect(c.result[1]).toBe(15);
  });

  it('flexGrow distributes extra space', () => {
    const root = engine.createNode({ direction: 'row', width: 300, height: 100 });
    const c1 = engine.createNode({ width: 50, height: 100, flexGrow: 1 });
    const c2 = engine.createNode({ width: 50, height: 100, flexGrow: 1 });
    engine.addChild(root, c1);
    engine.addChild(root, c2);
    engine.compute(root, 800, 600);
    // Free space = 300 - 100 = 200, each gets 100 extra → 150 each
    expect(c1.result.width).toBe(150);
    expect(c2.result.width).toBe(150);
  });

  it('justifyContent center shifts children', () => {
    const root = engine.createNode({
      direction: 'row',
      width: 200,
      height: 100,
      justifyContent: 'center',
    });
    const c = engine.createNode({ width: 50, height: 100 });
    engine.addChild(root, c);
    engine.compute(root, 800, 600);
    // Free space = 150, center → offset = 75
    expect(c.result[0]).toBe(75);
  });

  it('alignItems center centers on cross axis', () => {
    const root = engine.createNode({
      direction: 'row',
      width: 200,
      height: 100,
      alignItems: 'center',
    });
    const c = engine.createNode({ width: 50, height: 30 });
    engine.addChild(root, c);
    engine.compute(root, 800, 600);
    expect(c.result[1]).toBe(35); // (100 - 30) / 2
  });

  it('minWidth clamps node size', () => {
    const root = engine.createNode({ width: 10, height: 10, minWidth: 50 });
    engine.compute(root, 800, 600);
    expect(root.result.width).toBe(50);
  });

  it('createDefaultLayout has expected defaults', () => {
    const d = createDefaultLayout();
    expect(d.direction).toBe('column');
    expect(d.gap).toBe(0);
    expect(d.flexGrow).toBe(0);
  });
});
