import { describe, it, expect, beforeEach } from 'vitest';
import { TransformGraph } from '../TransformGraph';

describe('TransformGraph', () => {
  let graph: TransformGraph;

  beforeEach(() => {
    graph = new TransformGraph();
  });

  // =========== Node Management ===========

  it('addNode increases count', () => {
    graph.addNode('a');
    graph.addNode('b');
    expect(graph.getNodeCount()).toBe(2);
  });

  it('addNode initialises default position and scale', () => {
    graph.addNode('n');
    const t = graph.getLocalTransform('n');
    expect(t).toEqual({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 });
  });

  it('addNode accepts partial local override', () => {
    graph.addNode('n', { x: 5, sy: 2 });
    const t = graph.getLocalTransform('n')!;
    expect(t.x).toBe(5);
    expect(t.sy).toBe(2);
    expect(t.y).toBe(0);
    expect(t.sx).toBe(1);
  });

  it('removeNode decreases count', () => {
    graph.addNode('a');
    graph.addNode('b');
    graph.removeNode('a');
    expect(graph.getNodeCount()).toBe(1);
  });

  it('removeNode is no-op for unknown id', () => {
    graph.addNode('a');
    graph.removeNode('nope');
    expect(graph.getNodeCount()).toBe(1);
  });

  it('removeNode unparents children', () => {
    graph.addNode('parent');
    graph.addNode('child');
    graph.setParent('child', 'parent');
    graph.removeNode('parent');
    expect(graph.getParent('child')).toBeNull();
  });

  it('removeNode removes from parent children list', () => {
    graph.addNode('parent');
    graph.addNode('child');
    graph.setParent('child', 'parent');
    graph.removeNode('child');
    expect(graph.getChildren('parent')).toHaveLength(0);
  });

  // =========== Hierarchy ===========

  it('setParent establishes parent-child link', () => {
    graph.addNode('p');
    graph.addNode('c');
    graph.setParent('c', 'p');
    expect(graph.getParent('c')).toBe('p');
    expect(graph.getChildren('p')).toContain('c');
  });

  it('setParent removes from old parent when reparenting', () => {
    graph.addNode('p1');
    graph.addNode('p2');
    graph.addNode('c');
    graph.setParent('c', 'p1');
    graph.setParent('c', 'p2');
    expect(graph.getChildren('p1')).toHaveLength(0);
    expect(graph.getChildren('p2')).toContain('c');
    expect(graph.getParent('c')).toBe('p2');
  });

  it('setParent to null detaches', () => {
    graph.addNode('p');
    graph.addNode('c');
    graph.setParent('c', 'p');
    graph.setParent('c', null);
    expect(graph.getParent('c')).toBeNull();
    expect(graph.getChildren('p')).toHaveLength(0);
  });

  // =========== Transforms ===========

  it('setPosition updates local transform', () => {
    graph.addNode('n');
    graph.setPosition('n', 3, 4, 5);
    const t = graph.getLocalTransform('n')!;
    expect(t.x).toBe(3);
    expect(t.y).toBe(4);
    expect(t.z).toBe(5);
  });

  it('setScale updates local transform', () => {
    graph.addNode('n');
    graph.setScale('n', 2, 3, 4);
    const t = graph.getLocalTransform('n')!;
    expect(t.sx).toBe(2);
    expect(t.sy).toBe(3);
    expect(t.sz).toBe(4);
  });

  it('getLocalTransform returns null for missing node', () => {
    expect(graph.getLocalTransform('missing')).toBeNull();
  });

  // =========== World Position ===========

  it('root world position equals local position', () => {
    graph.addNode('r', { x: 1, y: 2, z: 3 });
    const wp = graph.getWorldPosition('r')!;
    expect(wp).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('child world position accounts for parent position', () => {
    graph.addNode('parent', { x: 10, y: 0, z: 0 });
    graph.addNode('child', { x: 5, y: 0, z: 0 });
    graph.setParent('child', 'parent');
    const wp = graph.getWorldPosition('child')!;
    expect(wp.x).toBe(15); // 10 + 5*1
  });

  it('child world position respects parent scale', () => {
    graph.addNode('parent', { x: 0, y: 0, z: 0, sx: 2, sy: 3, sz: 4 });
    graph.addNode('child', { x: 1, y: 1, z: 1 });
    graph.setParent('child', 'parent');
    const wp = graph.getWorldPosition('child')!;
    expect(wp.x).toBe(2);  // 0 + 1*2
    expect(wp.y).toBe(3);  // 0 + 1*3
    expect(wp.z).toBe(4);  // 0 + 1*4
  });

  it('three-level hierarchy accumulates positions', () => {
    graph.addNode('a', { x: 1, y: 0, z: 0 });
    graph.addNode('b', { x: 2, y: 0, z: 0 });
    graph.addNode('c', { x: 3, y: 0, z: 0 });
    graph.setParent('b', 'a');
    graph.setParent('c', 'b');
    const wp = graph.getWorldPosition('c')!;
    // a.world=1, b.world=1+(2*1)=3, c.world=3+(3*1)=6
    expect(wp.x).toBe(6);
  });

  it('getWorldPosition returns null for missing node', () => {
    expect(graph.getWorldPosition('missing')).toBeNull();
  });

  // =========== Dirty Propagation ===========

  it('setPosition marks node and descendants dirty', () => {
    graph.addNode('p');
    graph.addNode('c');
    graph.setParent('c', 'p');
    // Force initial update
    graph.getWorldPosition('c');
    // Now mutate parent
    graph.setPosition('p', 100, 0, 0);
    // Child should reflect new parent position
    const wp = graph.getWorldPosition('c')!;
    expect(wp.x).toBe(100);
  });

  it('setScale propagates dirty to children', () => {
    graph.addNode('p');
    graph.addNode('c', { x: 10, y: 0, z: 0 });
    graph.setParent('c', 'p');
    graph.getWorldPosition('c'); // update
    graph.setScale('p', 3, 1, 1);
    const wp = graph.getWorldPosition('c')!;
    expect(wp.x).toBe(30); // 0 + 10*3
  });

  // =========== Batch Update ===========

  it('updateAll resolves all dirty nodes', () => {
    graph.addNode('a', { x: 1, y: 0, z: 0 });
    graph.addNode('b', { x: 2, y: 0, z: 0 });
    graph.addNode('c', { x: 3, y: 0, z: 0 });
    graph.setParent('b', 'a');
    graph.setParent('c', 'b');
    graph.updateAll();
    // After batch update, getWorldPosition should return correct values
    const wp = graph.getWorldPosition('c')!;
    expect(wp.x).toBe(6);
  });

  // =========== Queries ===========

  it('getRoots returns only root nodes', () => {
    graph.addNode('root1');
    graph.addNode('root2');
    graph.addNode('child');
    graph.setParent('child', 'root1');
    const roots = graph.getRoots();
    expect(roots).toContain('root1');
    expect(roots).toContain('root2');
    expect(roots).not.toContain('child');
  });

  it('getChildren returns empty for leaf', () => {
    graph.addNode('leaf');
    expect(graph.getChildren('leaf')).toHaveLength(0);
  });

  it('getChildren returns empty for unknown node', () => {
    expect(graph.getChildren('nope')).toHaveLength(0);
  });

  it('getParent returns null for unknown node', () => {
    expect(graph.getParent('nope')).toBeNull();
  });
});
