/**
 * SceneQuery Unit Tests
 *
 * Tests tag/layer/name filtering, spatial radius queries,
 * frustum culling, and visitor pattern.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneNode } from '../SceneNode';
import { SceneQuery } from '../SceneQuery';

describe('SceneQuery', () => {
  let root: SceneNode;
  let a: SceneNode;
  let b: SceneNode;
  let c: SceneNode;

  beforeEach(() => {
    root = new SceneNode('root', 'Root');
    a = new SceneNode('a', 'Alpha');
    b = new SceneNode('b', 'Beta');
    c = new SceneNode('c', 'Charlie');

    root.addChild(a);
    root.addChild(b);
    a.addChild(c);

    a.tags.add('player');
    b.tags.add('enemy');
    c.tags.add('player');
    b.layer = 2;
  });

  describe('findByTag', () => {
    it('should find all nodes with a given tag', () => {
      const result = SceneQuery.findByTag(root, 'player');
      expect(result.map((n) => n.id)).toEqual(['a', 'c']);
    });

    it('should return empty for non-existent tag', () => {
      expect(SceneQuery.findByTag(root, 'nope')).toEqual([]);
    });
  });

  describe('findByLayer', () => {
    it('should find nodes on a specific layer', () => {
      const result = SceneQuery.findByLayer(root, 2);
      expect(result.map((n) => n.id)).toEqual(['b']);
    });

    it('should return default layer 0 nodes', () => {
      const result = SceneQuery.findByLayer(root, 0);
      expect(result.length).toBeGreaterThanOrEqual(2); // root, a, c
    });
  });

  describe('findByName', () => {
    it('should find node by exact name', () => {
      const found = SceneQuery.findByName(root, 'Beta');
      expect(found?.id).toBe('b');
    });

    it('should return null for unknown name', () => {
      expect(SceneQuery.findByName(root, 'Missing')).toBeNull();
    });
  });

  describe('findInRadius', () => {
    it('should find nodes within radius of center', () => {
      a.setPosition(1, 0, 0);
      b.setPosition(100, 0, 0);

      const nearby = SceneQuery.findInRadius(root, { x: 0, y: 0, z: 0 }, 5);
      const ids = nearby.map((n) => n.id);
      expect(ids).toContain('root');
      expect(ids).toContain('a');
      expect(ids).not.toContain('b');
    });
  });

  describe('frustumCull', () => {
    it('should cull nodes outside the frustum', () => {
      a.setPosition(0, 0, 5); // ahead
      b.setPosition(100, 0, 0); // far to the side

      const result = SceneQuery.frustumCull(root, {
        position: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 1 },
        fov: 90,
        near: 1,
        far: 50,
      });

      const ids = result.map((n) => n.id);
      expect(ids).toContain('a');
      expect(ids).not.toContain('b');
    });

    it('should skip invisible nodes', () => {
      a.setPosition(0, 0, 5);
      a.visible = false;

      const result = SceneQuery.frustumCull(root, {
        position: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 1 },
        fov: 90,
        near: 1,
        far: 50,
      });

      expect(result.map((n) => n.id)).not.toContain('a');
    });
  });

  describe('visit', () => {
    it('should visit nodes in breadth-first order', () => {
      const visited: string[] = [];
      SceneQuery.visit(root, (node) => {
        visited.push(node.id);
        return true;
      });
      expect(visited).toEqual(['root', 'a', 'b', 'c']);
    });

    it('should stop when visitor returns false', () => {
      const visited: string[] = [];
      SceneQuery.visit(root, (node) => {
        visited.push(node.id);
        return node.id !== 'a';
      });
      expect(visited).toEqual(['root', 'a']);
    });
  });
});
