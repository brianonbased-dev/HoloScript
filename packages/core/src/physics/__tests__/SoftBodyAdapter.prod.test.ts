/**
 * SoftBodyAdapter.prod.test.ts
 *
 * Production tests for SoftBodyAdapter — mesh-to-particle conversion,
 * solver creation, update loop, and syncBackToMesh.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SoftBodyAdapter } from '../SoftBodyAdapter';

/**
 * Create a minimal mock node with a simple 4-vertex geometry.
 */
function makeMockNode(opts: { vertices?: number[] } = {}) {
  const vertices = opts.vertices ?? [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ];
  return {
    geometry: {
      vertices: [...vertices],
      needsUpdate: false,
    },
  };
}

describe('SoftBodyAdapter', () => {
  let node: ReturnType<typeof makeMockNode>;

  beforeEach(() => {
    node = makeMockNode();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('constructor()', () => {
    it('constructs without throwing', () => {
      expect(() => new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 })).not.toThrow();
    });

    it('works with a node that has no geometry', () => {
      const emptyNode = { geometry: null };
      expect(() => new SoftBodyAdapter(emptyNode, { mass: 1, stiffness: 0.5 })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('runs without throwing', () => {
      const adapter = new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 });
      expect(() => adapter.update(0.016)).not.toThrow();
    });

    it('vertex array length is preserved after multiple updates', () => {
      const adapter = new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 });
      const origLen = node.geometry.vertices.length;
      for (let i = 0; i < 30; i++) adapter.update(0.016);
      expect(node.geometry.vertices.length).toBe(origLen);
    });

    it('sets geometry.needsUpdate=true after update', () => {
      const adapter = new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 });
      adapter.update(0.016);
      expect(node.geometry.needsUpdate).toBe(true);
    });

    it('handles dt=0 without crashing', () => {
      const adapter = new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 });
      expect(() => adapter.update(0)).not.toThrow();
    });

    it('handles large dt without crashing', () => {
      const adapter = new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 });
      expect(() => adapter.update(5)).not.toThrow();
    });

    it('works with a single-vertex mesh', () => {
      const singleVertex = makeMockNode({ vertices: [0, 0, 0] });
      const adapter = new SoftBodyAdapter(singleVertex, { mass: 1, stiffness: 0.5 });
      expect(() => adapter.update(0.016)).not.toThrow();
    });
  });
});
