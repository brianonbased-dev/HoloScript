/**
 * PressableTrait — Production Test Suite
 *
 * PressableTrait is a CLASS. We test:
 * - onAttach: emits physics_add_constraint with prismatic config
 * - onUpdate: state machine (unpressed → pressed → unpressed), haptic pulses, hysteresis
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PressableTrait } from '../PressableTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrait() {
  return new PressableTrait();
}

function makeNode(overrides: any = {}) {
  return {
    id: 'press_node',
    properties: {
      position: { x: 0, y: 0, z: 0 },
      distance: 0.01,
      stiffness: 100,
      damping: 5,
      triggerPoint: 0.5,
      releasePoint: 0.3,
      ...overrides,
    },
  };
}

function makeCtx(bodyZ = 0) {
  return {
    emit: vi.fn(),
    physics: { getBodyPosition: vi.fn().mockReturnValue({ x: 0, y: 0, z: bodyZ }) },
    haptics: { pulse: vi.fn() },
  };
}

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('PressableTrait.onAttach', () => {
  it('emits physics_add_constraint', () => {
    const t = makeTrait();
    const node = makeNode();
    const ctx = makeCtx();
    t.onAttach(node, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_constraint',
      expect.objectContaining({ type: 'prismatic' })
    );
  });

  it('constraint nodeId matches node.id', () => {
    const t = makeTrait();
    const node = makeNode();
    const ctx = makeCtx();
    t.onAttach(node, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_constraint',
      expect.objectContaining({ nodeId: 'press_node' })
    );
  });

  it('axis is local Z (0,0,1)', () => {
    const t = makeTrait();
    const node = makeNode();
    const ctx = makeCtx();
    t.onAttach(node, ctx as any);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'physics_add_constraint');
    expect(call[1].axis).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('max = distance from node.properties', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.05 });
    const ctx = makeCtx();
    t.onAttach(node, ctx as any);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'physics_add_constraint');
    expect(call[1].max).toBe(0.05);
  });

  it('stiffness and damping from node.properties', () => {
    const t = makeTrait();
    const node = makeNode({ stiffness: 200, damping: 20 });
    const ctx = makeCtx();
    t.onAttach(node, ctx as any);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'physics_add_constraint');
    expect(call[1].spring.stiffness).toBe(200);
    expect(call[1].spring.damping).toBe(20);
  });

  it('defaults stiffness=100 when not in properties', () => {
    const t = makeTrait();
    const node = makeNode({ stiffness: undefined });
    const ctx = makeCtx();
    t.onAttach(node, ctx as any);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'physics_add_constraint');
    expect(call[1].spring.stiffness).toBe(100);
  });

  it('min is 0 (no negative depression)', () => {
    const t = makeTrait();
    const ctx = makeCtx();
    t.onAttach(makeNode(), ctx as any);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'physics_add_constraint');
    expect(call[1].min).toBe(0);
  });
});

// ─── onUpdate — initialPos capture ────────────────────────────────────────────

describe('PressableTrait.onUpdate — initialPos capture', () => {
  it('no-ops gracefully when physics returns null (no crash)', () => {
    const t = makeTrait();
    const node = makeNode();
    const ctx = {
      emit: vi.fn(),
      physics: { getBodyPosition: vi.fn().mockReturnValue(null) },
      haptics: { pulse: vi.fn() },
    };
    expect(() => t.onUpdate(node, ctx as any, 0.016)).not.toThrow();
  });

  it('captures initialPos from node.properties on first call', () => {
    const t = makeTrait();
    const node = makeNode();
    node.properties.position = { x: 1, y: 2, z: 3 };
    // body at z=3 → no depression (same as initial)
    const ctx = makeCtx(3);
    t.onUpdate(node, ctx as any, 0.016);
    // No press since no depression
    expect(ctx.emit).not.toHaveBeenCalledWith('ui_press_start', expect.anything());
  });
});

// ─── onUpdate — press state machine ───────────────────────────────────────────

describe('PressableTrait.onUpdate — press state machine', () => {
  it('emits ui_press_start when depression exceeds triggerPoint', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01, triggerPoint: 0.5 });
    // initialPos.z will be captured as 0 from node.properties.position
    // body at z = 0.008 → depression = 0.008/0.01 = 0.8 > 0.5
    const ctx = makeCtx(0.008);
    t.onUpdate(node, ctx as any, 0.016); // capture initial
    // second call with body displaced
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'ui_press_start',
      expect.objectContaining({ nodeId: 'press_node' })
    );
  });

  it('pulses both haptics on press', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01, triggerPoint: 0.5 });
    const ctx = makeCtx(0.008);
    t.onUpdate(node, ctx as any, 0.016);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', 0.5, 20);
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('right', 0.5, 20);
  });

  it('does NOT press when depression < triggerPoint', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01, triggerPoint: 0.5 });
    const ctx = makeCtx(0.003); // 0.3 < 0.5
    t.onUpdate(node, ctx as any, 0.016);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ui_press_start', expect.anything());
  });

  it('emits ui_press_end when depression drops below releasePoint after press', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01, triggerPoint: 0.5, releasePoint: 0.3 });

    // Frame 1: capture initial
    const ctxInit = makeCtx(0);
    t.onUpdate(node, ctxInit as any, 0.016);

    // Frame 2: press (depression 0.8)
    const ctxPress = makeCtx(0.008);
    t.onUpdate(node, ctxPress as any, 0.016);

    // Frame 3: release (depression 0.1 < 0.3)
    ctxPress.emit.mockClear();
    ctxPress.physics.getBodyPosition = vi.fn().mockReturnValue({ x: 0, y: 0, z: 0.001 });
    t.onUpdate(node, ctxPress as any, 0.016);
    expect(ctxPress.emit).toHaveBeenCalledWith(
      'ui_press_end',
      expect.objectContaining({ nodeId: 'press_node' })
    );
  });

  it('pulses haptics on release', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01, triggerPoint: 0.5, releasePoint: 0.3 });
    const ctx = makeCtx(0);
    t.onUpdate(node, ctx as any, 0.016); // init
    ctx.physics.getBodyPosition = vi.fn().mockReturnValue({ x: 0, y: 0, z: 0.008 });
    t.onUpdate(node, ctx as any, 0.016); // press
    ctx.haptics.pulse.mockClear();
    ctx.physics.getBodyPosition = vi.fn().mockReturnValue({ x: 0, y: 0, z: 0.001 });
    t.onUpdate(node, ctx as any, 0.016); // release
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('left', 0.3, 10);
    expect(ctx.haptics.pulse).toHaveBeenCalledWith('right', 0.3, 10);
  });

  it('hysteresis: does not re-fire ui_press_start while still pressed', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01, triggerPoint: 0.5 });
    const ctx = makeCtx(0.008);
    t.onUpdate(node, ctx as any, 0.016); // init
    t.onUpdate(node, ctx as any, 0.016); // press
    ctx.emit.mockClear();
    t.onUpdate(node, ctx as any, 0.016); // still pressed
    expect(ctx.emit).not.toHaveBeenCalledWith('ui_press_start', expect.anything());
  });

  it('default triggerPoint=0.5 when not set on node', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01 });
    delete node.properties.triggerPoint;
    // depression = 0.007/0.01 = 0.7 > default 0.5 → should press
    const ctx = makeCtx(0.007);
    t.onUpdate(node, ctx as any, 0.016);
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('ui_press_start', expect.anything());
  });

  it('default releasePoint=0.3 when not set on node', () => {
    const t = makeTrait();
    const node = makeNode({ distance: 0.01 });
    delete node.properties.releasePoint;
    const ctx = makeCtx(0);
    t.onUpdate(node, ctx as any, 0.016); // init
    ctx.physics.getBodyPosition = vi.fn().mockReturnValue({ x: 0, y: 0, z: 0.008 });
    t.onUpdate(node, ctx as any, 0.016); // press
    ctx.emit.mockClear();
    // depression 0.002 / 0.01 = 0.2 < default 0.3 → release
    ctx.physics.getBodyPosition = vi.fn().mockReturnValue({ x: 0, y: 0, z: 0.002 });
    t.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('ui_press_end', expect.anything());
  });
});
