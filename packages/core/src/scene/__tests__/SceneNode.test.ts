/**
 * SceneNode Unit Tests
 *
 * Tests hierarchical transform, parent/child management,
 * dirty propagation, world matrix computation, tags, and traversal.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneNode } from '../SceneNode';

describe('SceneNode', () => {
  let root: SceneNode;

  beforeEach(() => {
    root = new SceneNode('root', 'Root');
  });

  describe('construction', () => {
    it('should assign id and name', () => {
      expect(root.id).toBe('root');
      expect(root.name).toBe('Root');
    });

    it('should default name to id', () => {
      const n = new SceneNode('foo');
      expect(n.name).toBe('foo');
    });

    it('should start with identity local transform', () => {
      const t = root.getLocalTransform();
      expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
    });
  });

  describe('transforms', () => {
    it('should set and get position', () => {
      root.setPosition(1, 2, 3);
      const t = root.getLocalTransform();
      expect(t.position).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should set rotation', () => {
      root.setRotation(45, 90, 0);
      expect(root.getLocalTransform().rotation).toEqual({ x: 45, y: 90, z: 0 });
    });

    it('should set scale', () => {
      root.setScale(2, 3, 4);
      expect(root.getLocalTransform().scale).toEqual({ x: 2, y: 3, z: 4 });
    });

    it('should return world position matching local for root', () => {
      root.setPosition(5, 10, 15);
      const wp = root.getWorldPosition();
      expect(wp).toEqual({ x: 5, y: 10, z: 15 });
    });

    it('should compose parent translation into world position', () => {
      root.setPosition(10, 0, 0);
      const child = new SceneNode('child');
      child.setPosition(5, 0, 0);
      root.addChild(child);

      const wp = child.getWorldPosition();
      expect(wp.x).toBeCloseTo(15);
    });
  });

  describe('hierarchy', () => {
    it('should add children', () => {
      const a = new SceneNode('a');
      const b = new SceneNode('b');
      root.addChild(a);
      root.addChild(b);
      expect(root.getChildCount()).toBe(2);
      expect(root.getChildren().map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('should remove children', () => {
      const a = new SceneNode('a');
      root.addChild(a);
      root.removeChild(a);
      expect(root.getChildCount()).toBe(0);
      expect(a.getParent()).toBeNull();
    });

    it('should re-parent when addChild is called on different parent', () => {
      const p1 = new SceneNode('p1');
      const p2 = new SceneNode('p2');
      const child = new SceneNode('child');
      p1.addChild(child);
      expect(p1.getChildCount()).toBe(1);

      p2.addChild(child);
      expect(p1.getChildCount()).toBe(0);
      expect(p2.getChildCount()).toBe(1);
      expect(child.getParent()?.id).toBe('p2');
    });

    it('should track parent', () => {
      const child = new SceneNode('child');
      root.addChild(child);
      expect(child.getParent()?.id).toBe('root');
    });
  });

  describe('traversal', () => {
    it('should depth-first traverse', () => {
      const a = new SceneNode('a');
      const b = new SceneNode('b');
      const c = new SceneNode('c');
      root.addChild(a);
      root.addChild(b);
      a.addChild(c);

      const visited: string[] = [];
      root.traverse((node) => visited.push(node.id));
      expect(visited).toEqual(['root', 'a', 'c', 'b']);
    });

    it('should pass depth to callback', () => {
      const child = new SceneNode('child');
      root.addChild(child);
      const depths: number[] = [];
      root.traverse((_n, d) => depths.push(d));
      expect(depths).toEqual([0, 1]);
    });
  });

  describe('tags and layers', () => {
    it('should store tags', () => {
      root.tags.add('player');
      root.tags.add('enemy');
      expect(root.tags.has('player')).toBe(true);
      expect(root.tags.size).toBe(2);
    });

    it('should default layer to 0', () => {
      expect(root.layer).toBe(0);
    });

    it('should allow setting layer', () => {
      root.layer = 5;
      expect(root.layer).toBe(5);
    });
  });

  describe('dirty propagation', () => {
    it('should mark children dirty when parent transforms', () => {
      const child = new SceneNode('child');
      root.addChild(child);
      // Force clean
      child.getWorldPosition();
      expect(child.isDirty()).toBe(false);

      root.setPosition(1, 0, 0);
      expect(child.isDirty()).toBe(true);
    });
  });

  describe('world matrix', () => {
    it('should return Float64Array of length 16', () => {
      const m = root.getWorldMatrix();
      expect(m).toBeInstanceOf(Float64Array);
      expect(m.length).toBe(16);
    });
  });
});
