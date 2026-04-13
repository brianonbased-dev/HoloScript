import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrabbableTrait } from '../traits/GrabbableTrait';
import { TraitContext } from '../traits/VRTraitSystem';

describe('Two-Handed Interactions', () => {
  let context: TraitContext;
  let node: any;
  let trait: GrabbableTrait;

  beforeEach(() => {
    node = {
      id: 'test_node',
      properties: {
        position: [0, 0, 0],
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };

    context = {
      emit: vi.fn(),
      haptics: { pulse: vi.fn(), rumble: vi.fn() },
      physics: {
        getBodyPosition: vi.fn(),
        setKinematic: vi.fn(),
        applyVelocity: vi.fn(),
        raycast: vi.fn(),
        applyAngularVelocity: vi.fn(),
        getBodyVelocity: vi.fn(),
      },
      vr: {
        hands: { left: null, right: null },
        headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
        getPointerRay: vi.fn(),
        getDominantHand: vi.fn(),
      },
      audio: { playSound: vi.fn() },
      getState: vi.fn(),
      setState: vi.fn(),
      getScaleMultiplier: vi.fn(() => 1),
      setScaleContext: vi.fn(),
    } as unknown as TraitContext;

    trait = new GrabbableTrait();
  });

  it('scales object based on pinch distance', () => {
    // Setup initial grab with 2 hands (Unit distance 1.0)
    // Left at -0.5, Right at 0.5
    context.vr.hands.left = {
      position: [-0.5, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      pinchStrength: 1,
    } as any;
    context.vr.hands.right = {
      position: [0.5, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      pinchStrength: 1,
    } as any;

    trait.onUpdate(node, context, 0.016);
    // Simulate grab events (usually triggered by checkHandInteraction, but we can force state or just let checkHandInteraction run)
    // checkHandInteraction checks dist < 0.1. Hand is far.
    // We manually call grab() to bypass proximity check for test setup
    (trait as any).grab(node, context, 'left', context.vr.hands.left);
    (trait as any).grab(node, context, 'right', context.vr.hands.right);

    // Now move hands further apart (Distance 2.0)
    context.vr.hands.left.position.x = -1.0;
    context.vr.hands.right.position.x = 1.0;

    trait.onUpdate(node, context, 0.016);

    // Scale should double
    expect(node.properties.scale.x).toBeCloseTo(2.0);
  });

  it('rotates object based on steering angle', () => {
    // Setup initial grab (Horizontal)
    context.vr.hands.left = {
      position: [-0.5, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      pinchStrength: 1,
    } as any;
    context.vr.hands.right = {
      position: [0.5, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      pinchStrength: 1,
    } as any;

    // Force grab
    (trait as any).grab(node, context, 'left', context.vr.hands.left);
    (trait as any).grab(node, context, 'right', context.vr.hands.right);

    // Initial update to establish baseline angle
    trait.onUpdate(node, context, 0.016);

    // Initial state set. Angle is 0 (dx=1, dz=0).

    // Rotate hands 90 degrees (Right forward, Left back)
    // Left at (0, 0, 0.5), Right at (0, 0, -0.5) ??
    // atan2(dz, dx).
    // dz = right.z - left.z. dx = right.x - left.x.

    // Target: 90 degrees (PI/2).
    // Let's rotate 45 degrees.
    // Right at (0.35, 0, 0.35). Left at (-0.35, 0, -0.35).
    // dx = 0.7. dz = 0.7. angle = 45 deg.

    // Let's try simple 90 degree turn.
    // Left at (0, 0, 0.5), Right at (0, 0, -0.5).
    // dx = 0. dz = -1. atan2(-1, 0) = -PI/2 (-90 deg).
    // Delta angle = -90 - 0 = -90.
    // Object rotation Y = 0 - (-90) = +90 ? (Depends on sign logic in trait)

    context.vr.hands.left.position = { x: 0, y: 0, z: 0.5 };
    context.vr.hands.right.position = { x: 0, y: 0, z: -0.5 };

    trait.onUpdate(node, context, 0.016);

    // Delta was -PI/2.
    // Trait logic: y - delta.
    // 0 - (-PI/2) = PI/2.

    expect(node.properties.rotation.y).toBeCloseTo(-Math.PI / 2);
  });
});
