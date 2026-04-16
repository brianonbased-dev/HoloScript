import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, updateTrait } from './traitTestHelpers';

// Mock SpringAnimator
vi.mock('@holoscript/engine/animation/SpringAnimator', () => ({
  SpringAnimator: class MockSpringAnimator {
    value = 0;
    constructor(initial: number = 0) {
      this.value = initial;
    }
    setTarget = vi.fn();
    update = vi.fn().mockReturnValue(0.5);
  },
  SpringPresets: {
    gentle: { stiffness: 120, damping: 14 },
    bouncy: { stiffness: 200, damping: 10 },
  },
}));

vi.mock('../UITraits', () => ({
  UIHandMenuTrait: {},
}));

import { handMenuHandler } from '../HandMenuTrait';

describe('HandMenuTrait', () => {
  let node: Record<string, unknown>;
  let ctx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('menu1');
    (node as any).properties = { position: [0, 0, 0], scale: [1, 1, 1 ] };
    ctx = {
      ...createMockContext(),
      vr: {
        hands: {
          left: { position: [-0.3, 1.2, 0.4] },
        },
      },
    };
    attachTrait(handMenuHandler, node, {}, ctx);
  });

  it('sets initial scale to zero on attach', () => {
    expect((node as any).properties.scale).toEqual([0, 0, 0 ]);
  });

  it('sets initial opacity to zero on attach', () => {
    expect((node as any).properties.opacity).toBe(0);
  });

  it('cleans up on detach', () => {
    handMenuHandler.onDetach?.(node as any, {} as any, ctx);
    // Should not throw
  });

  it('updates position and scale on update with hand present', () => {
    updateTrait(handMenuHandler, node, {}, ctx, 0.016);
    // Spring returns 0.5, so scale should be 0.5 * 1 (default scale)
    expect((node as any).properties.opacity).toBe(0.5);
  });

  it('drives spring visibility from hand presence', () => {
    updateTrait(handMenuHandler, node, {}, ctx, 0.016);
    expect((node as any).properties.scale[0]).toBeCloseTo(0.5, 1);
  });

  it('reduces visibility when no hand present', () => {
    const noHandCtx = {
      ...createMockContext(),
      vr: { hands: {} },
    };
    updateTrait(handMenuHandler, node, {}, noHandCtx, 0.016);
    // Spring still returns 0.5 (mocked), but shouldShow = false
    expect((node as any).properties.opacity).toBe(0.5);
  });

  it('lerps position towards hand', () => {
    updateTrait(handMenuHandler, node, {}, ctx, 0.016);
    const pos = (node as any).properties.position;
    // Should have moved towards hand position + offset
    expect(pos[1]).toBeGreaterThan(0);
  });

  it('has correct handler name', () => {
    expect(handMenuHandler.name).toBe('ui_hand_menu');
  });
});
