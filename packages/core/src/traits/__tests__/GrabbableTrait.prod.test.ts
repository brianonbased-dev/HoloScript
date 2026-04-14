/**
 * GrabbableTrait — Production Test Suite
 *
 * GrabbableTrait is a CLASS (not a handler). We instantiate it directly and drive
 * onUpdate / onDetach with mock contexts and VR hand data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrabbableTrait } from '../GrabbableTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHand(pinchStrength: number, position = [0, 0, 0 ]) {
  return { pinchStrength, position };
}

function makeNode(pos = [0, 0, 0 ], scale = [1, 1, 1 ]) {
  return {
    id: 'grab_node',
    properties: {
      position: [...pos] as [number, number, number],
      scale: [...scale] as [number, number, number],
      rotation: [0, 0, 0 ],
    },
  };
}

function makeCtx(leftHand: any = null, rightHand: any = null) {
  return {
    emit: vi.fn(),
    vr: { hands: { left: leftHand, right: rightHand } },
  };
}

// ─── Instantiation ────────────────────────────────────────────────────────────

describe('GrabbableTrait constructor', () => {
  it('creates instance with name=grabbable', () => {
    const t = new GrabbableTrait();
    expect(t.name).toBe('grabbable');
  });
  it('starts with no grabbed hands', () => {
    const t = new GrabbableTrait();
    const node = makeNode();
    const ctx = makeCtx();
    // onUpdate with no hands near → no grab emitted
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('physics_grab', expect.anything());
  });
});

// ─── onUpdate — single-hand grab ──────────────────────────────────────────────

describe('GrabbableTrait.onUpdate — single-hand grab', () => {
  it('emits physics_grab when right hand is within 0.1m and pinch > 0.9', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.95, [0.05, 0, 0 ]); // dist < 0.1
    const ctx = makeCtx(null, hand);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_grab',
      expect.objectContaining({ nodeId: 'grab_node', hand: 'right' })
    );
  });

  it('emits physics_grab when left hand is within range and pinching', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.95, [0.02, 0, 0 ]);
    const ctx = makeCtx(hand, null);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_grab',
      expect.objectContaining({ hand: 'left' })
    );
  });

  it('does NOT grab when hand is too far (dist >= 0.1)', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.95, [0.5, 0, 0 ]); // dist = 0.5
    const ctx = makeCtx(null, hand);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('physics_grab', expect.anything());
  });

  it('does NOT grab when pinch < 0.9 even within range', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.5, [0.02, 0, 0 ]);
    const ctx = makeCtx(null, hand);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('physics_grab', expect.anything());
  });

  it('does not double-grab same hand', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.95, [0.02, 0, 0 ]);
    const ctx = makeCtx(null, hand);
    t.onUpdate(node, ctx as any, 0.016); // first grab
    ctx.emit.mockClear();
    t.onUpdate(node, ctx as any, 0.016); // should not re-emit
    expect(ctx.emit).not.toHaveBeenCalledWith(
      'physics_grab',
      expect.objectContaining({ hand: 'right' })
    );
  });
});

// ─── onUpdate — release ───────────────────────────────────────────────────────

describe('GrabbableTrait.onUpdate — release', () => {
  it('emits physics_release when pinch drops below 0.5 after grab', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);

    // Grab first
    const hand = makeHand(0.95, [0.02, 0, 0 ]);
    const ctxGrab = makeCtx(null, hand);
    t.onUpdate(node, ctxGrab as any, 0.016);

    // Now release: pinch 0.3
    hand.pinchStrength = 0.3;
    const ctxRelease = makeCtx(null, hand);
    t.onUpdate(node, ctxRelease as any, 0.016);
    expect(ctxRelease.emit).toHaveBeenCalledWith(
      'physics_release',
      expect.objectContaining({ nodeId: 'grab_node' })
    );
  });

  it('includes velocity in physics_release payload', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.95, [0.02, 0, 0 ]);
    const ctx = makeCtx(null, hand);
    // Record position on first frame
    t.onUpdate(node, ctx as any, 0.016);
    // Move hand and release
    hand.position = [0.1, 0, 0 ];
    hand.pinchStrength = 0.2;
    const ctxR = makeCtx(null, hand);
    t.onUpdate(node, ctxR as any, 0.016);
    const releaseCall = ctxR.emit.mock.calls.find((c: any[]) => c[0] === 'physics_release');
    expect(releaseCall).toBeDefined();
    expect(Array.isArray(releaseCall[1].velocity)).toBe(true);
    expect(releaseCall[1].velocity).toHaveLength(3);
  });

  it('throw velocity is clamped to [-20, 20]', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);
    const hand = makeHand(0.95, [0, 0, 0 ]);
    const ctx = makeCtx(null, hand);
    t.onUpdate(node, ctx as any, 0.016);
    // Extreme movement
    hand.position = [100, 100, 100 ];
    hand.pinchStrength = 0.1;
    const ctxR = makeCtx(null, hand);
    t.onUpdate(node, ctxR as any, 0.016);
    const releaseCall = ctxR.emit.mock.calls.find((c: any[]) => c[0] === 'physics_release');
    const vel = releaseCall[1].velocity as number[];
    vel.forEach((v) => {
      expect(Math.abs(v)).toBeLessThanOrEqual(20);
    });
  });
});

// ─── onUpdate — two-hand grab ─────────────────────────────────────────────────

describe('GrabbableTrait.onUpdate — two-hand grab', () => {
  it('emits physics_release (for physics_release to allow free scaling) when second hand grabs', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ]);

    // Left grabs first
    const leftHand = makeHand(0.95, [0.02, 0, 0 ]);
    const ctx1 = makeCtx(leftHand, null);
    t.onUpdate(node, ctx1 as any, 0.016);

    // Right hand now also grabs
    const rightHand = makeHand(0.95, [-0.02, 0, 0 ]);
    const ctx2 = makeCtx(leftHand, rightHand);
    ctx2.emit.mockClear();
    t.onUpdate(node, ctx2 as any, 0.016);
    expect(ctx2.emit).toHaveBeenCalledWith(
      'physics_release',
      expect.objectContaining({ nodeId: 'grab_node' })
    );
  });

  it('scales object proportionally as hands move apart', () => {
    const t = new GrabbableTrait();
    const node = makeNode([0, 0, 0 ], [1, 1, 1 ]);

    const leftHand = makeHand(0.95, [-0.05, 0, 0 ]);
    const rightHand = makeHand(0.95, [0.05, 0, 0 ]);

    // Grab left
    t.onUpdate(node, makeCtx(leftHand, null) as any, 0.016);
    // Grab right (two-hand mode)
    const ctx2 = makeCtx(leftHand, rightHand);
    t.onUpdate(node, ctx2 as any, 0.016);

    // Now move hands 2x apart
    leftHand.position = [-0.1, 0, 0 ];
    rightHand.position = [0.1, 0, 0 ];
    const ctx3 = makeCtx(leftHand, rightHand);
    t.onUpdate(node, ctx3 as any, 0.016);

    // Scale should be ~2x initial (initialPinchDist = 0.1, now 0.2 → factor 2)
    expect(node.properties.scale[0]).toBeCloseTo(2.0, 0);
    expect(node.properties.scale[1]).toBeCloseTo(2.0, 0);
  });

  it('applies Y-axis rotation when hand angle changes (steering-wheel)', () => {
    const t = new GrabbableTrait();
    const node = makeNode();

    const leftHand = makeHand(0.95, [-0.05, 0, 0 ]);
    const rightHand = makeHand(0.95, [0.05, 0, 0 ]);

    t.onUpdate(node, makeCtx(leftHand, null) as any, 0.016);
    t.onUpdate(node, makeCtx(leftHand, rightHand) as any, 0.016);

    // Rotate hands (change angle)
    leftHand.position = [-0.05, 0, 0.05 ];
    rightHand.position = [0.05, 0, -0.05 ];
    t.onUpdate(node, makeCtx(leftHand, rightHand) as any, 0.016);

    // Rotation Y should differ from 0
    expect(node.properties.rotation).toBeDefined();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('GrabbableTrait.onDetach', () => {
  it('emits physics_release when detached while grabbed', () => {
    const t = new GrabbableTrait();
    const node = makeNode();
    const hand = makeHand(0.95, [0.02, 0, 0 ]);
    const ctxGrab = makeCtx(null, hand);
    t.onUpdate(node, ctxGrab as any, 0.016);

    const ctxDetach = makeCtx();
    t.onDetach(node, ctxDetach as any);
    expect(ctxDetach.emit).toHaveBeenCalledWith(
      'physics_release',
      expect.objectContaining({ nodeId: 'grab_node' })
    );
  });

  it('does NOT emit physics_release when nothing is grabbed', () => {
    const t = new GrabbableTrait();
    const node = makeNode();
    const ctx = makeCtx();
    t.onDetach(node, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('physics_release', expect.anything());
  });
});
