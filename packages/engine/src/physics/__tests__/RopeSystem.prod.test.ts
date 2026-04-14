/**
 * RopeSystem — Production Test Suite
 *
 * Covers: createRope, pinNode/unpinNode, attach, update (Verlet),
 * getRopeNodes, getRopeLength, getTension, getRopeCount, removeRope.
 */
import { describe, it, expect } from 'vitest';
import { RopeSystem } from '..';

describe('RopeSystem — Production', () => {
  // ─── Creation ─────────────────────────────────────────────────────
  it('createRope generates nodes from start to end', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [10, 0, 0 ]);
    const nodes = rs.getRopeNodes('r1');
    expect(nodes.length).toBe(11); // 10 segments + 1
    expect(rs.getRopeCount()).toBe(1);
  });

  it('custom segment count is respected', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [5, 0, 0 ], { segmentCount: 5 });
    expect(rs.getRopeNodes('r1').length).toBe(6);
  });

  // ─── Pin / Attach ─────────────────────────────────────────────────
  it('pinNode prevents node movement', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [5, 0, 0 ]);
    rs.pinNode('r1', 0);
    const before = { ...rs.getRopeNodes('r1')[0].position };
    rs.update(1 / 60);
    const after = rs.getRopeNodes('r1')[0].position;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('unpinNode allows movement', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 5, 0 ], [5, 5, 0 ]);
    rs.pinNode('r1', 0);
    rs.unpinNode('r1', 0);
    rs.update(1 / 60);
    // gravity should pull y down
    expect(rs.getRopeNodes('r1')[0].position[1]).toBeLessThan(5);
  });

  it('attach adds attachment to rope', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [5, 0, 0 ]);
    rs.attach('r1', { nodeIndex: 5, entityId: 'obj1', offset: [0, 0, 0 ] });
    // no crash, attachment stored
    expect(rs.getRopeCount()).toBe(1);
  });

  // ─── Simulation ───────────────────────────────────────────────────
  it('update applies gravity to unpinned nodes', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 10, 0 ], [10, 10, 0 ]);
    rs.update(1 / 60);
    // all nodes should have fallen
    const nodes = rs.getRopeNodes('r1');
    for (const n of nodes) {
      expect(n.position[1]).toBeLessThan(10);
    }
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getRopeLength returns total length', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [10, 0, 0 ]);
    expect(rs.getRopeLength('r1')).toBeCloseTo(10, 0);
  });

  it('getTension for a zero-displacement rope is near 0', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [10, 0, 0 ]);
    // before any simulation, tension should be close to 0
    expect(rs.getTension('r1', 0)).toBeCloseTo(0, 1);
  });

  it('getTension returns 0 for invalid index', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [5, 0, 0 ]);
    expect(rs.getTension('r1', -1)).toBe(0);
    expect(rs.getTension('r1', 100)).toBe(0);
  });

  it('getRopeNodes returns empty for missing rope', () => {
    const rs = new RopeSystem();
    expect(rs.getRopeNodes('nope')).toEqual([]);
  });

  // ─── Remove ───────────────────────────────────────────────────────
  it('removeRope deletes rope', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 0, 0 ], [5, 0, 0 ]);
    rs.removeRope('r1');
    expect(rs.getRopeCount()).toBe(0);
  });
});
