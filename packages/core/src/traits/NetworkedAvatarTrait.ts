/**
 * NetworkedAvatarTrait.ts
 *
 * Synchronizes avatar skeletal pose and IK targets over the network.
 * Uses WebRTCTransport for high-frequency low-latency updates.
 */

import type { TraitHandler } from './TraitTypes';
import { avatarRenderAllowed } from './AvatarEmbodimentTrait';
import type { BoneTransform } from '@holoscript/engine/animation/BoneSystem';

// Lazy-loaded optional peer modules (@holoscript/engine is an optional peer dep)
let _boneSystemMod: typeof import('@holoscript/engine/animation/BoneSystem') | null = null;
let _ikSolverMod: typeof import('@holoscript/engine/animation/IKSolver') | null = null;
let _avatarControllerMod: typeof import('@holoscript/engine/animation/AvatarController') | null =
  null;

export interface NetworkedAvatarConfig {
  /** Peer ID of the avatar owner */
  ownerId?: string;
  /** Is this the local user's avatar? */
  isLocal: boolean;
  /** Update rate in Hz (default 30) */
  updateRate?: number;
  /** Session this avatar is broadcast in (scope of the tracked person's share grant). */
  sessionId?: string;
  /** Viewer ids that receive the broadcast (must be inside the granted audience). */
  audience?: string[];
}

export const networkedAvatarHandler: TraitHandler<NetworkedAvatarConfig> = {
  name: 'networked_avatar',

  defaultConfig: {
    isLocal: false,
    updateRate: 30,
  },

  async onAttach(node, config, context) {
    _boneSystemMod ??= await import('@holoscript/engine/animation/BoneSystem');
    _ikSolverMod ??= await import('@holoscript/engine/animation/IKSolver');
    _avatarControllerMod ??= await import('@holoscript/engine/animation/AvatarController');
    const { BoneSystem } = _boneSystemMod;
    const { IKSolver } = _ikSolverMod;
    const { AvatarController } = _avatarControllerMod;

    const bones = new BoneSystem();
    const solver = new IKSolver();
    const controller = new AvatarController(solver, bones);

    // Initialize Default Skeleton (Simplified Humanoid)
    bones.addBone('Hips', 'Hips', null, { ty: 1.0 });
    bones.addBone('Spine', 'Spine', 'Hips', { ty: 0.2 });
    bones.addBone('Head', 'Head', 'Spine', { ty: 0.3 });
    bones.addBone('LeftArm', 'LeftArm', 'Spine', { tx: -0.2, ty: 0.1 });
    bones.addBone('LeftForeArm', 'LeftForeArm', 'LeftArm', { ty: -0.3 });
    bones.addBone('RightArm', 'RightArm', 'Spine', { tx: 0.2, ty: 0.1 });
    bones.addBone('RightForeArm', 'RightForeArm', 'RightArm', { ty: -0.3 });

    // Initialize IK Chains
    solver.addChain({
      id: 'leftArm',
      bones: [
        {
          id: 'LeftArm',
          length: 0.3,
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }, // Placeholder
        {
          id: 'LeftForeArm',
          length: 0.3,
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      target: [-0.5, 1.0, 0.3],
      weight: 1.0,
      iterations: 3,
    });

    solver.addChain({
      id: 'rightArm',
      bones: [
        {
          id: 'RightArm',
          length: 0.3,
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
        {
          id: 'RightForeArm',
          length: 0.3,
          position: [0, 0, 0],
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      target: [0.5, 1.0, 0.3],
      weight: 1.0,
      iterations: 3,
    });

    const state = {
      bones,
      solver,
      controller,
      lastUpdate: 0,
      updateInterval: 1000 / (config.updateRate || 30),
    };

    node.__avatarState = state;
  },

  onDetach(node) {
    delete node.__avatarState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__avatarState;
    if (!state) return;

    if (config.isLocal) {
      // 1. Get Input (Mocked/Context)
      // In real scenario: const input = context.vr.getInput();
      const input = {
        head: { position: [0, 1.7, 0], rotation: [0, 0, 0, 1] },
        leftHand: { position: [-0.3, 1.2, 0.4], rotation: [0, 0, 0, 1] },
        rightHand: { position: [0.3, 1.2, 0.4], rotation: [0, 0, 0, 1] },
        height: 1.7,
      };

      // 2. Update Controller
      // @ts-expect-error
      state.controller.calibrate(1.7); // Auto-calibrate for now
      // @ts-expect-error
      state.controller.update(input);

      // 3. Broadcast Pose (Rate Limited)
      const now = Date.now();
      // @ts-expect-error
      if (now - state.lastUpdate > state.updateInterval) {
        // @ts-expect-error
        state.lastUpdate = now;

        // Collect Bone Transforms
        const transforms: Record<string, BoneTransform> = {};
        // @ts-expect-error
        state.bones.getChain('LeftForeArm').forEach((id: string) => {
          // Just syncing arms for demo
          // @ts-expect-error
          const bone = state.bones.getBone(id);
          if (bone) transforms[id] = bone.local;
        });

        // Trust hard requirement (POLICY.md §3): a local avatar's pose is live tracking. It leaves
        // the device only when avatarRenderAllowed(node, true, scope) says so: the tracked
        // person's own share grant for this session and audience plus the render_likeness yes
        // (and @consent_gate for real-person likeness). Otherwise others get the generic avatar
        // with generic motion: no live pose. Re-checked every frame, so a revoke bites next frame.
        const scope = { sessionId: config.sessionId, audience: config.audience ?? [], livePose: true };
        if (!avatarRenderAllowed(node, true, scope)) {
          // No node, no pose: only the generic flag and an opaque scene id (no likeness).
          context.emit('avatar_pose_update', genericAvatarPayload(node));
          return;
        }

        // Emit event to network layer
        context.emit('avatar_pose_update', {
          node,
          pose: transforms,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    if (!config.isLocal && event.type === 'network_pose_received') {
      const state = node.__avatarState;
      if (state && event.pose) {
        // Apply received pose
        Object.entries(event.pose).forEach(([boneId, transform]) => {
          // @ts-expect-error
          state.bones.setLocalTransform(boneId, transform as Partial<BoneTransform>);
        });
        // @ts-expect-error
        state.bones.updateWorldTransforms();
      }
    }
  },
};

/**
 * The only payload others get without the share grant: no node reference, no pose, no joints.
 * `avatarId` is the scene node id, which identifies the avatar slot, not a person's likeness.
 */
export function genericAvatarPayload(node: { id?: unknown }): { generic: true; avatarId: string | null } {
  return { generic: true, avatarId: typeof node.id === 'string' ? node.id : null };
}
