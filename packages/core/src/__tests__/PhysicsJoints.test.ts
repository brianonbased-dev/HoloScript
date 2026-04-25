import { describe, it, expect } from 'vitest';
import { JointSystem } from '@holoscript/engine/physics/JointSystem';
import { RagdollController } from '@holoscript/engine/physics/RagdollController';
import { ClothSim } from '@holoscript/engine/physics/ClothSim';

describe('Cycle 128: Physics Joints & Constraints', () => {
  // -------------------------------------------------------------------------
  // JointSystem
  // -------------------------------------------------------------------------

  it('should create joints and query by body', () => {
    const sys = new JointSystem();
    sys.createJoint('hinge', 'door', 'frame', { limits: { min: 0, max: Math.PI } });
    sys.createJoint('spring', 'chassis', 'wheel');

    expect(sys.getJointCount()).toBe(2);
    expect(sys.getJointsForBody('door')).toHaveLength(1);
  });

  it('should break joints when force exceeds threshold', () => {
    const sys = new JointSystem();
    const j = sys.createJoint('hinge', 'a', 'b', { breakForce: 10, stiffness: 100 });
    sys.setAngle(j.id, 5); // Huge angle → high force = 100*5 = 500 > 10
    sys.solve(1 / 60);

    expect(sys.getBrokenJoints()).toHaveLength(1);
  });

  it('should drive motor on hinge joints', () => {
    const sys = new JointSystem();
    const j = sys.createJoint('hinge', 'a', 'b');
    sys.setMotor(j.id, 2, 10); // speed=2, force=10
    sys.solve(1 / 60);

    const state = sys.getState(j.id)!;
    expect(state.currentAngle).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // RagdollController
  // -------------------------------------------------------------------------

  it('should simulate ragdoll with gravity', () => {
    const rag = new RagdollController();
    rag.addBone('hips', null, 5, 0.3);
    rag.addBone('spine', 'hips', 3, 0.4);
    rag.addBone('head', 'spine', 1, 0.2);

    rag.goRagdoll();
    const hipsBefore = rag.getBone('hips')!.position[1];
    rag.update(1 / 30);
    const hipsAfter = rag.getBone('hips')!.position[1];

    expect(hipsAfter).toBeLessThan(hipsBefore); // Gravity pulled down
    expect(rag.getBoneCount()).toBe(3);
  });

  it('should blend from active to ragdoll', () => {
    const rag = new RagdollController();
    rag.addBone('root', null, 5, 0.3);

    rag.startBlend(true);
    expect(rag.getState()).toBe('blending');
    expect(rag.getBlendFactor()).toBe(0);

    rag.update(0.3); // blendSpeed=2, 0.3*2=0.6
    expect(rag.getBlendFactor()).toBeCloseTo(0.6, 1);
  });

  // -------------------------------------------------------------------------
  // ClothSim
  // -------------------------------------------------------------------------

  it('should create cloth grid with constraints', () => {
    const cloth = new ClothSim();
    cloth.createGrid(5, 5, 1);

    expect(cloth.getParticleCount()).toBe(25);
    expect(cloth.getConstraintCount()).toBeGreaterThan(25);
    expect(cloth.getGridSize()).toEqual({ width: 5, height: 5 });
  });

  it('should simulate cloth falling under gravity', () => {
    const cloth = new ClothSim();
    cloth.createGrid(3, 3, 1);
    cloth.pinTopRow();

    const before = cloth.getParticle(6)![1]; // bottom middle
    cloth.update(1 / 30);
    cloth.update(1 / 30);
    const after = cloth.getParticle(6)![1];

    expect(after).toBeLessThan(before); // Fell
    expect(cloth.getParticle(0)!.pinned).toBe(true); // Top row stays pinned
  });

  it('should respond to wind force', () => {
    const cloth = new ClothSim();
    cloth.createGrid(3, 3, 1);
    cloth.pinTopRow();
    cloth.setWind(10, 0, 0);

    const before = cloth.getParticle(6)![0];
    cloth.update(1 / 30);
    cloth.update(1 / 30);
    const after = cloth.getParticle(6)![0];

    expect(after).toBeGreaterThan(before); // Wind pushed right
  });
});
