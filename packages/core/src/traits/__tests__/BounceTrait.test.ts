/**
 * BounceTrait — comprehensive tests
 * Delegates to createElasticityTraitHandler('bounce').
 */
import { describe, it, expect, vi } from 'vitest';
import { bounceHandler } from '../BounceTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
});

describe('BounceTrait — metadata', () => {
  it('has name "bounce"', () => {
    expect(bounceHandler.name).toBe('bounce');
  });

  it('defaultConfig has mode=false', () => {
    expect((bounceHandler.defaultConfig as Record<string, unknown>)?.mode).toBe(false);
  });
});

describe('BounceTrait — collision event', () => {
  it('ignores non-collision events', () => {
    const node = makeNode();
    const physicsApply = vi.fn();
    const ctx = {
      emit: vi.fn(),
      physics: { applyVelocity: physicsApply },
    };
    bounceHandler.onEvent!(node as never, { mode: true } as never, ctx as never, {
      type: 'other_event',
    } as never);
    expect(physicsApply).not.toHaveBeenCalled();
  });

  it('applies reflected velocity when mode=true', () => {
    const node = makeNode();
    const physicsApply = vi.fn();
    const ctx = {
      emit: vi.fn(),
      physics: { applyVelocity: physicsApply },
    };
    bounceHandler.onEvent!(node as never, { mode: true, bounce_factor: 0.8 } as never, ctx as never, {
      type: 'collision',
      data: {
        relativeVelocity: [0, -10, 0] as [number, number, number],
        normal: [0, 1, 0] as [number, number, number],
      },
    } as never);
    expect(physicsApply).toHaveBeenCalledOnce();
    // Reflected velocity: dot = -10, reflected y = (-10 - 2*(-10)*1)*0.8 = 10*0.8 = 8
    const applied = physicsApply.mock.calls[0][1] as [number, number, number];
    expect(applied[1]).toBeCloseTo(8, 5);
  });

  it('does NOT apply velocity when mode=false (disabled)', () => {
    const node = makeNode();
    const physicsApply = vi.fn();
    const ctx = {
      emit: vi.fn(),
      physics: { applyVelocity: physicsApply },
    };
    bounceHandler.onEvent!(node as never, { mode: false } as never, ctx as never, {
      type: 'collision',
      data: {
        relativeVelocity: [0, -5, 0] as [number, number, number],
        normal: [0, 1, 0] as [number, number, number],
      },
    } as never);
    expect(physicsApply).not.toHaveBeenCalled();
  });
});
