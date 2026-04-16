/**
 * NetworkedAvatarTrait.ts
 *
 * Synchronizes avatar skeletal pose and IK targets over the network.
 * Uses WebRTCTransport for high-frequency low-latency updates.
 */

import type { TraitHandler } from './TraitTypes';
import { BoneSystem, BoneTransform } from '@holoscript/engine/animation/BoneSystem';
import { IKSolver } from '@holoscript/engine/animation/IKSolver';
import { AvatarController } from '@holoscript/engine/animation/AvatarController';

export interface NetworkedAvatarConfig {
  /** Peer ID of the avatar owner */
  ownerId?: string;
  /** Is this the local user's avatar? */
  isLocal: boolean;
  /** Update rate in Hz (default 30) */
  updateRate?: number;
}

export const networkedAvatarHandler: TraitHandler<NetworkedAvatarConfig> = {
  name: 'networked_avatar',

  defaultConfig: {
    isLocal: false,
    updateRate: 30,
  },

  onAttach(node, config, context) {
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
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }, // Placeholder
        {
          id: 'LeftForeArm',
          length: 0.3,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      target: { x: -0.5, y: 1.0, z: 0.3 },
      weight: 1.0,
      iterations: 3,
    });

    solver.addChain({
      id: 'rightArm',
      bones: [
        {
          id: 'RightArm',
          length: 0.3,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
        {
          id: 'RightForeArm',
          length: 0.3,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      ],
      target: { x: 0.5, y: 1.0, z: 0.3 },
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
        head: { position: [0, 1.7, 0], rotation: [0, 0, 0, 1 ] },
        leftHand: { position: [-0.3, 1.2, 0.4], rotation: [0, 0, 0, 1 ] },
        rightHand: { position: [0.3, 1.2, 0.4], rotation: [0, 0, 0, 1 ] },
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
