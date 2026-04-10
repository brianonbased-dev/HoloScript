/**
 * TransformGraph — production test suite
 *
 * Tests transform hierarchy: node management, parent/child linking,
 * world-position computation, dirty propagation, and batch updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransformGraph } from '../TransformGraph';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('TransformGraph: production', () => {
  let graph: TransformGraph;

  beforeEach(() => {
    graph = new TransformGraph();
  });

  // ─── Node Management ────────────────────────────────────────────────────
  it('starts with zero nodes', () => {
    expect(graph.getNodeCount()).toBe(0);
  });

  it('addNode creates a node', () => {
    graph.addNode('root');
    expect(graph.getNodeCount()).toBe(1);
  });

  it('addNode accepts initial local transform', () => {
    graph.addNode('n', { x: 5, y: 3, z: 1 });
    const local = graph.getLocalTransform('n');
    expect(local).not.toBeNull();
    expect(local!.x).toBe(5);
    expect(local!.y).toBe(3);
    expect(local!.z).toBe(1);
  });

  it('default scale is (1,1,1)', () => {
    graph.addNode('n');
    const local = graph.getLocalTransform('n');
    expect(local!.sx).toBe(1);
    expect(local!.sy).toBe(1);
    expect(local!.sz).toBe(1);
  });

  it('removeNode decrements count', () => {
    graph.addNode('a');
    graph.addNode('b');
    graph.removeNode('a');
    expect(graph.getNodeCount()).toBe(1);
  });

  it('getLocalTransform returns null for unknown node', () => {
    expect(graph.getLocalTransform('ghost')).toBeNull();
  });

  // ─── Hierarchy ──────────────────────────────────────────────────────────
  it('setParent links parent and child', () => {
    graph.addNode('parent');
    graph.addNode('child');
    graph.setParent('child', 'parent');
    expect(graph.getParent('child')).toBe('parent');
    expect(graph.getChildren('parent')).toContain('child');
  });

  it('setParent(null) removes the parent link', () => {
    graph.addNode('p');
    graph.addNode('c');
    graph.setParent('c', 'p');
    graph.setParent('c', null);
    expect(graph.getParent('c')).toBeNull();
    expect(graph.getChildren('p')).not.toContain('c');
  });

  it('getRoots returns only nodes without parents', () => {
    graph.addNode('root1');
    graph.addNode('root2');
    graph.addNode('child');
    graph.setParent('child', 'root1');
    const roots = graph.getRoots();
    expect(roots).toContain('root1');
    expect(roots).toContain('root2');
    expect(roots).not.toContain('child');
  });

  it('removeNode unparents its children', () => {
    graph.addNode('parent');
    graph.addNode('child');
    graph.setParent('child', 'parent');
    graph.removeNode('parent');
    expect(graph.getParent('child')).toBeNull();
  });

  // ─── World Position ──────────────────────────────────────────────────────
  it('root world position equals local position', () => {
    graph.addNode('root', { x: 10, y: 5, z: -3 });
    const wp = graph.getWorldPosition('root');
    expect(wp).not.toBeNull();
    expect(wp!.x).toBe(10);
    expect(wp!.y).toBe(5);
    expect(wp!.z).toBe(-3);
  });

  it('child world position = parent.local + child.local (unit scale)', () => {
    graph.addNode('p', { x: 10, y: 0, z: 0 });
    graph.addNode('c', { x: 5, y: 0, z: 0 });
    graph.setParent('c', 'p');
    graph.updateAll();
    const wp = graph.getWorldPosition('c');
    expect(wp!.x).toBeCloseTo(15);
  });

  it('parent scale multiplies child local offset', () => {
    graph.addNode('p', { x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
    graph.addNode('c', { x: 3, y: 0, z: 0 });
    graph.setParent('c', 'p');
    graph.updateAll();
    const wp = graph.getWorldPosition('c');
    expect(wp!.x).toBeCloseTo(6); // 0 + 3 * 2
  });

  it('getWorldPosition returns null for unknown node', () => {
    expect(graph.getWorldPosition('ghost')).toBeNull();
  });

  // ─── Position / Scale Updates ────────────────────────────────────────────
  it('setPosition updates local transform', () => {
    graph.addNode('n');
    graph.setPosition('n', 7, 8, 9);
    const local = graph.getLocalTransform('n');
    expect(local!.x).toBe(7);
    expect(local!.y).toBe(8);
    expect(local!.z).toBe(9);
  });

  it('setPosition on parent propagates to child world position', () => {
    graph.addNode('p');
    graph.addNode('c', { x: 1, y: 0, z: 0 });
    graph.setParent('c', 'p');
    graph.setPosition('p', 10, 0, 0);
    const wp = graph.getWorldPosition('c');
    expect(wp!.x).toBeCloseTo(11);
  });

  it('setScale updates local scale', () => {
    graph.addNode('n');
    graph.setScale('n', 3, 3, 3);
    const local = graph.getLocalTransform('n');
    expect(local!.sx).toBe(3);
  });

  it('setPosition/setScale are no-ops for unknown node', () => {
    expect(() => graph.setPosition('ghost', 1, 2, 3)).not.toThrow();
    expect(() => graph.setScale('ghost', 1, 1, 1)).not.toThrow();
  });

  // ─── updateAll ───────────────────────────────────────────────────────────
  it('updateAll resolves entire hierarchy', () => {
    graph.addNode('a', { x: 2, y: 0, z: 0 });
    graph.addNode('b', { x: 3, y: 0, z: 0 });
    graph.addNode('c', { x: 4, y: 0, z: 0 });
    graph.setParent('b', 'a');
    graph.setParent('c', 'b');
    graph.updateAll();
    expect(graph.getWorldPosition('c')!.x).toBeCloseTo(9); // 2+3+4
  });

  it('updateAll handles multiple independent roots', () => {
    graph.addNode('r1', { x: 1, y: 0, z: 0 });
    graph.addNode('r2', { x: -1, y: 0, z: 0 });
    graph.updateAll();
    expect(graph.getWorldPosition('r1')!.x).toBe(1);
    expect(graph.getWorldPosition('r2')!.x).toBe(-1);
  });

  // ─── Deep Hierarchy ─────────────────────────────────────────────────────
  it('handles 5-level hierarchy', () => {
    for (let i = 0; i < 5; i++) {
      graph.addNode(`n${i}`, { x: 1, y: 0, z: 0 });
      if (i > 0) graph.setParent(`n${i}`, `n${i - 1}`);
    }
    graph.updateAll();
    expect(graph.getWorldPosition('n4')!.x).toBeCloseTo(5);
  });
});
