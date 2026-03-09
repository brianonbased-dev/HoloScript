import { describe, it, expect, beforeEach } from 'vitest';
import { TransformGraph } from '../spatial/TransformGraph';

// =============================================================================
// C238 — Transform Graph (Spatial Hierarchy)
// =============================================================================

describe('TransformGraph', () => {
  let tg: TransformGraph;
  beforeEach(() => {
    tg = new TransformGraph();
  });

  it('addNode creates with defaults', () => {
    tg.addNode('a');
    expect(tg.getNodeCount()).toBe(1);
    const local = tg.getLocalTransform('a');
    expect(local).toEqual({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 });
  });

  it('addNode with initial position', () => {
    tg.addNode('a', { x: 10, y: 20, z: 30 });
    expect(tg.getLocalTransform('a')!.x).toBe(10);
  });

  it('removeNode removes entry', () => {
    tg.addNode('a');
    tg.removeNode('a');
    expect(tg.getNodeCount()).toBe(0);
    expect(tg.getLocalTransform('a')).toBeNull();
  });

  it('setPosition updates local transform', () => {
    tg.addNode('a');
    tg.setPosition('a', 5, 10, 15);
    const t = tg.getLocalTransform('a')!;
    expect(t.x).toBe(5);
    expect(t.y).toBe(10);
    expect(t.z).toBe(15);
  });

  it('setScale updates local transform', () => {
    tg.addNode('a');
    tg.setScale('a', 2, 3, 4);
    const t = tg.getLocalTransform('a')!;
    expect(t.sx).toBe(2);
    expect(t.sy).toBe(3);
    expect(t.sz).toBe(4);
  });

  it('root node world position equals local', () => {
    tg.addNode('root', { x: 10, y: 20, z: 30 });
    const world = tg.getWorldPosition('root')!;
    expect(world).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('child inherits parent world position', () => {
    tg.addNode('parent', { x: 100, y: 0, z: 0 });
    tg.addNode('child', { x: 10, y: 0, z: 0 });
    tg.setParent('child', 'parent');
    const world = tg.getWorldPosition('child')!;
    // child world = parent.world + child.local * parent.scale
    // = (100,0,0) + (10,0,0) * (1,1,1) = (110,0,0)
    expect(world.x).toBe(110);
  });

  it('parent scale affects child world position', () => {
    tg.addNode('parent', { x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 2 });
    tg.addNode('child', { x: 5, y: 0, z: 0 });
    tg.setParent('child', 'parent');
    const world = tg.getWorldPosition('child')!;
    expect(world.x).toBe(10); // 0 + 5*2
  });

  it('setParent to null unparents', () => {
    tg.addNode('parent');
    tg.addNode('child');
    tg.setParent('child', 'parent');
    tg.setParent('child', null);
    expect(tg.getParent('child')).toBeNull();
    expect(tg.getChildren('parent')).toHaveLength(0);
  });

  it('getChildren and getParent', () => {
    tg.addNode('p');
    tg.addNode('c1');
    tg.addNode('c2');
    tg.setParent('c1', 'p');
    tg.setParent('c2', 'p');
    expect(tg.getChildren('p')).toEqual(['c1', 'c2']);
    expect(tg.getParent('c1')).toBe('p');
  });

  it('removeNode unparents children', () => {
    tg.addNode('parent');
    tg.addNode('child');
    tg.setParent('child', 'parent');
    tg.removeNode('parent');
    expect(tg.getParent('child')).toBeNull();
  });

  it('getRoots returns only root nodes', () => {
    tg.addNode('root1');
    tg.addNode('root2');
    tg.addNode('child');
    tg.setParent('child', 'root1');
    expect(tg.getRoots()).toContain('root1');
    expect(tg.getRoots()).toContain('root2');
    expect(tg.getRoots()).not.toContain('child');
  });

  it('updateAll propagates world transforms', () => {
    tg.addNode('p', { x: 10, y: 0, z: 0 });
    tg.addNode('c', { x: 5, y: 0, z: 0 });
    tg.setParent('c', 'p');
    tg.updateAll();
    expect(tg.getWorldPosition('c')!.x).toBe(15);
  });

  it('deep hierarchy computes correctly', () => {
    tg.addNode('a', { x: 1, y: 0, z: 0 });
    tg.addNode('b', { x: 2, y: 0, z: 0 });
    tg.addNode('c', { x: 3, y: 0, z: 0 });
    tg.setParent('b', 'a');
    tg.setParent('c', 'b');
    const world = tg.getWorldPosition('c')!;
    // a.world = 1, b.world = 1 + 2*1 = 3, c.world = 3 + 3*1 = 6
    expect(world.x).toBe(6);
  });
});
