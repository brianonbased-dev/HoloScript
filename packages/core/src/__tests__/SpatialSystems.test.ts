import { describe, it, expect } from 'vitest';
import { TransformGraph } from '../spatial/TransformGraph';
import { OctreeSystem } from '../spatial/OctreeSystem';
import { FrustumCuller } from '../spatial/FrustumCuller';

describe('Cycle 154: Spatial Systems', () => {
  // -------------------------------------------------------------------------
  // TransformGraph
  // -------------------------------------------------------------------------

  it('should compute world positions through parent chain', () => {
    const tg = new TransformGraph();
    tg.addNode('root', { x: 10, y: 0, z: 0 });
    tg.addNode('child', { x: 5, y: 0, z: 0 });
    tg.setParent('child', 'root');

    const wp = tg.getWorldPosition('child')!;
    expect(wp.x).toBe(15); // root(10) + child(5)
    expect(wp.y).toBe(0);
  });

  it('should propagate dirty flags to children', () => {
    const tg = new TransformGraph();
    tg.addNode('a', { x: 0, y: 0, z: 0 });
    tg.addNode('b', { x: 1, y: 0, z: 0 });
    tg.setParent('b', 'a');

    // Force initial update
    tg.getWorldPosition('b');

    // Move parent
    tg.setPosition('a', 100, 0, 0);
    const wp = tg.getWorldPosition('b')!;
    expect(wp.x).toBe(101); // parent moved to 100 + child local 1
  });

  // -------------------------------------------------------------------------
  // OctreeSystem
  // -------------------------------------------------------------------------

  it('should insert and query by radius', () => {
    const oct = new OctreeSystem(0, 0, 0, 100);
    oct.insert({ id: 'a', x: 5, y: 0, z: 0, radius: 1 });
    oct.insert({ id: 'b', x: 80, y: 0, z: 0, radius: 1 });

    const near = oct.queryRadius(0, 0, 0, 20);
    expect(near.map((e) => e.id)).toContain('a');
    expect(near.map((e) => e.id)).not.toContain('b');
  });

  it('should remove entries', () => {
    const oct = new OctreeSystem(0, 0, 0, 100);
    oct.insert({ id: 'x', x: 0, y: 0, z: 0, radius: 0 });
    expect(oct.getEntryCount()).toBe(1);

    oct.remove('x');
    expect(oct.getEntryCount()).toBe(0);
    expect(oct.queryRadius(0, 0, 0, 10).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // FrustumCuller
  // -------------------------------------------------------------------------

  it('should cull objects outside frustum planes', () => {
    const fc = new FrustumCuller();
    // Define a simple half-space: everything with z > 0 is inside
    fc.setPlanes([{ a: 0, b: 0, c: 1, d: 0 }]); // z >= 0

    fc.addVolume({ id: 'inFront', type: 'sphere', centerX: 0, centerY: 0, centerZ: 10, radius: 1 });
    fc.addVolume({ id: 'behind', type: 'sphere', centerX: 0, centerY: 0, centerZ: -10, radius: 1 });

    const visible = fc.cullAll();
    expect(visible).toContain('inFront');
    expect(visible).not.toContain('behind');
  });

  it('should test AABB against frustum planes', () => {
    const fc = new FrustumCuller();
    fc.setPlanes([
      { a: 0, b: 0, c: 1, d: -5 }, // z >= 5
      { a: 0, b: 0, c: -1, d: 50 }, // z <= 50
    ]);

    const inside = fc.testAABB(0, 0, 20, 5, 5, 5);
    expect(inside).toBe('inside');

    const outside = fc.testAABB(0, 0, 0, 2, 2, 2);
    expect(outside).toBe('outside');
  });
});
