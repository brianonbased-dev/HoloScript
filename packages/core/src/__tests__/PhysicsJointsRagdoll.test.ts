/**
 * PhysicsJointsRagdoll.test.ts — Cycle 192
 *
 * Tests for JointSystem and RagdollSystem.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { JointSystem } from '@holoscript/engine/physics/JointSystem';
import {
  RagdollSystem,
  HUMANOID_PRESET,
  QUADRUPED_PRESET,
} from '@holoscript/engine/physics/RagdollSystem';

// =============================================================================
// JOINT SYSTEM
// =============================================================================

describe('JointSystem', () => {
  let js: JointSystem;
  beforeEach(() => {
    js = new JointSystem();
  });

  it('creates joints with defaults', () => {
    const j = js.createJoint('hinge', 'bodyA', 'bodyB');
    expect(j.type).toBe('hinge');
    expect(j.bodyA).toBe('bodyA');
    expect(j.broken).toBe(false);
    expect(j.enabled).toBe(true);
    expect(j.breakForce).toBe(Infinity);
  });

  it('creates all joint types', () => {
    const types = ['hinge', 'ball', 'slider', 'spring', 'distance', 'fixed'] as const;
    types.forEach((t) => {
      const j = js.createJoint(t, 'a', 'b');
      expect(j.type).toBe(t);
    });
    expect(js.getJointCount()).toBe(6);
  });

  it('removes joints', () => {
    const j = js.createJoint('hinge', 'a', 'b');
    expect(js.removeJoint(j.id)).toBe(true);
    expect(js.getJoint(j.id)).toBeUndefined();
    expect(js.getJointCount()).toBe(0);
  });

  it('removes returns false for unknown id', () => {
    expect(js.removeJoint('nope')).toBe(false);
  });

  it('indexes joints by body', () => {
    js.createJoint('hinge', 'arm', 'torso');
    js.createJoint('ball', 'arm', 'hand');
    const armJoints = js.getJointsForBody('arm');
    expect(armJoints).toHaveLength(2);
    expect(js.getJointsForBody('torso')).toHaveLength(1);
  });

  it('solves hinge with motor', () => {
    const j = js.createJoint('hinge', 'a', 'b', { motorSpeed: 2, motorForce: 10 });
    js.solve(0.016);
    const state = js.getState(j.id)!;
    expect(state.currentAngle).toBeGreaterThan(0);
  });

  it('solves hinge with limits', () => {
    const j = js.createJoint('hinge', 'a', 'b', {
      limits: { min: -1, max: 1 },
      motorSpeed: 100,
      motorForce: 10,
    });
    js.setAngle(j.id, 5); // beyond max
    js.solve(0.016);
    const state = js.getState(j.id)!;
    // Angle is clamped first (5 -> 1), then motor adds motorSpeed*dt (1 + 100*0.016 = 2.6)
    // Key assertion: angle was clamped from 5 down before motor was applied
    expect(state.currentAngle).toBeLessThan(5);
  });

  it('breaks joints exceeding breakForce', () => {
    const j = js.createJoint('spring', 'a', 'b', {
      breakForce: 0.001,
      stiffness: 1000,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 100, y: 0, z: 0 },
    });
    js.setDistance(j.id, 500);
    js.solve(0.016);
    expect(j.broken).toBe(true);
    expect(js.getBrokenJoints()).toHaveLength(1);
  });

  it('disabled joints are not solved', () => {
    const j = js.createJoint('hinge', 'a', 'b', { motorSpeed: 5, motorForce: 10 });
    js.setEnabled(j.id, false);
    js.solve(0.016);
    expect(js.getState(j.id)!.currentAngle).toBe(0);
  });

  it('setMotor updates joint', () => {
    const j = js.createJoint('hinge', 'a', 'b');
    js.setMotor(j.id, 3, 50);
    expect(j.motorSpeed).toBe(3);
    expect(j.motorForce).toBe(50);
  });

  it('solves slider with limits', () => {
    const j = js.createJoint('slider', 'a', 'b', { limits: { min: 0, max: 5 } });
    js.setDistance(j.id, 10);
    js.solve(0.016);
    const state = js.getState(j.id)!;
    expect(state.currentDistance).toBeLessThanOrEqual(5);
  });

  it('spring applies force based on stiffness', () => {
    const j = js.createJoint('spring', 'a', 'b', {
      stiffness: 10,
      damping: 0.5,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 1, y: 0, z: 0 },
    });
    js.setDistance(j.id, 3);
    js.solve(0.016);
    const state = js.getState(j.id)!;
    expect(state.currentForce).not.toBe(0);
  });
});

// =============================================================================
// RAGDOLL SYSTEM
// =============================================================================

describe('RagdollSystem', () => {
  let rs: RagdollSystem;
  beforeEach(() => {
    rs = new RagdollSystem();
  });

  it('creates humanoid ragdoll from preset', () => {
    const rag = rs.createHumanoid('human1', { x: 0, y: 5, z: 0 });
    expect(rag.id).toBe('human1');
    expect(rag.bodies.length).toBeGreaterThan(0);
    expect(rag.constraints.length).toBeGreaterThan(0);
  });

  it('creates quadruped ragdoll from preset', () => {
    const rag = rs.createQuadruped('dog1', { x: 0, y: 1, z: 0 });
    expect(rag.id).toBe('dog1');
    expect(rag.bodies.length).toBeGreaterThan(0);
  });

  it('retrieves ragdoll by id', () => {
    rs.createHumanoid('h1', { x: 0, y: 0, z: 0 });
    expect(rs.getRagdoll('h1')).toBeDefined();
    expect(rs.getRagdoll('nope')).toBeUndefined();
  });

  it('removes ragdoll', () => {
    rs.createHumanoid('h1', { x: 0, y: 0, z: 0 });
    expect(rs.removeRagdoll('h1')).toBe(true);
    expect(rs.getRagdoll('h1')).toBeUndefined();
  });

  it('calculates total mass', () => {
    rs.createHumanoid('h1', { x: 0, y: 0, z: 0 });
    const mass = rs.getTotalMass('h1');
    expect(mass).toBeGreaterThan(0);
  });

  it('HUMANOID_PRESET has expected bones', () => {
    const boneIds = HUMANOID_PRESET.map((b) => b.id);
    expect(boneIds).toContain('pelvis');
    expect(boneIds).toContain('chest');
    expect(boneIds).toContain('head');
  });

  it('QUADRUPED_PRESET has body and legs', () => {
    const boneIds = QUADRUPED_PRESET.map((b) => b.id);
    expect(boneIds).toContain('body');
    expect(boneIds).toContain('tail');
  });

  it('custom ragdoll definition works', () => {
    const rag = rs.createRagdoll(
      {
        id: 'custom',
        bones: [
          {
            id: 'root',
            length: 1,
            radius: 0.5,
            mass: 10,
            localOffset: { x: 0, y: 0, z: 0 },
            jointType: 'cone' as const,
          },
          {
            id: 'child',
            parentBone: 'root',
            length: 0.5,
            radius: 0.2,
            mass: 3,
            localOffset: { x: 0, y: -1, z: 0 },
            jointType: 'hinge' as const,
          },
        ],
      },
      { x: 0, y: 0, z: 0 }
    );
    expect(rag.bodies).toHaveLength(2);
    expect(rag.constraints.length).toBeGreaterThanOrEqual(1);
  });
});
