import type { Vector3 } from '../types';
import type { BoneDefinition, HumanoidBoneMap, SkeletonConfig } from './SkeletonTrait';
import type { TraitHandler } from './TraitTypes';

export type AutoRigRigType = 'humanoid' | 'custom';
export type AutoRigPose = 't-pose' | 'a-pose';
export type AutoRigTopology = 'animation-compatible' | 'provider-native';

export interface GeneratedMeshConfig {
  model?: string;
  provider?: string;
  description?: string;
  format?: 'glb' | 'gltf' | 'fbx' | 'obj' | string;
  generatedAt?: string;
  topology?: AutoRigTopology;
}

export interface AutoRigConfig {
  rig?: AutoRigRigType;
  pose?: AutoRigPose;
  sourceMesh?: string;
  topology?: AutoRigTopology;
  objectName?: string;
  provider?: string;
}

export interface NativeAutoRigPlan {
  rig: AutoRigRigType;
  pose: AutoRigPose;
  source: 'native-holoscript';
  topology: AutoRigTopology;
  skeleton: SkeletonConfig;
  boneCount: number;
  humanoidMap?: HumanoidBoneMap;
  animationCompatibility: {
    standard: string;
    retargetTargets: string[];
    bindPose: AutoRigPose;
  };
  weighting: {
    solver: 'heat-diffusion-seed' | 'custom-envelope-seed';
    maxInfluences: number;
    status: 'seeded';
  };
}

type BoneSpec = {
  name: string;
  parent?: string;
  position: Vector3;
  length: number;
};

const IDENTITY_ROTATION = [0, 0, 0, 1] as const;
const UNIT_SCALE: Vector3 = [1, 1, 1];

export const HOLOSCRIPT_HUMANOID_BONE_MAP: HumanoidBoneMap = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  leftShoulder: 'left_shoulder',
  leftUpperArm: 'left_upper_arm',
  leftLowerArm: 'left_lower_arm',
  leftHand: 'left_hand',
  rightShoulder: 'right_shoulder',
  rightUpperArm: 'right_upper_arm',
  rightLowerArm: 'right_lower_arm',
  rightHand: 'right_hand',
  leftUpperLeg: 'left_upper_leg',
  leftLowerLeg: 'left_lower_leg',
  leftFoot: 'left_foot',
  leftToes: 'left_toes',
  rightUpperLeg: 'right_upper_leg',
  rightLowerLeg: 'right_lower_leg',
  rightFoot: 'right_foot',
  rightToes: 'right_toes',
};

function armDrop(pose: AutoRigPose): number {
  return pose === 'a-pose' ? -0.08 : 0;
}

function createBone(spec: BoneSpec): BoneDefinition {
  return {
    name: spec.name,
    parent: spec.parent,
    bindPose: {
      position: spec.position,
      rotation: [...IDENTITY_ROTATION],
      scale: UNIT_SCALE,
    },
    length: spec.length,
  };
}

function createHumanoidBones(pose: AutoRigPose): BoneDefinition[] {
  const armY = armDrop(pose);
  return [
    createBone({ name: 'hips', position: [0, 0.95, 0], length: 0.12 }),
    createBone({ name: 'spine', parent: 'hips', position: [0, 0.13, 0], length: 0.13 }),
    createBone({ name: 'chest', parent: 'spine', position: [0, 0.18, 0], length: 0.18 }),
    createBone({ name: 'neck', parent: 'chest', position: [0, 0.14, 0], length: 0.08 }),
    createBone({ name: 'head', parent: 'neck', position: [0, 0.11, 0], length: 0.2 }),
    createBone({ name: 'left_shoulder', parent: 'chest', position: [0.12, 0.09, 0], length: 0.08 }),
    createBone({
      name: 'left_upper_arm',
      parent: 'left_shoulder',
      position: [0.2, armY, 0],
      length: 0.28,
    }),
    createBone({
      name: 'left_lower_arm',
      parent: 'left_upper_arm',
      position: [0.28, armY, 0],
      length: 0.26,
    }),
    createBone({
      name: 'left_hand',
      parent: 'left_lower_arm',
      position: [0.24, armY * 0.5, 0],
      length: 0.1,
    }),
    createBone({
      name: 'right_shoulder',
      parent: 'chest',
      position: [-0.12, 0.09, 0],
      length: 0.08,
    }),
    createBone({
      name: 'right_upper_arm',
      parent: 'right_shoulder',
      position: [-0.2, armY, 0],
      length: 0.28,
    }),
    createBone({
      name: 'right_lower_arm',
      parent: 'right_upper_arm',
      position: [-0.28, armY, 0],
      length: 0.26,
    }),
    createBone({
      name: 'right_hand',
      parent: 'right_lower_arm',
      position: [-0.24, armY * 0.5, 0],
      length: 0.1,
    }),
    createBone({ name: 'left_upper_leg', parent: 'hips', position: [0.09, -0.16, 0], length: 0.42 }),
    createBone({
      name: 'left_lower_leg',
      parent: 'left_upper_leg',
      position: [0, -0.42, 0],
      length: 0.42,
    }),
    createBone({
      name: 'left_foot',
      parent: 'left_lower_leg',
      position: [0, -0.38, 0.06],
      length: 0.2,
    }),
    createBone({ name: 'left_toes', parent: 'left_foot', position: [0, 0, 0.14], length: 0.08 }),
    createBone({
      name: 'right_upper_leg',
      parent: 'hips',
      position: [-0.09, -0.16, 0],
      length: 0.42,
    }),
    createBone({
      name: 'right_lower_leg',
      parent: 'right_upper_leg',
      position: [0, -0.42, 0],
      length: 0.42,
    }),
    createBone({
      name: 'right_foot',
      parent: 'right_lower_leg',
      position: [0, -0.38, 0.06],
      length: 0.2,
    }),
    createBone({ name: 'right_toes', parent: 'right_foot', position: [0, 0, 0.14], length: 0.08 }),
  ];
}

