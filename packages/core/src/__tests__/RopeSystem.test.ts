import { describe, it, expect, beforeEach } from 'vitest';
import { RopeSystem } from '../physics/RopeSystem';

// =============================================================================
// C239 — Rope System (Verlet)
// =============================================================================

describe('RopeSystem', () => {
  let rs: RopeSystem;
  beforeEach(() => {
    rs = new RopeSystem();
  });

  it('createRope and getRopeCount', () => {
    rs.createRope('r1', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(rs.getRopeCount()).toBe(1);
  });

  it('createRope generates correct number of nodes', () => {
    rs.createRope('r1', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }, { segmentCount: 5 });
    const nodes = rs.getRopeNodes('r1');
    expect(nodes).toHaveLength(6); // segments + 1
  });

  it('nodes are interpolated between start and end', () => {
    rs.createRope('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { segmentCount: 2 });
    const nodes = rs.getRopeNodes('r1');
    expect(nodes[0].position.x).toBeCloseTo(0);
    expect(nodes[1].position.x).toBeCloseTo(5);
    expect(nodes[2].position.x).toBeCloseTo(10);
  });

  it('pinNode prevents movement', () => {
    rs.createRope('r1', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }, { segmentCount: 5 });
    rs.pinNode('r1', 0);
    const posBefore = { ...rs.getRopeNodes('r1')[0].position };
    rs.update(0.016); // one frame
    const posAfter = rs.getRopeNodes('r1')[0].position;
    expect(posAfter.x).toBeCloseTo(posBefore.x);
    expect(posAfter.y).toBeCloseTo(posBefore.y);
    expect(posAfter.z).toBeCloseTo(posBefore.z);
  });

  it('unpinNode allows movement', () => {
    rs.createRope('r1', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }, { segmentCount: 3 });
    rs.pinNode('r1', 1);
    expect(rs.getRopeNodes('r1')[1].pinned).toBe(true);
    rs.unpinNode('r1', 1);
    expect(rs.getRopeNodes('r1')[1].pinned).toBe(false);
  });

  it('update applies gravity to unpinned nodes', () => {
    rs.createRope('r1', { x: 0, y: 10, z: 0 }, { x: 10, y: 10, z: 0 }, { segmentCount: 2 });
    const yBefore = rs.getRopeNodes('r1')[1].position.y;
    rs.update(0.1);
    const yAfter = rs.getRopeNodes('r1')[1].position.y;
    // Gravity pulls down (default y=-9.81)
    expect(yAfter).toBeLessThan(yBefore);
  });

  it('getRopeLength computes total length', () => {
    rs.createRope('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { segmentCount: 2 });
    const len = rs.getRopeLength('r1');
    expect(len).toBeCloseTo(10, 0);
  });

  it('getTension is 0 for relaxed rope', () => {
    rs.createRope('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { segmentCount: 2 });
    // Before simulation, segments match ideal length → tension ≈ 0
    const tension = rs.getTension('r1', 0);
    expect(tension).toBeCloseTo(0, 1);
  });

  it('attach adds attachment to rope', () => {
    rs.createRope('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
    rs.attach('r1', { nodeIndex: 0, entityId: 'hook', offset: { x: 0, y: 0, z: 0 } });
    // No crash — attachment stored
    expect(rs.getRopeCount()).toBe(1);
  });

  it('removeRope deletes rope', () => {
    rs.createRope('r1', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
    rs.removeRope('r1');
    expect(rs.getRopeCount()).toBe(0);
    expect(rs.getRopeNodes('r1')).toHaveLength(0);
  });

  it('getRopeNodes returns empty for unknown rope', () => {
    expect(rs.getRopeNodes('nope')).toHaveLength(0);
  });

  it('constraint solving maintains segment length', () => {
    rs.createRope(
      'r1',
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { segmentCount: 4, iterations: 20, elasticity: 1 }
    );
    rs.pinNode('r1', 0);
    rs.pinNode('r1', 4);
    // Run several physics steps
    for (let i = 0; i < 10; i++) rs.update(0.016);
    const len = rs.getRopeLength('r1');
    // Length should stay roughly the same (within 20%)
    expect(len).toBeGreaterThan(8);
    expect(len).toBeLessThan(12);
  });
});
