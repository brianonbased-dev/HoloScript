import { describe, it, expect, vi, beforeEach } from 'vitest';
import { networkedAvatarHandler } from '../traits/NetworkedAvatarTrait';
import { BoneSystem } from '../animation/BoneSystem';
import { IKSolver } from '../animation/IKSolver';

describe('Avatar System', () => {
  let mockNode: any;
  let mockContext: any;

  beforeEach(() => {
    mockNode = {};
    mockContext = {
      emit: vi.fn(),
    };
  });

  it('should initialize avatar state with bones and solver', () => {
    networkedAvatarHandler.onAttach(mockNode, { isLocal: true }, mockContext);

    const state = mockNode.__avatarState;
    expect(state).toBeDefined();
    expect(state.bones).toBeInstanceOf(BoneSystem);
    expect(state.solver).toBeInstanceOf(IKSolver);
    expect(state.controller).toBeDefined();
  });

  it('should setup default skeleton structure', () => {
    networkedAvatarHandler.onAttach(mockNode, { isLocal: true }, mockContext);
    const bones = mockNode.__avatarState.bones as BoneSystem;

    expect(bones.getBone('Hips')).toBeDefined();
    expect(bones.getBone('Spine')).toBeDefined();
    expect(bones.getBone('LeftArm')).toBeDefined();
  });

  it('should update local avatar and broadcast pose', () => {
    networkedAvatarHandler.onAttach(mockNode, { isLocal: true, updateRate: 60 }, mockContext);

    // Simulate update loop
    // Force enough time delta to trigger broadcast
    const state = mockNode.__avatarState;
    state.lastUpdate = 0;

    // Mock Date.now to ensure update triggers
    const realDateNow = Date.now;
    global.Date.now = () => 1000;

    networkedAvatarHandler.onUpdate(
      mockNode,
      { isLocal: true, updateRate: 60 },
      mockContext,
      0.016
    );

    // Restore Date.now
    global.Date.now = realDateNow;

    expect(mockContext.emit).toHaveBeenCalledWith(
      'avatar_pose_update',
      expect.objectContaining({
        node: mockNode,
        pose: expect.any(Object),
      })
    );
  });

  it('should apply received pose for remote avatar', () => {
    networkedAvatarHandler.onAttach(mockNode, { isLocal: false }, mockContext);
    const bones = mockNode.__avatarState.bones as BoneSystem;

    const mockPose = {
      LeftArm: { tx: 100, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, rw: 1, sx: 1, sy: 1, sz: 1 },
    };

    networkedAvatarHandler.onEvent(mockNode, { isLocal: false }, mockContext, {
      type: 'network_pose_received',
      pose: mockPose,
    });

    const arm = bones.getBone('LeftArm');
    expect(arm?.local.tx).toBe(100);
  });
});
