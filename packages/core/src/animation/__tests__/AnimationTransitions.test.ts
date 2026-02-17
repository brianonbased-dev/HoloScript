import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationTransitionSystem, type BonePose } from '../AnimationTransitions';

function pose(boneId: string, x: number, y: number, z: number): BonePose {
  return { boneId, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}

describe('AnimationTransitionSystem', () => {
  let sys: AnimationTransitionSystem;

  beforeEach(() => { sys = new AnimationTransitionSystem({ duration: 1, curve: 'linear' }); });

  // Start transitions
  it('startAnimToRagdoll creates transition', () => {
    sys.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    expect(sys.isTransitioning('e1')).toBe(true);
    expect(sys.getBlendProgress('e1')).toBe(0);
  });

  it('startRagdollToAnim creates transition', () => {
    sys.startRagdollToAnim('e1', [pose('root', 0, 0, 0)]);
    expect(sys.isTransitioning('e1')).toBe(true);
  });

  // Update
  it('update advances progress', () => {
    sys.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    const ragdoll = new Map([['e1', [pose('root', 10, 0, 0)]]]);
    const anim = new Map([['e1', [pose('root', 0, 0, 0)]]]);
    sys.update(0.5, ragdoll, anim);
    expect(sys.getBlendProgress('e1')).toBeCloseTo(0.5);
  });

  it('update returns blended pose', () => {
    sys.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    const ragdoll = new Map([['e1', [pose('root', 10, 0, 0)]]]);
    const anim = new Map([['e1', [pose('root', 0, 0, 0)]]]);
    const results = sys.update(0.5, ragdoll, anim);
    const blended = results.get('e1')!;
    expect(blended.length).toBe(1);
    expect(blended[0].position.x).toBeCloseTo(5);
  });

  it('transition completes at progress >= 1', () => {
    sys.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    const ragdoll = new Map([['e1', [pose('root', 10, 0, 0)]]]);
    const anim = new Map([['e1', [pose('root', 0, 0, 0)]]]);
    sys.update(1.0, ragdoll, anim);
    expect(sys.isTransitioning('e1')).toBe(false);
  });

  // Queries
  it('getBlendProgress returns 0 for unknown entity', () => {
    expect(sys.getBlendProgress('nope')).toBe(0);
  });

  it('isTransitioning returns false for unknown', () => {
    expect(sys.isTransitioning('nope')).toBe(false);
  });

  it('clearTransition removes blend', () => {
    sys.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    sys.clearTransition('e1');
    expect(sys.isTransitioning('e1')).toBe(false);
  });

  it('getActiveTransitionCount reflects active blends', () => {
    expect(sys.getActiveTransitionCount()).toBe(0);
    sys.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    sys.startRagdollToAnim('e2', [pose('root', 0, 0, 0)]);
    expect(sys.getActiveTransitionCount()).toBe(2);
  });

  // Ragdoll to anim direction
  it('ragdollToAnim blends toward animation', () => {
    sys.startRagdollToAnim('e1', [pose('root', 0, 0, 0)]);
    const ragdoll = new Map([['e1', [pose('root', 0, 0, 0)]]]);
    const anim = new Map([['e1', [pose('root', 10, 0, 0)]]]);
    const results = sys.update(1.0, ragdoll, anim);
    const blended = results.get('e1')!;
    expect(blended[0].position.x).toBeCloseTo(10);
  });

  // Ease curves
  it('ease_in curve starts slow', () => {
    const sys2 = new AnimationTransitionSystem({ duration: 1, curve: 'ease_in' });
    sys2.startAnimToRagdoll('e1', [pose('root', 0, 0, 0)]);
    const ragdoll = new Map([['e1', [pose('root', 10, 0, 0)]]]);
    const anim = new Map([['e1', [pose('root', 0, 0, 0)]]]);
    const results = sys2.update(0.5, ragdoll, anim);
    const blended = results.get('e1')!;
    expect(blended[0].position.x).toBeLessThan(5); // ease_in moves slower at start
  });
});
