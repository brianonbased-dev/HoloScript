/**
 * AvatarController — Production Tests
 *
 * Tests: calibrate, update (before/after calibration), IKSolver target-setting,
 * bone-system hand bone retrieval, full chain solve.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarController } from '../AvatarController';
import type { AvatarInput } from '../AvatarController';
import { IKSolver } from '../IKSolver';
import { BoneSystem } from '../BoneSystem';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMockIKSolver(): IKSolver {
  return {
    setTarget: vi.fn(),
    solveAll: vi.fn(),
    getChains: vi.fn(() => []),
    addChain: vi.fn(),
    removeChain: vi.fn(),
  } as unknown as IKSolver;
}

function makeMockBoneSystem(): BoneSystem {
  return {
    getBone: vi.fn((name: string) => (name === 'LeftHand' ? { name } : null)),
    addBone: vi.fn(),
    removeBone: vi.fn(),
    update: vi.fn(),
  } as unknown as BoneSystem;
}

function makeInput(overrides: Partial<AvatarInput> = {}): AvatarInput {
  return {
    head: { position: { x: 0, y: 1.7, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    leftHand: { position: { x: -0.3, y: 1.2, z: -0.3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    rightHand: { position: { x: 0.3, y: 1.2, z: -0.3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    height: 1.7,
    ...overrides,
  };
}

// =============================================================================
// AvatarController construction
// =============================================================================

describe('AvatarController — construction', () => {
  it('constructs without throwing', () => {
    const solver = makeMockIKSolver();
    const bones = makeMockBoneSystem();
    expect(() => new AvatarController(solver, bones)).not.toThrow();
  });

  it('accepts any IKSolver and BoneSystem instances', () => {
    const solver = makeMockIKSolver();
    const bones = makeMockBoneSystem();
    const controller = new AvatarController(solver, bones);
    expect(controller).toBeInstanceOf(AvatarController);
  });
});

// =============================================================================
// calibrate()
// =============================================================================

describe('AvatarController.calibrate', () => {
  it('does not throw for a normal user height', () => {
    const controller = new AvatarController(makeMockIKSolver(), makeMockBoneSystem());
    expect(() => controller.calibrate(1.75)).not.toThrow();
  });

  it('does not throw for edge-case heights', () => {
    const controller = new AvatarController(makeMockIKSolver(), makeMockBoneSystem());
    expect(() => controller.calibrate(1.0)).not.toThrow();
    expect(() => controller.calibrate(2.2)).not.toThrow();
    expect(() => controller.calibrate(0)).not.toThrow();
  });

  it('can be called multiple times without error', () => {
    const controller = new AvatarController(makeMockIKSolver(), makeMockBoneSystem());
    controller.calibrate(1.7);
    controller.calibrate(1.8);
    controller.calibrate(1.6);
  });
});

// =============================================================================
// update() — before calibration
// =============================================================================

describe('AvatarController.update — before calibration', () => {
  it('does not throw when called before calibrate', () => {
    const solver = makeMockIKSolver();
    const bones = makeMockBoneSystem();
    const controller = new AvatarController(solver, bones);
    expect(() => controller.update(makeInput())).not.toThrow();
  });

  it('does NOT call solver.setTarget before calibration', () => {
    const solver = makeMockIKSolver();
    const bones = makeMockBoneSystem();
    const controller = new AvatarController(solver, bones);
    controller.update(makeInput());
    expect(solver.setTarget).not.toHaveBeenCalled();
  });

  it('does NOT call solver.solveAll before calibration', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.update(makeInput());
    expect(solver.solveAll).not.toHaveBeenCalled();
  });
});

// =============================================================================
// update() — after calibration
// =============================================================================

describe('AvatarController.update — after calibration', () => {
  it('calls solver.setTarget for leftArm with left hand position', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.calibrate(1.7);

    const input = makeInput({
      leftHand: { position: { x: -0.5, y: 1.0, z: 0.2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    controller.update(input);

    expect(solver.setTarget).toHaveBeenCalledWith('leftArm', -0.5, 1.0, 0.2);
  });

  it('calls solver.setTarget for rightArm with right hand position', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.calibrate(1.7);

    const input = makeInput({
      rightHand: { position: { x: 0.4, y: 0.9, z: -0.1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    controller.update(input);

    expect(solver.setTarget).toHaveBeenCalledWith('rightArm', 0.4, 0.9, -0.1);
  });

  it('calls solver.solveAll after setting targets', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.calibrate(1.7);
    controller.update(makeInput());

    expect(solver.solveAll).toHaveBeenCalledOnce();
  });

  it('calls getBone("LeftHand") to retrieve the left hand bone', () => {
    const bones = makeMockBoneSystem();
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, bones);
    controller.calibrate(1.7);
    controller.update(makeInput());

    expect(bones.getBone).toHaveBeenCalledWith('LeftHand');
  });

  it('does not throw when LeftHand bone is null', () => {
    const bones = makeMockBoneSystem();
    (bones.getBone as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, bones);
    controller.calibrate(1.7);
    expect(() => controller.update(makeInput())).not.toThrow();
  });

  it('calls setTarget exactly twice per update (left + right arm)', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.calibrate(1.7);
    controller.update(makeInput());
    expect(solver.setTarget).toHaveBeenCalledTimes(2);
  });

  it('each successive update calls solveAll once more', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.calibrate(1.7);

    controller.update(makeInput());
    controller.update(makeInput());
    controller.update(makeInput());

    expect(solver.solveAll).toHaveBeenCalledTimes(3);
  });

  it('tracks varying hand positions correctly across updates', () => {
    const solver = makeMockIKSolver();
    const controller = new AvatarController(solver, makeMockBoneSystem());
    controller.calibrate(1.7);

    const input1 = makeInput({
      leftHand: { position: { x: -0.1, y: 1.0, z: -0.3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    const input2 = makeInput({
      leftHand: { position: { x: -0.9, y: 0.5, z: 0.1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });

    controller.update(input1);
    controller.update(input2);

    // Second update call should pass second input's values
    const calls = (solver.setTarget as ReturnType<typeof vi.fn>).mock.calls;
    const secondLeftArmCall = calls.filter((c: any[]) => c[0] === 'leftArm')[1];
    expect(secondLeftArmCall).toEqual(['leftArm', -0.9, 0.5, 0.1]);
  });
});
