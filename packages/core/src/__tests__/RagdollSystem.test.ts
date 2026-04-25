import { describe, it, expect, beforeEach } from 'vitest';
import {
  RagdollSystem,
  HUMANOID_PRESET,
  QUADRUPED_PRESET,
} from '@holoscript/engine/physics/RagdollSystem';

describe('RagdollSystem', () => {
  let sys: RagdollSystem;

  beforeEach(() => {
    sys = new RagdollSystem();
  });

  it('createHumanoid creates ragdoll with correct bone count', () => {
    const rd = sys.createHumanoid('human1', [0, 10, 0]);
    expect(rd.bodies.length).toBe(HUMANOID_PRESET.length);
    expect(rd.id).toBe('human1');
  });

  it('createHumanoid creates constraints for each child bone', () => {
    const rd = sys.createHumanoid('human1', [0, 10, 0]);
    const childBones = HUMANOID_PRESET.filter((b) => b.parentBone);
    expect(rd.constraints.length).toBe(childBones.length);
  });

  it('createQuadruped creates ragdoll with quadruped bones', () => {
    const rd = sys.createQuadruped('dog1', [0, 5, 0]);
    expect(rd.bodies.length).toBe(QUADRUPED_PRESET.length);
  });

  it('getRagdoll retrieves created ragdoll', () => {
    sys.createHumanoid('human1', [0, 0, 0]);
    expect(sys.getRagdoll('human1')).toBeDefined();
    expect(sys.getRagdoll('ghost')).toBeUndefined();
  });

  it('removeRagdoll deletes ragdoll', () => {
    sys.createHumanoid('human1', [0, 0, 0]);
    expect(sys.removeRagdoll('human1')).toBe(true);
    expect(sys.getRagdoll('human1')).toBeUndefined();
  });

  it('getTotalMass sums all bone masses', () => {
    sys.createHumanoid('human1', [0, 0, 0]);
    const expectedMass = HUMANOID_PRESET.reduce((s, b) => s + b.mass, 0);
    expect(sys.getTotalMass('human1')).toBeCloseTo(expectedMass);
  });

  it('getTotalMass returns 0 for unknown ragdoll', () => {
    expect(sys.getTotalMass('nope')).toBe(0);
  });

  it('bodies have capsule shapes with correct dimensions', () => {
    const rd = sys.createHumanoid('human1', [0, 0, 0]);
    const pelvisBody = rd.bodies.find((b) => b.id === 'human1_pelvis')!;
    expect(pelvisBody.shape.type).toBe('capsule');
    expect(pelvisBody.shape.radius).toBe(0.12);
    expect(pelvisBody.shape.height).toBe(0.25);
  });

  it('constraints reference correct body IDs', () => {
    const rd = sys.createHumanoid('human1', [0, 0, 0]);
    const spineConstraint = rd.constraints.find((c) => c.id.includes('pelvis_spine'));
    expect(spineConstraint).toBeDefined();
    expect(spineConstraint!.bodyA).toBe('human1_pelvis');
    expect(spineConstraint!.bodyB).toBe('human1_spine');
  });

  it('hinge constraints have limits from bone definition', () => {
    const rd = sys.createHumanoid('human1', [0, 0, 0]);
    const elbowConstraint = rd.constraints.find((c) => c.id.includes('l_upper_arm_l_forearm'));
    expect(elbowConstraint!.type).toBe('hinge');
    expect((elbowConstraint as any).limits.low).toBe(0);
    expect((elbowConstraint as any).limits.high).toBe(2.5);
  });

  it('rootPosition is stored on the instance', () => {
    const rd = sys.createHumanoid('human1', [5, 10, 15]);
    expect(rd.rootPosition).toEqual([5, 10, 15]);
  });
});
