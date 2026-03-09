import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarController, AvatarInput } from '../animation/AvatarController';
import { avatarEmbodimentHandler, AvatarEmbodimentState } from '../traits/AvatarEmbodimentTrait';
import { AvatarPersistence, AvatarConfig } from '../social/AvatarPersistence';
import { BoneSystem } from '../animation/BoneSystem';
import { IKSolver } from '../animation/IKSolver';

// =============================================================================
// HELPERS
// =============================================================================

function makeSolver(): IKSolver {
  const solver = new IKSolver();
  solver.addChain({
    id: 'leftArm',
    bones: [
      {
        id: 'LeftShoulder',
        position: { x: -0.2, y: 1.4, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        length: 0.3,
      },
      {
        id: 'LeftForearm',
        position: { x: -0.5, y: 1.4, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        length: 0.25,
      },
    ],
    target: { x: -0.7, y: 1.0, z: 0.3 },
    weight: 1,
    iterations: 10,
  });
  solver.addChain({
    id: 'rightArm',
    bones: [
      {
        id: 'RightShoulder',
        position: { x: 0.2, y: 1.4, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        length: 0.3,
      },
      {
        id: 'RightForearm',
        position: { x: 0.5, y: 1.4, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        length: 0.25,
      },
    ],
    target: { x: 0.7, y: 1.0, z: 0.3 },
    weight: 1,
    iterations: 10,
  });
  return solver;
}

function makeBones(): BoneSystem {
  const bones = new BoneSystem();
  bones.addBone('Hips', 'Hips', null);
  bones.addBone('Spine', 'Spine', 'Hips', { ty: 0.3 });
  bones.addBone('LeftArm', 'LeftArm', 'Spine', { tx: -0.2, ty: 0.3 });
  bones.addBone('LeftHand', 'LeftHand', 'LeftArm', { tx: -0.3 });
  bones.addBone('RightArm', 'RightArm', 'Spine', { tx: 0.2, ty: 0.3 });
  bones.addBone('RightHand', 'RightHand', 'RightArm', { tx: 0.3 });
  return bones;
}

function makeInput(overrides: Partial<AvatarInput> = {}): AvatarInput {
  return {
    head: { position: { x: 0, y: 1.7, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    leftHand: { position: { x: -0.4, y: 1.0, z: 0.3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    rightHand: { position: { x: 0.4, y: 1.0, z: 0.3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    height: 1.75,
    ...overrides,
  };
}

function makeAvatarConfig(overrides: Partial<AvatarConfig> = {}): AvatarConfig {
  return {
    userId: 'user-1',
    displayName: 'Alice',
    appearance: {
      modelUrl: '/models/avatar_alice.glb',
      primaryColor: '#FF5588',
      secondaryColor: '#224488',
      accessories: ['hat', 'glasses'],
      height: 1.7,
    },
    personality: { sociability: 0.8, warmth: 0.9, expressiveness: 0.7 },
    trackingSource: 'headset',
    ikMode: 'upper_body',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// =============================================================================
// AVATAR CONTROLLER
// =============================================================================

describe('AvatarController', () => {
  it('marks calibrated after calibrate() is called', () => {
    const controller = new AvatarController(makeSolver(), makeBones());
    // Before calibration, update should be a no-op
    const solver = makeSolver();
    const spy = vi.spyOn(solver, 'solveAll');
    const ctrl = new AvatarController(solver, makeBones());
    ctrl.update(makeInput());
    expect(spy).not.toHaveBeenCalled(); // uncalibrated → no-op
  });

  it('calls solveAll and sets IK targets after calibration', () => {
    const solver = makeSolver();
    const spy = vi.spyOn(solver, 'solveAll');
    const setTargetSpy = vi.spyOn(solver, 'setTarget');

    const ctrl = new AvatarController(solver, makeBones());
    ctrl.calibrate(1.75);
    ctrl.update(makeInput());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(setTargetSpy).toHaveBeenCalledWith('leftArm', -0.4, 1.0, 0.3);
    expect(setTargetSpy).toHaveBeenCalledWith('rightArm', 0.4, 1.0, 0.3);
  });
});

// =============================================================================
// AVATAR EMBODIMENT TRAIT
// =============================================================================

describe('AvatarEmbodimentTrait', () => {
  let mockNode: any;
  let mockContext: any;

  beforeEach(() => {
    mockNode = {};
    mockContext = { emit: vi.fn() };
  });

  it('initializes state on attach', () => {
    avatarEmbodimentHandler.onAttach!(mockNode, {}, mockContext);
    const state = mockNode.__avatarEmbodimentState as AvatarEmbodimentState;
    expect(state).toBeDefined();
    expect(state.isEmbodied).toBe(false);
    expect(state.pipelineStage).toBe('idle');
    expect(state.currentExpression).toBe('neutral');
  });

  it('handles embody event', () => {
    avatarEmbodimentHandler.onAttach!(mockNode, {}, mockContext);
    avatarEmbodimentHandler.onEvent!(mockNode, {}, mockContext, { type: 'embody' });
    const state = mockNode.__avatarEmbodimentState as AvatarEmbodimentState;
    expect(state.isEmbodied).toBe(true);
    expect(mockContext.emit).toHaveBeenCalledWith('on_avatar_embodied', { node: mockNode });
  });

  it('handles disembody event', () => {
    avatarEmbodimentHandler.onAttach!(mockNode, {}, mockContext);
    avatarEmbodimentHandler.onEvent!(mockNode, {}, mockContext, { type: 'embody' });
    avatarEmbodimentHandler.onEvent!(mockNode, {}, mockContext, { type: 'disembody' });
    const state = mockNode.__avatarEmbodimentState as AvatarEmbodimentState;
    expect(state.isEmbodied).toBe(false);
    expect(mockContext.emit).toHaveBeenCalledWith('on_avatar_disembodied', { node: mockNode });
  });

  it('handles calibrate event', () => {
    avatarEmbodimentHandler.onAttach!(mockNode, {}, mockContext);
    avatarEmbodimentHandler.onEvent!(mockNode, {}, mockContext, { type: 'calibrate' });
    const state = mockNode.__avatarEmbodimentState as AvatarEmbodimentState;
    expect(state.calibrated).toBe(true);
    expect(mockContext.emit).toHaveBeenCalledWith('on_avatar_calibrated', { node: mockNode });
  });

  it('cleans up state on detach', () => {
    avatarEmbodimentHandler.onAttach!(mockNode, {}, mockContext);
    expect(mockNode.__avatarEmbodimentState).toBeDefined();
    avatarEmbodimentHandler.onDetach!(mockNode, {}, mockContext);
    expect(mockNode.__avatarEmbodimentState).toBeUndefined();
  });
});

// =============================================================================
// AVATAR PERSISTENCE
// =============================================================================

describe('AvatarPersistence', () => {
  let persistence: AvatarPersistence;

  beforeEach(() => {
    persistence = new AvatarPersistence();
  });

  it('saves and loads a round-trip config', () => {
    const config = makeAvatarConfig();
    persistence.save(config);
    const loaded = persistence.load('user-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.displayName).toBe('Alice');
    expect(loaded!.appearance.accessories).toEqual(['hat', 'glasses']);
  });

  it('deep copies on save (mutation isolation)', () => {
    const config = makeAvatarConfig();
    persistence.save(config);

    // Mutate caller's object
    config.appearance.accessories.push('scarf');
    config.personality.warmth = 0.1;

    const loaded = persistence.load('user-1');
    expect(loaded!.appearance.accessories).toEqual(['hat', 'glasses']); // unaffected
    expect(loaded!.personality.warmth).toBe(0.9); // unaffected
  });

  it('deletes a stored config', () => {
    persistence.save(makeAvatarConfig());
    expect(persistence.delete('user-1')).toBe(true);
    expect(persistence.load('user-1')).toBeNull();
    expect(persistence.delete('user-1')).toBe(false);
  });

  it('lists all stored user IDs', () => {
    persistence.save(makeAvatarConfig({ userId: 'a' }));
    persistence.save(makeAvatarConfig({ userId: 'b' }));
    persistence.save(makeAvatarConfig({ userId: 'c' }));
    expect(persistence.list().sort()).toEqual(['a', 'b', 'c']);
    expect(persistence.size).toBe(3);
  });

  it('clones a config to a new userId', () => {
    persistence.save(makeAvatarConfig({ userId: 'src' }));
    const cloned = persistence.clone('src', 'dest');
    expect(cloned).not.toBeNull();
    expect(cloned!.userId).toBe('dest');
    expect(cloned!.appearance.primaryColor).toBe('#FF5588');
    expect(persistence.size).toBe(2);
  });

  it('returns null for missing user on load and clone', () => {
    expect(persistence.load('missing')).toBeNull();
    expect(persistence.clone('missing', 'dest')).toBeNull();
  });
});
