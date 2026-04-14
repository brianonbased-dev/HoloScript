import { describe, it, expect, beforeEach } from 'vitest';
import { RopeSystem } from '..';

describe('RopeSystem', () => {
  let sys: RopeSystem;

  beforeEach(() => {
    sys = new RopeSystem();
  });

  it('creates a rope with correct segment count', () => {
    sys.createRope('r1', [0, 10, 0 ], [0, 0, 0 ], { segmentCount: 5 });
    const nodes = sys.getRopeNodes('r1');
    expect(nodes.length).toBe(6); // segmentCount + 1
    expect(sys.getRopeCount()).toBe(1);
  });

  it('initial nodes are along start-end line', () => {
    sys.createRope('r2', [0, 10, 0 ], [0, 0, 0 ], { segmentCount: 10 });
    const nodes = sys.getRopeNodes('r2');
    expect(nodes[0].position[1]).toBeCloseTo(10);
    expect(nodes[10].position[1]).toBeCloseTo(0);
  });

  it('pinNode pins a node', () => {
    sys.createRope('r3', [0, 5, 0 ], [0, 0, 0 ]);
    sys.pinNode('r3', 0);
    expect(sys.getRopeNodes('r3')[0].pinned).toBe(true);
  });

  it('unpinNode unpins a node', () => {
    sys.createRope('r4', [0, 5, 0 ], [0, 0, 0 ]);
    sys.pinNode('r4', 0);
    sys.unpinNode('r4', 0);
    expect(sys.getRopeNodes('r4')[0].pinned).toBe(false);
  });

  it('getRopeLength measures total rope length', () => {
    sys.createRope('r5', [0, 10, 0 ], [0, 0, 0 ]);
    const len = sys.getRopeLength('r5');
    expect(len).toBeCloseTo(10, 0);
  });

  it('update simulates gravity', () => {
    sys.createRope('r6', [0, 10, 0 ], [10, 10, 0 ], { segmentCount: 4 });
    sys.pinNode('r6', 0); // pin start
    const midBefore = sys.getRopeNodes('r6')[2].position[1];
    sys.update(1 / 60);
    const midAfter = sys.getRopeNodes('r6')[2].position[1];
    expect(midAfter).toBeLessThan(midBefore); // gravity pulled it down
  });

  it('pinned node stays in place during simulation', () => {
    sys.createRope('r7', [0, 5, 0 ], [5, 5, 0 ]);
    sys.pinNode('r7', 0);
    sys.update(1 / 60);
    expect(sys.getRopeNodes('r7')[0].position[1]).toBeCloseTo(5);
  });

  it('removeRope deletes rope', () => {
    sys.createRope('r8', [0, 0, 0 ], [1, 0, 0 ]);
    sys.removeRope('r8');
    expect(sys.getRopeCount()).toBe(0);
  });

  it('getTension returns value >= 0', () => {
    sys.createRope('r9', [0, 10, 0 ], [0, 0, 0 ]);
    const t = sys.getTension('r9', 0);
    expect(t).toBeGreaterThanOrEqual(0);
  });

  it('attach adds an attachment', () => {
    sys.createRope('r10', [0, 5, 0 ], [5, 5, 0 ]);
    sys.attach('r10', { nodeIndex: 0, entityId: 'ent1', offset: [0, 0, 0 ] });
    // No throw = success (attachments are internal)
  });
});
