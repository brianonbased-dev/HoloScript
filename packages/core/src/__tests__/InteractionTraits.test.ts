import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrabbableTrait } from '../traits/GrabbableTrait';
import { PressableTrait } from '../traits/PressableTrait';
import { SlidableTrait } from '../traits/SlidableTrait';

// =============================================================================
// SHARED HELPERS
// =============================================================================

function mockContext(overrides: Record<string, any> = {}) {
  return {
    emit: vi.fn(),
    vr: {
      hands: {
        left: null as any,
        right: null as any,
      },
    },
    physics: {
      getBodyPosition: vi.fn(() => null),
    },
    haptics: {
      pulse: vi.fn(),
      rumble: vi.fn(),
    },
    ...overrides,
  };
}

function mockNode(id = 'obj-1', props: Record<string, any> = {}) {
  return {
    id,
    properties: {
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      ...props,
    },
  };
}

function mockHand(pos: { x: number; y: number; z: number }, pinch = 0): any {
  return {
    position: { ...pos },
    pinchStrength: pinch,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
}

// =============================================================================
// GRABBABLE TRAIT
// =============================================================================

describe('GrabbableTrait', () => {
  let trait: GrabbableTrait;

  beforeEach(() => {
    trait = new GrabbableTrait();
    // performance.now mock
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  it('does nothing when no hands are present', () => {
    const node = mockNode();
    const ctx = mockContext();
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('grabs when hand is close and pinching', () => {
    const node = mockNode();
    const ctx = mockContext();
    ctx.vr.hands.right = mockHand({ x: 0, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_grab',
      expect.objectContaining({ nodeId: 'obj-1', hand: 'right' })
    );
  });

  it('does not grab when hand is too far', () => {
    const node = mockNode();
    const ctx = mockContext();
    ctx.vr.hands.right = mockHand({ x: 5, y: 5, z: 5 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('releases when pinch drops below threshold', () => {
    const node = mockNode();
    const ctx = mockContext();

    // First: grab
    ctx.vr.hands.right = mockHand({ x: 0, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    ctx.emit.mockClear();

    // Then: release (pinch < 0.5)
    ctx.vr.hands.right = mockHand({ x: 0.1, y: 0, z: 0 }, 0.3);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_release',
      expect.objectContaining({ nodeId: 'obj-1' })
    );
  });

  it('calculates throw velocity on release', () => {
    const node = mockNode();
    const ctx = mockContext();

    // Grab
    ctx.vr.hands.right = mockHand({ x: 0, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    ctx.emit.mockClear();

    // Move hand and release
    ctx.vr.hands.right = mockHand({ x: 1, y: 0, z: 0 }, 0.1);
    trait.onUpdate(node, ctx as any, 0.016);

    const releaseCall = ctx.emit.mock.calls.find((c) => c[0] === 'physics_release');
    expect(releaseCall).toBeDefined();
    expect(releaseCall![1].velocity).toBeDefined();
    expect(releaseCall![1].velocity.length).toBe(3);
  });

  it('enters two-handed mode with both hands gripping', () => {
    const node = mockNode();
    const ctx = mockContext();

    // Grab with right
    ctx.vr.hands.right = mockHand({ x: 0, y: 0, z: 0 }, 0.95);
    ctx.vr.hands.left = null;
    trait.onUpdate(node, ctx as any, 0.016);
    ctx.emit.mockClear();

    // Grab with left too
    ctx.vr.hands.left = mockHand({ x: 0, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_release',
      expect.objectContaining({ nodeId: 'obj-1' })
    );
  });

  it('two-handed scaling changes node scale', () => {
    const node = mockNode();
    const ctx = mockContext();

    // Both hands close and grabbing
    ctx.vr.hands.left = mockHand({ x: -0.05, y: 0, z: 0 }, 0.95);
    ctx.vr.hands.right = mockHand({ x: 0.05, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016); // grab left
    ctx.emit.mockClear();

    // Spread hands apart (double distance)
    ctx.vr.hands.left = mockHand({ x: -0.1, y: 0, z: 0 }, 0.95);
    ctx.vr.hands.right = mockHand({ x: 0.1, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);

    // Scale should have increased
    expect(node.properties.scale.x).toBeGreaterThan(1);
  });

  it('cleans up on detach', () => {
    const node = mockNode();
    const ctx = mockContext();

    // Grab first
    ctx.vr.hands.right = mockHand({ x: 0, y: 0, z: 0 }, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    ctx.emit.mockClear();

    // Detach should release
    trait.onDetach(node, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_release',
      expect.objectContaining({ nodeId: 'obj-1' })
    );
  });
});

// =============================================================================
// PRESSABLE TRAIT
// =============================================================================

describe('PressableTrait', () => {
  let trait: PressableTrait;

  beforeEach(() => {
    trait = new PressableTrait();
  });

  it('sets up prismatic constraint on attach', () => {
    const node = mockNode('btn-1', { distance: 0.02, stiffness: 150, damping: 8 });
    const ctx = mockContext();
    trait.onAttach(node, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_constraint',
      expect.objectContaining({
        type: 'prismatic',
        nodeId: 'btn-1',
        axis: { x: 0, y: 0, z: 1 },
      })
    );
  });

  it('uses default values when properties missing', () => {
    const node = mockNode('btn-2');
    const ctx = mockContext();
    trait.onAttach(node, ctx as any);
    const call = ctx.emit.mock.calls[0][1];
    expect(call.max).toBe(0.01); // Default 1cm
    expect(call.spring.stiffness).toBe(100);
    expect(call.spring.damping).toBe(5);
  });

  it('fires press event when depression exceeds trigger point', () => {
    const node = mockNode('btn-3', { distance: 0.01, triggerPoint: 0.5 });
    const ctx = mockContext();
    // First update captures initial pos
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);

    // Move past trigger (0.5 * 0.01 = 0.005)
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0.008 });
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('ui_press_start', { nodeId: 'btn-3' });
    expect(ctx.haptics.pulse).toHaveBeenCalled();
  });

  it('fires release event with hysteresis', () => {
    const node = mockNode('btn-4', { distance: 0.01, triggerPoint: 0.5, releasePoint: 0.3 });
    const ctx = mockContext();

    // Initial
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);

    // Press
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0.008 });
    trait.onUpdate(node, ctx as any, 0.016);
    ctx.emit.mockClear();

    // Partial release (still above releasePoint at 0.3 → 0.003)
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0.004 });
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ui_press_end', expect.anything());

    // Full release (below 0.003)
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0.002 });
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('ui_press_end', { nodeId: 'btn-4' });
  });

  it('does nothing when physics returns null', () => {
    const node = mockNode('btn-5');
    const ctx = mockContext();
    ctx.physics.getBodyPosition.mockReturnValue(null);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// =============================================================================
// SLIDABLE TRAIT
// =============================================================================

describe('SlidableTrait', () => {
  let trait: SlidableTrait;

  beforeEach(() => {
    trait = new SlidableTrait();
  });

  it('sets up prismatic constraint on attach', () => {
    const node = mockNode('slider-1', { axis: 'x', length: 0.2 });
    const ctx = mockContext();
    trait.onAttach(node, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'physics_add_constraint',
      expect.objectContaining({
        type: 'prismatic',
        nodeId: 'slider-1',
        axis: { x: 1, y: 0, z: 0 },
        min: -0.1,
        max: 0.1,
      })
    );
  });

  it('supports y and z axes', () => {
    const ctx = mockContext();
    trait.onAttach(mockNode('s', { axis: 'y', length: 0.1 }), ctx as any);
    expect(ctx.emit.mock.calls[0][1].axis).toEqual({ x: 0, y: 1, z: 0 });

    const trait2 = new SlidableTrait();
    const ctx2 = mockContext();
    trait2.onAttach(mockNode('s2', { axis: 'z', length: 0.1 }), ctx2 as any);
    expect(ctx2.emit.mock.calls[0][1].axis).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('maps position to value 0-1', () => {
    const node = mockNode('slider-2', { axis: 'x', length: 0.2 });
    const ctx = mockContext();

    // First update: initial pos (will emit 0.5 center value)
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);

    // Move to max → should emit value ~1.0
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0.1, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'ui_value_change',
      expect.objectContaining({ nodeId: 'slider-2' })
    );
    // Last emitted value (not first, which is 0.5 from center)
    const calls = ctx.emit.mock.calls.filter((c) => c[0] === 'ui_value_change');
    const value = calls[calls.length - 1][1].value;
    expect(value).toBeCloseTo(1.0, 1);
  });

  it('clamps value to 0-1 range', () => {
    const node = mockNode('slider-3', { axis: 'x', length: 0.2 });
    const ctx = mockContext();

    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);

    // Move way past max
    ctx.physics.getBodyPosition.mockReturnValue({ x: 10, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);
    // Last emitted value should be clamped to 1
    const calls = ctx.emit.mock.calls.filter((c) => c[0] === 'ui_value_change');
    const value = calls[calls.length - 1][1].value;
    expect(value).toBe(1);
  });

  it('emits haptic tick on 10% value changes', () => {
    const node = mockNode('slider-4', { axis: 'x', length: 1.0 }); // 1m track
    const ctx = mockContext();

    ctx.physics.getBodyPosition.mockReturnValue({ x: 0, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);

    // Move from center (0.5) to 0.6 (cross a 10% boundary)
    ctx.physics.getBodyPosition.mockReturnValue({ x: 0.15, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.haptics.rumble).toHaveBeenCalled();
  });

  it('does not emit when physics returns null', () => {
    const node = mockNode('slider-5', { axis: 'x', length: 0.2 });
    const ctx = mockContext();
    ctx.physics.getBodyPosition.mockReturnValue(null);
    trait.onUpdate(node, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
