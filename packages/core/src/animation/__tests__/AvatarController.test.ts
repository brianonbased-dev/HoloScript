import { describe, it, expect, beforeEach } from 'vitest';
import { AvatarController } from '../AvatarController';
import { IKSolver } from '../IKSolver';
import { BoneSystem } from '../BoneSystem';
import type { AvatarInput } from '../AvatarController';

function makeInput(height = 1.7): AvatarInput {
  return {
    head: {
      position: { x: 0, y: height, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    leftHand: {
      position: { x: -0.3, y: 1, z: 0.3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    rightHand: {
      position: { x: 0.3, y: 1, z: 0.3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    height,
  };
}

describe('AvatarController', () => {
  let solver: IKSolver;
  let bones: BoneSystem;
  let controller: AvatarController;

  beforeEach(() => {
    solver = new IKSolver();
    bones = new BoneSystem();
    controller = new AvatarController(solver, bones);

    // Set up arm chains for the solver
    solver.addChain({
      id: 'leftArm',
      bones: [
        { id: 'lShoulder', position: { x: -0.2, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 0.3 },
        { id: 'lElbow', position: { x: -0.5, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 0.25 },
      ],
      target: { x: -0.3, y: 1, z: 0.3 },
      weight: 1,
      iterations: 10,
    });
    solver.addChain({
      id: 'rightArm',
      bones: [
        { id: 'rShoulder', position: { x: 0.2, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 0.3 },
        { id: 'rElbow', position: { x: 0.5, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length: 0.25 },
      ],
      target: { x: 0.3, y: 1, z: 0.3 },
      weight: 1,
      iterations: 10,
    });
  });

  it('construct without error', () => {
    expect(controller).toBeDefined();
  });

  it('calibrate enables updates', () => {
    controller.calibrate(1.75);
    // After calibration, update should proceed without error
    controller.update(makeInput(1.75));
    // Verify solver received target updates
    const left = solver.getChain('leftArm')!;
    expect(left.target.x).toBeCloseTo(-0.3);
  });

  it('update without calibration does nothing', () => {
    const left = solver.getChain('leftArm')!;
    const origTarget = { ...left.target };
    controller.update(makeInput());
    // Target should not have changed since calibrate wasn't called
    expect(left.target).toEqual(origTarget);
  });

  it('update sets arm targets from input', () => {
    controller.calibrate(1.7);
    const input = makeInput();
    input.rightHand.position = { x: 0.5, y: 1.2, z: 0.4 };
    controller.update(input);
    const right = solver.getChain('rightArm')!;
    expect(right.target.x).toBeCloseTo(0.5);
    expect(right.target.y).toBeCloseTo(1.2);
    expect(right.target.z).toBeCloseTo(0.4);
  });
});
