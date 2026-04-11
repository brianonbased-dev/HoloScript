import { describe, it, expect, beforeEach } from 'vitest';
import { RopeSystem } from '..';

describe('RopeSystem', () => {
  let sys: RopeSystem;

  beforeEach(() => {
    sys = new RopeSystem();
  });

  it('creates a rope with correct segment count', () => {
    sys.createRope('r1', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }, { segmentCount: 5 });
    const nodes = sys.getRopeNodes('r1');
    expect(nodes.length).toBe(6); // segmentCount + 1
    expect(sys.getRopeCount()).toBe(1);
  });

  it('initial nodes are along start-end line', () => {
    sys.createRope('r2', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 }, { segmentCount: 10 });
    const nodes = sys.getRopeNodes('r2');
    expect(nodes[0].position.y).toBeCloseTo(10);
    expect(nodes[10].position.y).toBeCloseTo(0);
  });

  it('pinNode pins a node', () => {
    sys.createRope('r3', { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 });
    sys.pinNode('r3', 0);
    expect(sys.getRopeNodes('r3')[0].pinned).toBe(true);
  });

  it('unpinNode unpins a node', () => {
    sys.createRope('r4', { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 });
    sys.pinNode('r4', 0);
    sys.unpinNode('r4', 0);
    expect(sys.getRopeNodes('r4')[0].pinned).toBe(false);
  });

  it('getRopeLength measures total rope length', () => {
    sys.createRope('r5', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 });
    const len = sys.getRopeLength('r5');
    expect(len).toBeCloseTo(10, 0);
  });

  it('update simulates gravity', () => {
    sys.createRope('r6', { x: 0, y: 10, z: 0 }, { x: 10, y: 10, z: 0 }, { segmentCount: 4 });
    sys.pinNode('r6', 0); // pin start
    const midBefore = sys.getRopeNodes('r6')[2].position.y;
    sys.update(1 / 60);
    const midAfter = sys.getRopeNodes('r6')[2].position.y;
    expect(midAfter).toBeLessThan(midBefore); // gravity pulled it down
  });

  it('pinned node stays in place during simulation', () => {
    sys.createRope('r7', { x: 0, y: 5, z: 0 }, { x: 5, y: 5, z: 0 });
    sys.pinNode('r7', 0);
    sys.update(1 / 60);
    expect(sys.getRopeNodes('r7')[0].position.y).toBeCloseTo(5);
  });

  it('removeRope deletes rope', () => {
    sys.createRope('r8', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    sys.removeRope('r8');
    expect(sys.getRopeCount()).toBe(0);
  });

  it('getTension returns value >= 0', () => {
    sys.createRope('r9', { x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 });
    const t = sys.getTension('r9', 0);
    expect(t).toBeGreaterThanOrEqual(0);
  });

  it('attach adds an attachment', () => {
    sys.createRope('r10', { x: 0, y: 5, z: 0 }, { x: 5, y: 5, z: 0 });
    sys.attach('r10', { nodeIndex: 0, entityId: 'ent1', offset: { x: 0, y: 0, z: 0 } });
    // No throw = success (attachments are internal)
  });
});
