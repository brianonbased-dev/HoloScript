import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationTransitionSystem, BonePose } from '../animation/AnimationTransitions';

describe('AnimationTransitionSystem', () => {
  let sys: AnimationTransitionSystem;
  const pose: BonePose[] = [
    { boneId: 'hip', position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    { boneId: 'head', position: { x: 0, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  ];

  beforeEach(() => { sys = new AnimationTransitionSystem({ duration: 1, curve: 'linear' }); });

  it('starts anim-to-ragdoll transition', () => {
    sys.startAnimToRagdoll('e1', pose);
    expect(sys.isTransitioning('e1')).toBe(true);
    expect(sys.getBlendProgress('e1')).toBe(0);
  });

  it('starts ragdoll-to-anim transition', () => {
    sys.startRagdollToAnim('e1', pose);
    expect(sys.isTransitioning('e1')).toBe(true);
  });

  it('update advances progress', () => {
    sys.startAnimToRagdoll('e1', pose);
    const ragPoses = new Map([['e1', pose]]);
    const animPoses = new Map([['e1', pose]]);
    sys.update(0.5, ragPoses, animPoses);
    expect(sys.getBlendProgress('e1')).toBeCloseTo(0.5);
  });

  it('completes after duration', () => {
    sys.startAnimToRagdoll('e1', pose);
    sys.update(1.0, new Map(), new Map());
    expect(sys.isTransitioning('e1')).toBe(false);
    expect(sys.getBlendProgress('e1')).toBe(1);
  });

  it('blends positions between source and target', () => {
    const ragPose: BonePose[] = [
      { boneId: 'hip', position: { x: 10, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { boneId: 'head', position: { x: 10, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    sys.startAnimToRagdoll('e1', pose);
    const results = sys.update(0.5, new Map([['e1', ragPose]]), new Map([['e1', pose]]));
    const blended = results.get('e1')!;
    // Linear 50% from anim(0) → ragdoll(10) = 5
    expect(blended[0].position.x).toBeCloseTo(5, 1);
  });

  it('clearTransition removes blend', () => {
    sys.startAnimToRagdoll('e1', pose);
    sys.clearTransition('e1');
    expect(sys.isTransitioning('e1')).toBe(false);
  });

  it('getActiveTransitionCount tracks active blends', () => {
    sys.startAnimToRagdoll('e1', pose);
    sys.startRagdollToAnim('e2', pose);
    expect(sys.getActiveTransitionCount()).toBe(2);
    sys.update(1.0, new Map(), new Map());
    expect(sys.getActiveTransitionCount()).toBe(0);
  });

  it('unknown entity returns progress 0', () => {
    expect(sys.getBlendProgress('unknown')).toBe(0);
  });

  it('deep copies source pose to prevent mutation', () => {
    const mutablePose: BonePose[] = [
      { boneId: 'a', position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    sys.startAnimToRagdoll('e1', mutablePose);
    mutablePose[0].position.x = 999;
    // Internal source should be unaffected
    const results = sys.update(0, new Map(), new Map());
    const blended = results.get('e1')!;
    expect(blended[0].position.x).toBe(1);
  });

  it('ease_in_out curve applies correctly at edges', () => {
    const eased = new AnimationTransitionSystem({ duration: 1, curve: 'ease_in_out' });
    const ragPose: BonePose[] = [
      { boneId: 'hip', position: { x: 100, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    const animPose: BonePose[] = [
      { boneId: 'hip', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    eased.startAnimToRagdoll('e1', animPose);
    // At t=0.5, ease_in_out gives 0.5 → same as linear midpoint
    const results = eased.update(0.5, new Map([['e1', ragPose]]), new Map([['e1', animPose]]));
    const blended = results.get('e1')!;
    expect(blended[0].position.x).toBeCloseTo(50, 0);
  });

  it('nlerp normalizes rotation quaternion', () => {
    const rotPose: BonePose[] = [
      { boneId: 'hip', position: { x: 0, y: 0, z: 0 }, rotation: { x: 1, y: 0, z: 0, w: 0 } },
    ];
    sys.startAnimToRagdoll('e1', pose);
    const results = sys.update(0.5, new Map([['e1', rotPose]]), new Map([['e1', pose]]));
    const q = results.get('e1')![0].rotation;
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    expect(len).toBeCloseTo(1, 3);
  });
});
