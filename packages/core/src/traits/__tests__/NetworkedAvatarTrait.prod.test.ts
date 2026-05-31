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

async function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  await networkedAvatarHandler.onAttach!(node as any, config, ctx as any);
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
  it('creates __avatarState', async () => {
    const { node } = await attach();
    expect(getState(node)).toBeDefined();
  });
  it('state has bones, solver, controller', async () => {
    const { node } = await attach();
    const s = getState(node);
    expect(s.bones).toBeDefined();
    expect(s.solver).toBeDefined();
    expect(s.controller).toBeDefined();
  });
  it('lastUpdate initialised to 0', async () => {
    const { node } = await attach();
    expect(getState(node).lastUpdate).toBe(0);
  });
  it('updateInterval = 1000 / updateRate', async () => {
    const { node } = await attach({ updateRate: 60 });
    expect(getState(node).updateInterval).toBeCloseTo(1000 / 60, 5);
  });
  it('adds 7 bones to BoneSystem', async () => {
    await attach();
    expect(_boneInstance.addBone).toHaveBeenCalledTimes(7);
  });
  it('adds 2 IK chains', async () => {
    await attach();
    expect(_solverInstance.addChain).toHaveBeenCalledTimes(2);
    const ids = _solverInstance.addChain.mock.calls.map((c: any) => c[0].id);
    expect(ids).toContain('leftArm');
    expect(ids).toContain('rightArm');
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('networkedAvatarHandler.onDetach', () => {
  it('removes __avatarState', async () => {
    const { node, ctx, config } = await attach();
    await networkedAvatarHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('does not throw', async () => {
    const { node, ctx, config } = await attach();
    await expect(
      Promise.resolve(networkedAvatarHandler.onDetach!(node as any, config, ctx as any))
    ).resolves.not.toThrow();
  });
});

// ─── onUpdate isLocal=false ───────────────────────────────────────────────────
describe('networkedAvatarHandler.onUpdate (isLocal=false)', () => {
  it('does not call calibrate/update or emit', async () => {
    const { node, ctx, config } = await attach({ isLocal: false });
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(_controllerInstance.calibrate).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate isLocal=true ────────────────────────────────────────────────────
describe('networkedAvatarHandler.onUpdate (isLocal=true)', () => {
  it('calls controller.calibrate + controller.update', async () => {
    const { node, ctx, config } = await attach({ isLocal: true });
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(_controllerInstance.calibrate).toHaveBeenCalled();
    expect(_controllerInstance.update).toHaveBeenCalled();
  });

  it('emits avatar_pose_update when interval elapsed (lastUpdate=0)', async () => {
    const { node, ctx, config } = await attach({ isLocal: true, updateRate: 30 });
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'avatar_pose_update',
      expect.objectContaining({ pose: expect.any(Object) })
    );
  });

  it('does NOT emit on second call within interval', async () => {
    const { node, ctx, config } = await attach({ isLocal: true, updateRate: 30 });
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016); // emits, sets lastUpdate=now
    ctx.emit.mockClear();
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.001); // within 33ms interval
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits again after interval has elapsed', async () => {
    const { node, ctx, config } = await attach({ isLocal: true, updateRate: 1 }); // 1Hz = 1000ms interval
    // lastUpdate=0 → first call emits
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    ctx.emit.mockClear();
    // Set lastUpdate way in the past
    getState(node).lastUpdate = Date.now() - 2000;
    await networkedAvatarHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('avatar_pose_update', expect.anything());
  });
});

// ─── onEvent 'network_pose_received' ─────────────────────────────────────────
describe("networkedAvatarHandler.onEvent 'network_pose_received'", () => {
  it('applies bone transforms when isLocal=false', async () => {
    const { node, ctx, config } = await attach({ isLocal: false });
    const pose = { LeftArm: { tx: 1, ty: 2, tz: 0 } };
    await networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
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

  it('applies multiple bones', async () => {
    const { node, ctx, config } = await attach({ isLocal: false });
    const pose = {
      LeftArm: { tx: 1 },
      RightArm: { tx: -1 },
    };
    await networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
      pose,
    });
    expect(_boneInstance.setLocalTransform).toHaveBeenCalledTimes(2);
  });

  it('no-op when isLocal=true', async () => {
    const { node, ctx, config } = await attach({ isLocal: true });
    vi.clearAllMocks();
    await networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
      pose: { LeftArm: { tx: 1 } },
    });
    expect(_boneInstance.setLocalTransform).not.toHaveBeenCalled();
  });

  it('no-op when pose is falsy', async () => {
    const { node, ctx, config } = await attach({ isLocal: false });
    vi.clearAllMocks();
    await networkedAvatarHandler.onEvent!(node as any, config, ctx as any, {
      type: 'network_pose_received',
    });
    expect(_boneInstance.setLocalTransform).not.toHaveBeenCalled();
  });
});
