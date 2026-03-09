/**
 * UILayoutEngine Production Tests
 *
 * Flexbox layout: createNode, addChild, compute (row/column/alignment/justify),
 * resolveSize modes, gap, flexGrow, padding, margins.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UILayoutEngine, createDefaultLayout } from '../UILayout';

describe('UILayoutEngine — Production', () => {
  let engine: UILayoutEngine;

  beforeEach(() => {
    engine = new UILayoutEngine();
  });

  describe('createDefaultLayout', () => {
    it('returns column direction', () => {
      const layout = createDefaultLayout();
      expect(layout.direction).toBe('column');
      expect(layout.width).toBe(100);
      expect(layout.height).toBe(30);
      expect(layout.gap).toBe(0);
    });
  });

  describe('createNode', () => {
    it('creates node with defaults', () => {
      const node = engine.createNode();
      expect(node.id).toContain('layout_');
      expect(node.config.direction).toBe('column');
      expect(node.children).toEqual([]);
      expect(node.result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it('merges custom config', () => {
      const node = engine.createNode({ direction: 'row', gap: 10 });
      expect(node.config.direction).toBe('row');
      expect(node.config.gap).toBe(10);
    });
  });

  describe('addChild', () => {
    it('adds child to parent', () => {
      const parent = engine.createNode();
      const child = engine.createNode();
      engine.addChild(parent, child);
      expect(parent.children).toContain(child);
    });
  });

  describe('compute — column layout', () => {
    it('positions children vertically', () => {
      const root = engine.createNode({ direction: 'column', width: 200, height: 200 });
      const c1 = engine.createNode({ width: 200, height: 50 });
      const c2 = engine.createNode({ width: 200, height: 50 });
      engine.addChild(root, c1);
      engine.addChild(root, c2);

      engine.compute(root, 400, 400);
      expect(c1.result.y).toBe(0);
      expect(c2.result.y).toBe(50); // after c1
    });
  });

  describe('compute — row layout', () => {
    it('positions children horizontally', () => {
      const root = engine.createNode({ direction: 'row', width: 400, height: 100 });
      const c1 = engine.createNode({ width: 100, height: 100 });
      const c2 = engine.createNode({ width: 100, height: 100 });
      engine.addChild(root, c1);
      engine.addChild(root, c2);

      engine.compute(root, 800, 600);
      expect(c1.result.x).toBe(0);
      expect(c2.result.x).toBe(100);
    });
  });

  describe('compute — gap', () => {
    it('adds gap between children', () => {
      const root = engine.createNode({ direction: 'column', width: 200, height: 200, gap: 10 });
      const c1 = engine.createNode({ width: 200, height: 50 });
      const c2 = engine.createNode({ width: 200, height: 50 });
      engine.addChild(root, c1);
      engine.addChild(root, c2);

      engine.compute(root, 400, 400);
      expect(c2.result.y).toBe(60); // 50 + 10 gap
    });
  });

  describe('compute — padding', () => {
    it('offsets children by padding', () => {
      const root = engine.createNode({
        direction: 'column',
        width: 200,
        height: 200,
        padding: { top: 20, right: 0, bottom: 0, left: 30 },
      });
      const c1 = engine.createNode({ width: 100, height: 50 });
      engine.addChild(root, c1);

      engine.compute(root, 400, 400);
      expect(c1.result.x).toBe(30);
      expect(c1.result.y).toBe(20);
    });
  });

  describe('compute — justify center', () => {
    it('centers children on main axis', () => {
      const root = engine.createNode({
        direction: 'column',
        width: 200,
        height: 200,
        justifyContent: 'center',
      });
      const c1 = engine.createNode({ width: 200, height: 50 });
      engine.addChild(root, c1);

      engine.compute(root, 400, 400);
      expect(c1.result.y).toBe(75); // (200-50)/2
    });
  });

  describe('compute — flexGrow', () => {
    it('distributes extra space', () => {
      const root = engine.createNode({ direction: 'column', width: 200, height: 200 });
      const c1 = engine.createNode({ width: 200, height: 50, flexGrow: 1 });
      const c2 = engine.createNode({ width: 200, height: 50, flexGrow: 1 });
      engine.addChild(root, c1);
      engine.addChild(root, c2);

      engine.compute(root, 400, 400);
      // 200 - 100 = 100 free, split 50/50
      expect(c1.result.height).toBe(100);
      expect(c2.result.height).toBe(100);
    });
  });

  describe('compute — fill size mode', () => {
    it('fills container', () => {
      const root = engine.createNode({ direction: 'column', width: 400, height: 400 });
      const c1 = engine.createNode({ widthMode: 'fill', height: 50 });
      engine.addChild(root, c1);

      engine.compute(root, 800, 600);
      expect(c1.result.width).toBe(400);
    });
  });
});
