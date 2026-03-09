import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock BoneSystem, IKSolver, AvatarController
vi.mock('../../animation/BoneSystem', () => ({
  BoneSystem: class MockBoneSystem {
    bones = new Map();
    addBone = vi.fn();
    getBone = vi.fn().mockReturnValue({ local: { tx: 0, ty: 0, tz: 0 } });
    getChain = vi.fn().mockReturnValue(['LeftArm', 'LeftForeArm']);
    setLocalTransform = vi.fn();
    updateWorldTransforms = vi.fn();
  },
}));

vi.mock('../../animation/IKSolver', () => ({
  IKSolver: class MockIKSolver {
    chains = new Map();
    addChain = vi.fn();
    solve = vi.fn();
  },
}));

vi.mock('../../animation/AvatarController', () => ({
  AvatarController: class MockAvatarController {
    constructor() {}
    calibrate = vi.fn();
    update = vi.fn();
  },
}));

import { networkedAvatarHandler } from '../NetworkedAvatarTrait';

describe('NetworkedAvatarTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = { isLocal: true, updateRate: 30 };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('avatar1');
    ctx = createMockContext();
    attachTrait(networkedAvatarHandler, node, cfg, ctx);
  });

  it('initializes avatar state on attach', () => {
    const s = (node as any).__avatarState;
    expect(s).toBeDefined();
    expect(s.bones).toBeDefined();
    expect(s.solver).toBeDefined();
    expect(s.controller).toBeDefined();
  });

  it('sets up bone skeleton with addBone calls', () => {
    const s = (node as any).__avatarState;
    expect(s.bones.addBone).toHaveBeenCalled();
  });

  it('sets up IK chains with addChain', () => {
    const s = (node as any).__avatarState;
    expect(s.solver.addChain).toHaveBeenCalled();
  });

  it('configures update interval from updateRate', () => {
    const s = (node as any).__avatarState;
    expect(s.updateInterval).toBeCloseTo(1000 / 30, 0);
  });

  it('cleans up on detach', () => {
    networkedAvatarHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__avatarState).toBeUndefined();
  });

  it('calls controller.update for local avatar on update', () => {
    updateTrait(networkedAvatarHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__avatarState;
    expect(s.controller.update).toHaveBeenCalled();
  });

  it('calibrates controller for local avatar', () => {
    updateTrait(networkedAvatarHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__avatarState;
    expect(s.controller.calibrate).toHaveBeenCalledWith(1.7);
  });

  it('does not update controller for remote avatar', () => {
    const remoteCfg = { isLocal: false, updateRate: 30 };
    const remoteNode = createMockNode('remote');
    attachTrait(networkedAvatarHandler, remoteNode, remoteCfg, ctx);
    updateTrait(networkedAvatarHandler, remoteNode, remoteCfg, ctx, 0.016);
    const s = (remoteNode as any).__avatarState;
    expect(s.controller.update).not.toHaveBeenCalled();
  });

  it('handles network_pose_received for remote avatar', () => {
    const remoteCfg = { isLocal: false, updateRate: 30 };
    const remoteNode = createMockNode('remote');
    attachTrait(networkedAvatarHandler, remoteNode, remoteCfg, ctx);
    sendEvent(networkedAvatarHandler, remoteNode, remoteCfg, ctx, {
      type: 'network_pose_received',
      pose: { LeftArm: { tx: 1 } },
    });
    const s = (remoteNode as any).__avatarState;
    expect(s.bones.setLocalTransform).toHaveBeenCalled();
    expect(s.bones.updateWorldTransforms).toHaveBeenCalled();
  });

  it('has correct handler name', () => {
    expect(networkedAvatarHandler.name).toBe('networked_avatar');
  });

  it('has correct default config', () => {
    expect((networkedAvatarHandler.defaultConfig as any).isLocal).toBe(false);
    expect((networkedAvatarHandler.defaultConfig as any).updateRate).toBe(30);
  });
});