function createCustomBones(): BoneDefinition[] {
  return [
    createBone({ name: 'root', position: [0, 0, 0], length: 0 }),
    createBone({ name: 'center', parent: 'root', position: [0, 0.5, 0], length: 0.5 }),
    createBone({ name: 'top', parent: 'center', position: [0, 0.5, 0], length: 0.5 }),
    createBone({ name: 'left', parent: 'center', position: [0.35, 0, 0], length: 0.35 }),
    createBone({ name: 'right', parent: 'center', position: [-0.35, 0, 0], length: 0.35 }),
    createBone({ name: 'front', parent: 'center', position: [0, 0, 0.35], length: 0.35 }),
    createBone({ name: 'back', parent: 'center', position: [0, 0, -0.35], length: 0.35 }),
  ];
}

export function createNativeAutoRigPlan(config: AutoRigConfig = {}): NativeAutoRigPlan {
  const rig = config.rig ?? 'humanoid';
  const pose = config.pose ?? 't-pose';
  const bones = rig === 'humanoid' ? createHumanoidBones(pose) : createCustomBones();
  const humanoidMap = rig === 'humanoid' ? HOLOSCRIPT_HUMANOID_BONE_MAP : undefined;

  return {
    rig,
    pose,
    source: 'native-holoscript',
    topology: config.topology ?? 'animation-compatible',
    skeleton: {
      rigType: rig,
      bones,
      humanoidMap,
      defaultClip: 'idle',
      rootMotion: false,
    },
    boneCount: bones.length,
    humanoidMap,
    animationCompatibility: {
      standard: rig === 'humanoid' ? 'HoloScriptHumanoid21' : 'HoloScriptCustomEnvelope7',
      retargetTargets:
        rig === 'humanoid'
          ? ['VRM', 'Unity Humanoid', 'Unreal IK Retargeter', 'Mixamo-style clips']
          : ['HoloScript custom skeleton clips'],
      bindPose: pose,
    },
    weighting: {
      solver: rig === 'humanoid' ? 'heat-diffusion-seed' : 'custom-envelope-seed',
      maxInfluences: 4,
      status: 'seeded',
    },
  };
}

export const generatedMeshHandler: TraitHandler<GeneratedMeshConfig> = {
  name: 'generated_mesh',
  defaultConfig: {
    topology: 'provider-native',
  },
  onAttach(node, config, context) {
    node.__generatedMesh = {
      ...config,
      generatedAt: config.generatedAt ?? new Date(0).toISOString(),
    };
    context.emit?.('generated_mesh_attached', { node, config: node.__generatedMesh });
  },
  onDetach(node, _config, context) {
    delete node.__generatedMesh;
    context.emit?.('generated_mesh_detached', { node });
  },
};

export const autoRigHandler: TraitHandler<AutoRigConfig> = {
  name: 'auto_rig',
  defaultConfig: {
    rig: 'humanoid',
    pose: 't-pose',
    topology: 'animation-compatible',
  },
  onAttach(node, config, context) {
    const plan = createNativeAutoRigPlan(config);
    node.__autoRigPlan = plan;
    context.emit?.('auto_rig_bound', { node, plan });
    context.emit?.('skeleton_bind', {
      node,
      skeleton: plan.skeleton,
      source: plan.source,
      topology: plan.topology,
    });
  },
  onDetach(node, _config, context) {
    delete node.__autoRigPlan;
    context.emit?.('auto_rig_detached', { node });
  },
  onEvent(node, config, context, event) {
    if (event.type !== 'auto_rig:rebuild') return;
    const nextConfig = { ...config, ...(event.payload as Partial<AutoRigConfig> | undefined) };
    const plan = createNativeAutoRigPlan(nextConfig);
    node.__autoRigPlan = plan;
    context.emit?.('auto_rig_rebuilt', { node, plan });
  },
};
