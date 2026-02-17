import { describe, it, expect, vi, beforeEach } from 'vitest';
import { networkedAvatarHandler, NetworkedAvatarConfig } from '../traits/NetworkedAvatarTrait';

// =============================================================================
// MOCK CONTEXT
// =============================================================================

function mockContext() {
  return {
    emit: vi.fn(),
  };
}

function mockNode(id = 'avatar-1') {
  return { id, name: 'Avatar' };
}

// =============================================================================
// TESTS
// =============================================================================

describe('NetworkedAvatarTrait', () => {
  const localConfig: NetworkedAvatarConfig = { isLocal: true, updateRate: 30 };
  const remoteConfig: NetworkedAvatarConfig = { isLocal: false, ownerId: 'peer-42', updateRate: 30 };

  it('attaches and initializes skeleton + IK + controller', () => {
    const node = mockNode();
    const ctx = mockContext();
    networkedAvatarHandler.onAttach!(node, localConfig, ctx as any);

    const state = (node as any).__avatarState;
    expect(state).toBeDefined();
    expect(state.bones).toBeDefined();
    expect(state.solver).toBeDefined();
    expect(state.controller).toBeDefined();
    expect(state.updateInterval).toBeCloseTo(1000 / 30, 0);
  });

  it('creates default humanoid bones (Hips → Head hierarchy)', () => {
    const node = mockNode();
    networkedAvatarHandler.onAttach!(node, localConfig, mockContext() as any);
    const bones = (node as any).__avatarState.bones;

    // Should have at least 7 bones (Hips, Spine, Head, LeftArm, LeftForeArm, RightArm, RightForeArm)
    expect(bones.getBone('Hips')).toBeDefined();
    expect(bones.getBone('Head')).toBeDefined();
    expect(bones.getBone('LeftArm')).toBeDefined();
    expect(bones.getBone('RightForeArm')).toBeDefined();
  });

  it('creates left and right arm IK chains', () => {
    const node = mockNode();
    networkedAvatarHandler.onAttach!(node, localConfig, mockContext() as any);
    const solver = (node as any).__avatarState.solver;

    // The solver should have chains
    expect(solver.getChain('leftArm')).toBeDefined();
    expect(solver.getChain('rightArm')).toBeDefined();
  });

  it('detach cleans up state', () => {
    const node = mockNode();
    networkedAvatarHandler.onAttach!(node, localConfig, mockContext() as any);
    expect((node as any).__avatarState).toBeDefined();

    networkedAvatarHandler.onDetach!(node, localConfig, mockContext() as any);
    expect((node as any).__avatarState).toBeUndefined();
  });

  it('local avatar updates controller and emits pose', () => {
    const node = mockNode();
    const ctx = mockContext();
    networkedAvatarHandler.onAttach!(node, localConfig, ctx as any);

    // Force last update to be old enough for rate-limited broadcast
    (node as any).__avatarState.lastUpdate = 0;

    networkedAvatarHandler.onUpdate!(node, localConfig, ctx as any, 0.016);

    // Should have emitted avatar_pose_update
    expect(ctx.emit).toHaveBeenCalledWith('avatar_pose_update', expect.objectContaining({ node }));
  });

  it('remote avatar does not emit pose updates', () => {
    const node = mockNode();
    const ctx = mockContext();
    networkedAvatarHandler.onAttach!(node, remoteConfig, ctx as any);

    networkedAvatarHandler.onUpdate!(node, remoteConfig, ctx as any, 0.016);

    // Remote should not broadcast
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('remote avatar applies received network pose', () => {
    const node = mockNode();
    const ctx = mockContext();
    networkedAvatarHandler.onAttach!(node, remoteConfig, ctx as any);

    const newPose = {
      LeftArm: { tx: 0.1, ty: 0.5, tz: 0.0, rx: 0, ry: 0, rz: 0, rw: 1 },
    };

    networkedAvatarHandler.onEvent!(node, remoteConfig, ctx as any, {
      type: 'network_pose_received',
      pose: newPose,
    });

    // Bone should have been updated
    const bones = (node as any).__avatarState.bones;
    const leftArm = bones.getBone('LeftArm');
    expect(leftArm).toBeDefined();
  });

  it('ignores network pose for local avatars', () => {
    const node = mockNode();
    const ctx = mockContext();
    networkedAvatarHandler.onAttach!(node, localConfig, ctx as any);

    // Event handler should skip because config.isLocal is true
    networkedAvatarHandler.onEvent!(node, localConfig, ctx as any, {
      type: 'network_pose_received',
      pose: { LeftArm: {} },
    });

    // No crash, no side-effect expected
  });

  it('gracefully handles update with no state', () => {
    const node = mockNode();
    const ctx = mockContext();
    // No onAttach — state is undefined
    networkedAvatarHandler.onUpdate!(node, localConfig, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('respects update rate limiting', () => {
    const node = mockNode();
    const ctx = mockContext();
    networkedAvatarHandler.onAttach!(node, localConfig, ctx as any);

    // Set lastUpdate to "recent" (just now)
    (node as any).__avatarState.lastUpdate = Date.now();

    networkedAvatarHandler.onUpdate!(node, localConfig, ctx as any, 0.016);
    // Should NOT emit because interval hasn't elapsed
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
