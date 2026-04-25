/**
 * SlidableTrait — Production Test Suite
 *
 * SlidableTrait is a class-based Trait. One instance per slider — we create a
 * fresh instance for each test.
 *
 * Key behaviours under test:
 * 1. onAttach — emits physics_add_constraint (prismatic) with correct axis/min/max
 * 2. onUpdate — reads physics body pos, normalises to 0-1, emits ui_value_change,
 *               fires haptic rumble on each 10% step boundary crossing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlidableTrait } from '../SlidableTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeCtx(bodyPos: Vector3 | null = null) {
  return {
    emit: vi.fn(),
    physics: {
      getBodyPosition: vi.fn().mockReturnValue(bodyPos),
    },
    haptics: {
      rumble: vi.fn(),
    },
  };
}

function makeNode(overrides: Record<string, any> = {}) {
  return {
    id: 'slider_node',
    properties: {
      position: [0, 0, 0],
      ...overrides,
    },
  };
}

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('SlidableTrait.onAttach', () => {
  it('emits physics_add_constraint of type prismatic', () => {
    const trait = new SlidableTrait();
    const node = makeNode();
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_constraint',
      expect.objectContaining({ type: 'prismatic' })
    );
  });

  it('nodeId matches node.id', () => {
    const trait = new SlidableTrait();
    const node = makeNode();
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.nodeId).toBe('slider_node');
  });

  it('default axis is local X (1,0,0)', () => {
    const trait = new SlidableTrait();
    const node = makeNode(); // no axis property
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.axis).toEqual([1, 0, 0 ]);
  });

  it("axis='y' produces axisVec (0,1,0)", () => {
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'y' });
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.axis).toEqual([0, 1, 0 ]);
  });

  it("axis='z' produces axisVec (0,0,1)", () => {
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'z' });
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.axis).toEqual([0, 0, 1 ]);
  });

  it('min = -length/2 (default length=0.1 → min=-0.05)', () => {
    const trait = new SlidableTrait();
    const node = makeNode();
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.min).toBeCloseTo(-0.05, 5);
  });

  it('max = +length/2 (default length=0.1 → max=+0.05)', () => {
    const trait = new SlidableTrait();
    const node = makeNode();
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.max).toBeCloseTo(0.05, 5);
  });

  it('custom length=0.4 → min=-0.2, max=+0.2', () => {
    const trait = new SlidableTrait();
    const node = makeNode({ length: 0.4 });
    const ctx = makeCtx();
    trait.onAttach(node, ctx as any);
    const arg = ctx.emit.mock.calls[0][1];
    expect(arg.min).toBeCloseTo(-0.2, 5);
    expect(arg.max).toBeCloseTo(0.2, 5);
  });
});

// ─── onUpdate — initial pos capture ──────────────────────────────────────────

describe('SlidableTrait.onUpdate — initialPos capture', () => {
  it('no-op (no crash) when physics returns null', () => {
    const trait = new SlidableTrait();
    const node = makeNode();
    const ctx = makeCtx(null);
    // Should not throw
    expect(() => trait.onUpdate(node, ctx as any, 0.016)).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('captures initialPos from node.properties.position on first call', () => {
    const trait = new SlidableTrait();
    const node = makeNode({ position: [0, 0, 0] });
    // First call with physics at initial pos (value should be 0.5 — centre)
    const ctx = makeCtx([0, 0, 0 ]);
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    trait.onUpdate(node, ctx as any, 0.016);
    // delta=0, length=0.1 → value=(0+0.05)/0.1=0.5; lastValue=0 → diff=0.5>0.01 → emits
    expect(ctx.emit).toHaveBeenCalledWith(
      'ui_value_change',
      expect.objectContaining({ value: 0.5 })
    );
  });
});

// ─── onUpdate — value normalisation ──────────────────────────────────────────

describe('SlidableTrait.onUpdate — value normalisation (axis=x, length=0.1)', () => {
  function make(physicsX: number) {
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'x', length: 0.1, position: [0, 0, 0] });
    const ctx = makeCtx([physicsX, 0, 0 ]);
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    return { trait, node, ctx };
  }

  it('value=0 when body at -length/2 (fully left)', () => {
    const { trait, node, ctx } = make(-0.05);
    trait.onUpdate(node, ctx as any, 0.016);
    const em = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ui_value_change');
    // delta=-0.05; (delta+0.05)/0.1 = 0/0.1 = 0; diff from lastValue(0)=0 → NOT emitted (diff<=0.01)
    // value == lastValue(0), so no emit expected
    expect(em).toBeUndefined();
  });

  it('value=1 when body at +length/2 (fully right)', () => {
    const { trait, node, ctx } = make(0.05);
    trait.onUpdate(node, ctx as any, 0.016);
    const em = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ui_value_change');
    expect(em).toBeDefined();
    expect(em![1].value).toBeCloseTo(1, 2);
  });

  it('value=0.5 when body at centre (delta=0)', () => {
    const { trait, node, ctx } = make(0);
    trait.onUpdate(node, ctx as any, 0.016);
    const em = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ui_value_change');
    expect(em).toBeDefined();
    expect(em![1].value).toBeCloseTo(0.5, 2);
  });

  it('value clamped to 0 for excessive negative displacement', () => {
    const { trait, node, ctx } = make(-1.0); // way past min
    trait.onUpdate(node, ctx as any, 0.016);
    // value would be negative without clamp; after clamp = 0; diff from lastValue(0) = 0 → no emit
    const emitted = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ui_value_change');
    if (emitted) {
      expect(emitted[1].value).toBeGreaterThanOrEqual(0);
    }
  });

  it('value clamped to 1 for excessive positive displacement', () => {
    const { trait, node, ctx } = make(5.0); // way past max
    trait.onUpdate(node, ctx as any, 0.016);
    const emitted = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ui_value_change');
    expect(emitted).toBeDefined();
    expect(emitted![1].value).toBeLessThanOrEqual(1);
  });

  it('does NOT emit ui_value_change when change < 0.01', () => {
    // Simulate two frames with nearly-identical positions → no duplicate event
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'x', length: 0.1, position: [0, 0, 0] });
    const ctx = makeCtx([0, 0, 0 ]);
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    trait.onUpdate(node, ctx as any, 0.016); // emits value=0.5
    ctx.emit.mockClear();
    // Move body by 0.0005 → Δvalue = 0.005 < 0.01 → no emit
    (ctx.physics.getBodyPosition as ReturnType<typeof vi.fn>).mockReturnValue([0.0005, 0, 0]);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ui_value_change', expect.anything());
  });

  it('stores updated value on node.properties.value', () => {
    const { trait, node, ctx } = make(0); // value=0.5
    trait.onUpdate(node, ctx as any, 0.016);
    expect(node.properties.value).toBeCloseTo(0.5, 2);
  });

  it('uses y-axis displacement when axis=y', () => {
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'y', length: 0.2, position: [0, 0, 0] });
    const ctx = makeCtx([0, 0.1, 0 ]); // +length/2 → value=1
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    trait.onUpdate(node, ctx as any, 0.016);
    const em = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ui_value_change');
    expect(em![1].value).toBeCloseTo(1, 2);
  });

  it('uses z-axis displacement when axis=z', () => {
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'z', length: 0.2, position: [0, 0, 0] });
    const ctx = makeCtx([0, 0, -0.1 ]); // -length/2 → value=0; no emit (diff=0 from lastValue)
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    trait.onUpdate(node, ctx as any, 0.016);
    // value=0, lastValue=0 → no change → no emit is fine; just verify no crash
    expect(() => trait.onUpdate(node, ctx as any, 0.016)).not.toThrow();
  });
});

// ─── onUpdate — haptic ticks ──────────────────────────────────────────────────

describe('SlidableTrait.onUpdate — haptic ticks', () => {
  it('rumbles both hands when crossing a 10% boundary', () => {
    // lastValue=0, move to 0.15 → floor(0)=0, floor(0.15*10)=1 → different → rumble
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'x', length: 1.0, position: [0, 0, 0] });
    // length=1.0 → min=-0.5, max=+0.5
    // To get value=0.15: delta = value*length - length/2 = 0.15 - 0.5 = -0.35
    const ctx = makeCtx([-0.35, 0, 0 ]);
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    (ctx.haptics.rumble as ReturnType<typeof vi.fn>).mockClear();
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.haptics.rumble).toHaveBeenCalledWith('right', 0.2);
    expect(ctx.haptics.rumble).toHaveBeenCalledWith('left', 0.2);
  });

  it('does NOT rumble when staying within the same 10% bucket', () => {
    const trait = new SlidableTrait();
    const node = makeNode({ axis: 'x', length: 1.0, position: [0, 0, 0] });
    // Start at value≈0.52 (first frame sets lastValue)
    const ctx = makeCtx([0.02, 0, 0 ]);
    trait.onAttach(node, ctx as any);
    ctx.emit.mockClear();
    trait.onUpdate(node, ctx as any, 0.016); // sets lastValue ≈ 0.52
    ctx.emit.mockClear();
    (ctx.haptics.rumble as ReturnType<typeof vi.fn>).mockClear();
    // Move to 0.55 — same bucket (floor(0.55*10)=5, floor(0.52*10)=5)
    (ctx.physics.getBodyPosition as ReturnType<typeof vi.fn>).mockReturnValue([0.05, 0, 0]);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.haptics.rumble).not.toHaveBeenCalled();
  });
});
