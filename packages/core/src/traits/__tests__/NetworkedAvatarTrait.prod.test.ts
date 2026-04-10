/**
 * NetworkedAvatarTrait — Production Test Suite
 *
 * Dependencies mocked (all used with `new`):
 * - BoneSystem
 * - IKSolver
 * - AvatarController
 *
 * Key behaviours:
 * 1. defaultConfig — isLocal=false, updateRate=30
 * 2. onAttach:
 *   - creates __avatarState with bones/solver/controller
 *   - adds 7 bones to BoneSystem
 *   - adds 2 IK chains (leftArm, rightArm)
 *   - updateInterval = 1000/updateRate ms
 * 3. onDetach — removes __avatarState; no throw
 * 4. onUpdate — no-op when isLocal=false (no emit)
 * 5. onUpdate isLocal=true:
 *   - calls controller.calibrate and controller.update
 *   - emits 'avatar_pose_update' when interval elapsed (lastUpdate=0 initially)
 *   - does NOT emit if called again within interval
 * 6. onEvent 'network_pose_received' when isLocal=false:
 *   - calls bones.setLocalTransform for each bone in pose
 *   - calls bones.updateWorldTransforms
 * 7. onEvent 'network_pose_received' ignored when isLocal=true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies ────────────────────────────────────────────────────────
const _boneInstance = {
  addBone: vi.fn(),
  getBone: vi.fn(() => ({ local: { tx: 0, ty: 0, tz: 0 } })),
  getChain: vi.fn(() => ['LeftArm', 'LeftForeArm']),
  setLocalTransform: vi.fn(),
  updateWorldTransforms: vi.fn(),
};

const _solverInstance = {
  addChain: vi.fn(),
  solve: vi.fn(),
};

const _controllerInstance = {
  calibrate: vi.fn(),
  update: vi.fn(),
};

vi.mock('@holoscript/engine/animation/BoneSystem', () => {
  class BoneSystem {
    addBone = _boneInstance.addBone;
    getBone = _boneInstance.getBone;
    getChain = _boneInstance.getChain;
    setLocalTransform = _boneInstance.setLocalTransform;
    updateWorldTransforms = _boneInstance.updateWorldTransforms;
  }
  return { BoneSystem };
});

vi.mock('@holoscript/engine/animation/IKSolver', () => {
  class IKSolver {
    addChain = _solverInstance.addChain;
    solve = _solverInstance.solve;
  }
  return { IKSolver };
});

vi.mock('@holoscript/engine/animation/AvatarController', () => {
  class AvatarController {
    calibrate = _controllerInstance.calibrate;
    update = _controllerInstance.update;
  }
  return { AvatarController };
});

import { networkedAvatarHandler } from '../NetworkedAvatarTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode() {
  return { id: `avatar_${++_nodeId}` };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...networkedAvatarHandler.defaultConfig!, ...o };
}

function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  networkedAvatarHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) {
  return (node as any).__avatarState;
}

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('networkedAvatarHandler.defaultConfig', () => {
  it('isLocal = false', () => expect(networkedAvatarHandler.defaultConfig!.isLocal).toBe(false));
  it('updateRate = 30', () => expect(networkedAvatarHandler.defaultConfig!.updateRate).toBe(30));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('networkedAvatarHandler.onAttach', () => {
  it('creates __avatarState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('state has bones, solver, controller', () => {
    const { node } = attach();
    const s = getState(node);
    expect(s.bones).toBeDefined();
    expect(s.solver).toBeDefined();
    expect(s.controller).toBeDefined();
  });
  it('lastUpdate initialised to 0', () => {
    const { node } = attach();
    expect(getState(node).lastUpdate).toBe(0);
  });
  it('updateInterval = 1000 / updateRate', () => {
    const { node } = attach({ updateRate: 60 });
    expect(getState(node).updateInterval).toBeCloseTo(1000 / 60, 5);
  });
  it('adds 7 bones to BoneSystem', () => {
    attach();
    expect(_boneInstance.addBone).toHaveBeenCalledTimes(7);
  });
  it('adds 2 IK chains', () => {
    attach();
    expect(_solverInstance.addChain).toHaveBeenCalledTimes(2);
    const ids = _solverInstance.addChain.mock.calls.map((c: any) => c[0].id);
    expect(ids).toContain('leftArm');
    expect(ids).toContain('rightArm');
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('networkedAvatarHandler.onDetach', () => {
  it('removes __avatarState', () => {
    const { node, ctx, config } = attach();
    networkedAvatarHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() => networkedAvatarHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
  });
});

// ─── onUpdate isLocal=false ───────────────────────────────────────────────────
describe('networkedAvatarHandler.onUpdate (isLocal=false)', () => {
  it('does not call calibrate/update or emit', () => {
    const { node, ctx, config } = attach({ isLocal: false });
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(_controllerInstance.calibrate).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate isLocal=true ────────────────────────────────────────────────────
describe('networkedAvatarHandler.onUpdate (isLocal=true)', () => {
  it('calls controller.calibrate + controller.update', () => {
    const { node, ctx, config } = attach({ isLocal: true });
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(_controllerInstance.calibrate).toHaveBeenCalled();
    expect(_controllerInstance.update).toHaveBeenCalled();
  });

  it('emits avatar_pose_update when interval elapsed (lastUpdate=0)', () => {
    const { node, ctx, config } = attach({ isLocal: true, updateRate: 30 });
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'avatar_pose_update',
      expect.objectContaining({ pose: expect.any(Object) })
    );
  });

  it('does NOT emit on second call within interval', () => {
    const { node, ctx, config } = attach({ isLocal: true, updateRate: 30 });
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016); // emits, sets lastUpdate=now
    ctx.emit.mockClear();
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.001); // within 33ms interval
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits again after interval has elapsed', () => {
    const { node, ctx, config } = attach({ isLocal: true, updateRate: 1 }); // 1Hz = 1000ms interval
    // lastUpdate=0 → first call emits
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    ctx.emit.mockClear();
    // Set lastUpdate way in the past
    getState(node).lastUpdate = Date.now() - 2000;
    networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('avatar_pose_update', expect.anything());
  });
});

// ─── onEvent 'network_pose_received' ─────────────────────────────────────────
describe("networkedAvatarHandler.onEvent 'network_pose_received'", () => {
  it('applies bone transforms when isLocal=false', () => {
    const { node, ctx, config } = attach({ isLocal: false });
    const pose = { LeftArm: { tx: 1, ty: 2, tz: 0 } };
    networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
      pose,
    });
    expect(_boneInstance.setLocalTransform).toHaveBeenCalledWith('LeftArm', {
      tx: 1,
      ty: 2,
      tz: 0,
    });
    expect(_boneInstance.updateWorldTransforms).toHaveBeenCalled();
  });

  it('applies multiple bones', () => {
    const { node, ctx, config } = attach({ isLocal: false });
    const pose = {
      LeftArm: { tx: 1 },
      RightArm: { tx: -1 },
    };
    networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
      pose,
    });
    expect(_boneInstance.setLocalTransform).toHaveBeenCalledTimes(2);
  });

  it('no-op when isLocal=true', () => {
    const { node, ctx, config } = attach({ isLocal: true });
    vi.clearAllMocks();
    networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
      pose: { LeftArm: { tx: 1 } },
    });
    expect(_boneInstance.setLocalTransform).not.toHaveBeenCalled();
  });

  it('no-op when pose is falsy', () => {
    const { node, ctx, config } = attach({ isLocal: false });
    vi.clearAllMocks();
    networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
    });
    expect(_boneInstance.setLocalTransform).not.toHaveBeenCalled();
  });
});
