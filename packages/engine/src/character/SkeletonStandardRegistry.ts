/**
 * SkeletonStandardRegistry.ts
 *
 * Explicit profile registry for all humanoid skeleton standards supported
 * by HoloScript. Each profile formalises the implicit bone-name map that
 * previously lived scattered across HumanoidSkeleton.ts, HumanoidLoader.ts,
 * and MixamoRetargeter.ts into a single, queryable, versioned record.
 *
 * Gap addressed: G1 from research/2026-04-28_holo-skeleton-gap.md
 *
 * Design:
 *   - CANONICAL = HoloScript's own 65-bone HumanoidBoneName set
 *   - Each profile maps CANONICAL names → platform-specific names (partial)
 *   - mappingConfidence reflects how complete / battle-tested the mapping is
 *   - Profiles are immutable objects; the registry is a plain Record
 *
 * Usage:
 *   import { SKELETON_PROFILES, resolveProfileBone, matchSkeletonStandard }
 *     from '@holoscript/engine/character/SkeletonStandardRegistry';
 *
 * @module character
 * @see HumanoidSkeleton.ts for bone name definitions
 */

import type { HumanoidBoneName } from './HumanoidSkeleton';

// =============================================================================
// Profile identifiers
// =============================================================================

export type SkeletonStandardId =
  | 'vrm1'
  | 'vrm0'
  | 'rpm'
  | 'mixamo'
  | 'ue_mannequin'
  | 'metahuman'
  | 'daz_genesis8'
  | 'daz_genesis9'
  | 'autorig_pro'
  | 'cc3'
  | 'holoscript_65';

// =============================================================================
// Profile shape
// =============================================================================

export interface SkeletonBoneEntry {
  /** Platform-specific bone name for this canonical bone. */
  platformName: string;
  /**
   * Optional human-readable note (e.g. version difference, known quirk).
   */
  note?: string;
}

export interface SkeletonStandardProfile {
  /** Stable identifier used in AssetMetadata.skeletonStandard. */
  id: SkeletonStandardId;
  /** Human-readable display name. */
  displayName: string;
  /**
   * Semantic version of this profile definition. Increment minor on mapping
   * additions, major on breaking renames.
   */
  version: string;
  /**
   * Mapping confidence: 0.0–1.0.
   *   1.0 = spec-derived, fully round-tripped with real assets
   *   0.8 = community-confirmed, mostly complete
   *   0.6 = partially mapped or reverse-engineered
   */
  mappingConfidence: number;
  /**
   * Subset of HumanoidBoneNames mapped to this standard's platform names.
   * Partial — not every canonical bone needs a counterpart.
   */
  boneMap: Partial<Record<HumanoidBoneName, SkeletonBoneEntry>>;
  /**
   * Bones that exist in this standard but have no canonical equivalent.
   * Informational only; retargeting skips them.
   */
  unmappedPlatformBones?: string[];
  /** URL to the authoritative specification, if public. */
  specUrl?: string;
}

// =============================================================================
// Profile definitions
// =============================================================================

/** HoloScript canonical 65-bone skeleton — identity mapping. */
const holoscript65Profile: SkeletonStandardProfile = {
  id: 'holoscript_65',
  displayName: 'HoloScript 65-bone Canonical',
  version: '1.0.0',
  mappingConfidence: 1.0,
  boneMap: {
    root: { platformName: 'root' },
    hips: { platformName: 'hips' },
    spine: { platformName: 'spine' },
    spine1: { platformName: 'spine1' },
    spine2: { platformName: 'spine2' },
    neck: { platformName: 'neck' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'left_shoulder' },
    left_upper_arm: { platformName: 'left_upper_arm' },
    left_forearm: { platformName: 'left_forearm' },
    left_hand: { platformName: 'left_hand' },
    right_shoulder: { platformName: 'right_shoulder' },
    right_upper_arm: { platformName: 'right_upper_arm' },
    right_forearm: { platformName: 'right_forearm' },
    right_hand: { platformName: 'right_hand' },
    left_upper_leg: { platformName: 'left_upper_leg' },
    left_lower_leg: { platformName: 'left_lower_leg' },
    left_foot: { platformName: 'left_foot' },
    left_toes: { platformName: 'left_toes' },
    right_upper_leg: { platformName: 'right_upper_leg' },
    right_lower_leg: { platformName: 'right_lower_leg' },
    right_foot: { platformName: 'right_foot' },
    right_toes: { platformName: 'right_toes' },
    // fingers
    left_thumb_proximal: { platformName: 'left_thumb_proximal' },
    left_thumb_intermediate: { platformName: 'left_thumb_intermediate' },
    left_thumb_distal: { platformName: 'left_thumb_distal' },
    left_index_proximal: { platformName: 'left_index_proximal' },
    left_index_intermediate: { platformName: 'left_index_intermediate' },
    left_index_distal: { platformName: 'left_index_distal' },
    left_middle_proximal: { platformName: 'left_middle_proximal' },
    left_middle_intermediate: { platformName: 'left_middle_intermediate' },
    left_middle_distal: { platformName: 'left_middle_distal' },
    left_ring_proximal: { platformName: 'left_ring_proximal' },
    left_ring_intermediate: { platformName: 'left_ring_intermediate' },
    left_ring_distal: { platformName: 'left_ring_distal' },
    left_pinky_proximal: { platformName: 'left_pinky_proximal' },
    left_pinky_intermediate: { platformName: 'left_pinky_intermediate' },
    left_pinky_distal: { platformName: 'left_pinky_distal' },
    right_thumb_proximal: { platformName: 'right_thumb_proximal' },
    right_thumb_intermediate: { platformName: 'right_thumb_intermediate' },
    right_thumb_distal: { platformName: 'right_thumb_distal' },
    right_index_proximal: { platformName: 'right_index_proximal' },
    right_index_intermediate: { platformName: 'right_index_intermediate' },
    right_index_distal: { platformName: 'right_index_distal' },
    right_middle_proximal: { platformName: 'right_middle_proximal' },
    right_middle_intermediate: { platformName: 'right_middle_intermediate' },
    right_middle_distal: { platformName: 'right_middle_distal' },
    right_ring_proximal: { platformName: 'right_ring_proximal' },
    right_ring_intermediate: { platformName: 'right_ring_intermediate' },
    right_ring_distal: { platformName: 'right_ring_distal' },
    right_pinky_proximal: { platformName: 'right_pinky_proximal' },
    right_pinky_intermediate: { platformName: 'right_pinky_intermediate' },
    right_pinky_distal: { platformName: 'right_pinky_distal' },
    left_toe_end: { platformName: 'left_toe_end' },
    right_toe_end: { platformName: 'right_toe_end' },
  },
};

/** VRM 1.0 (pixiv spec) — derived from VRM_BONE_MAP in HumanoidSkeleton.ts. */
const vrm1Profile: SkeletonStandardProfile = {
  id: 'vrm1',
  displayName: 'VRM 1.0',
  version: '1.0.0',
  mappingConfidence: 1.0,
  specUrl: 'https://vrm.dev/en/univrm/humanoid/humanoid_bone_mapping/',
  boneMap: {
    hips: { platformName: 'hips' },
    spine: { platformName: 'spine' },
    spine2: { platformName: 'chest', note: 'VRM has no spine1 — spine2 maps to chest' },
    neck: { platformName: 'neck' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'leftShoulder' },
    left_upper_arm: { platformName: 'leftUpperArm' },
    left_forearm: { platformName: 'leftLowerArm' },
    left_hand: { platformName: 'leftHand' },
    right_shoulder: { platformName: 'rightShoulder' },
    right_upper_arm: { platformName: 'rightUpperArm' },
    right_forearm: { platformName: 'rightLowerArm' },
    right_hand: { platformName: 'rightHand' },
    left_upper_leg: { platformName: 'leftUpperLeg' },
    left_lower_leg: { platformName: 'leftLowerLeg' },
    left_foot: { platformName: 'leftFoot' },
    left_toes: { platformName: 'leftToes' },
    right_upper_leg: { platformName: 'rightUpperLeg' },
    right_lower_leg: { platformName: 'rightLowerLeg' },
    right_foot: { platformName: 'rightFoot' },
    right_toes: { platformName: 'rightToes' },
    // VRM 1.0 finger names
    left_thumb_proximal: { platformName: 'leftThumbProximal' },
    left_thumb_intermediate: { platformName: 'leftThumbIntermediate' },
    left_thumb_distal: { platformName: 'leftThumbDistal' },
    left_index_proximal: { platformName: 'leftIndexProximal' },
    left_index_intermediate: { platformName: 'leftIndexIntermediate' },
    left_index_distal: { platformName: 'leftIndexDistal' },
    left_middle_proximal: { platformName: 'leftMiddleProximal' },
    left_middle_intermediate: { platformName: 'leftMiddleIntermediate' },
    left_middle_distal: { platformName: 'leftMiddleDistal' },
    left_ring_proximal: { platformName: 'leftRingProximal' },
    left_ring_intermediate: { platformName: 'leftRingIntermediate' },
    left_ring_distal: { platformName: 'leftRingDistal' },
    left_pinky_proximal: { platformName: 'leftLittleProximal' },
    left_pinky_intermediate: { platformName: 'leftLittleIntermediate' },
    left_pinky_distal: { platformName: 'leftLittleDistal' },
    right_thumb_proximal: { platformName: 'rightThumbProximal' },
    right_thumb_intermediate: { platformName: 'rightThumbIntermediate' },
    right_thumb_distal: { platformName: 'rightThumbDistal' },
    right_index_proximal: { platformName: 'rightIndexProximal' },
    right_index_intermediate: { platformName: 'rightIndexIntermediate' },
    right_index_distal: { platformName: 'rightIndexDistal' },
    right_middle_proximal: { platformName: 'rightMiddleProximal' },
    right_middle_intermediate: { platformName: 'rightMiddleIntermediate' },
    right_middle_distal: { platformName: 'rightMiddleDistal' },
    right_ring_proximal: { platformName: 'rightRingProximal' },
    right_ring_intermediate: { platformName: 'rightRingIntermediate' },
    right_ring_distal: { platformName: 'rightRingDistal' },
    right_pinky_proximal: { platformName: 'rightLittleProximal' },
    right_pinky_intermediate: { platformName: 'rightLittleIntermediate' },
    right_pinky_distal: { platformName: 'rightLittleDistal' },
  },
  unmappedPlatformBones: ['leftEye', 'rightEye', 'jaw', 'upperChest'],
};

/** VRM 0.x legacy (pre-1.0 pixiv format). */
const vrm0Profile: SkeletonStandardProfile = {
  id: 'vrm0',
  displayName: 'VRM 0.x (legacy)',
  version: '1.0.0',
  mappingConfidence: 0.9,
  specUrl: 'https://github.com/vrm-c/vrm-specification/tree/master/specification/0.0',
  boneMap: {
    hips: { platformName: 'hips' },
    spine: { platformName: 'spine' },
    spine2: { platformName: 'chest', note: 'VRM0 chest = spine2 in canonical' },
    neck: { platformName: 'neck' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'leftShoulder' },
    left_upper_arm: { platformName: 'leftUpperArm' },
    left_forearm: { platformName: 'leftLowerArm' },
    left_hand: { platformName: 'leftHand' },
    right_shoulder: { platformName: 'rightShoulder' },
    right_upper_arm: { platformName: 'rightUpperArm' },
    right_forearm: { platformName: 'rightLowerArm' },
    right_hand: { platformName: 'rightHand' },
    left_upper_leg: { platformName: 'leftUpperLeg' },
    left_lower_leg: { platformName: 'leftLowerLeg' },
    left_foot: { platformName: 'leftFoot' },
    left_toes: { platformName: 'leftToes' },
    right_upper_leg: { platformName: 'rightUpperLeg' },
    right_lower_leg: { platformName: 'rightLowerLeg' },
    right_foot: { platformName: 'rightFoot' },
    right_toes: { platformName: 'rightToes' },
  },
};

/** Ready Player Me (GLB, mixamorig-prefixed or rpm_prefixed). */
const rpmProfile: SkeletonStandardProfile = {
  id: 'rpm',
  displayName: 'Ready Player Me',
  version: '1.0.0',
  mappingConfidence: 0.95,
  specUrl:
    'https://docs.readyplayer.me/ready-player-me/api-reference/rest-api/avatars/get-3d-avatars',
  boneMap: {
    hips: { platformName: 'Hips' },
    spine: { platformName: 'Spine' },
    spine2: { platformName: 'Spine2' },
    neck: { platformName: 'Neck' },
    head: { platformName: 'Head' },
    left_shoulder: { platformName: 'LeftShoulder' },
    left_upper_arm: { platformName: 'LeftArm' },
    left_forearm: { platformName: 'LeftForeArm' },
    left_hand: { platformName: 'LeftHand' },
    right_shoulder: { platformName: 'RightShoulder' },
    right_upper_arm: { platformName: 'RightArm' },
    right_forearm: { platformName: 'RightForeArm' },
    right_hand: { platformName: 'RightHand' },
    left_upper_leg: { platformName: 'LeftUpLeg' },
    left_lower_leg: { platformName: 'LeftLeg' },
    left_foot: { platformName: 'LeftFoot' },
    left_toes: { platformName: 'LeftToeBase' },
    right_upper_leg: { platformName: 'RightUpLeg' },
    right_lower_leg: { platformName: 'RightLeg' },
    right_foot: { platformName: 'RightFoot' },
    right_toes: { platformName: 'RightToeBase' },
  },
};

/** Mixamo FBX (mixamorig: prefix). */
const mixamoProfile: SkeletonStandardProfile = {
  id: 'mixamo',
  displayName: 'Mixamo (Adobe)',
  version: '1.0.0',
  mappingConfidence: 1.0,
  specUrl: 'https://www.mixamo.com/',
  boneMap: {
    hips: { platformName: 'mixamorig:Hips' },
    spine: { platformName: 'mixamorig:Spine' },
    spine1: { platformName: 'mixamorig:Spine1' },
    spine2: { platformName: 'mixamorig:Spine2' },
    neck: { platformName: 'mixamorig:Neck' },
    head: { platformName: 'mixamorig:Head' },
    left_shoulder: { platformName: 'mixamorig:LeftShoulder' },
    left_upper_arm: { platformName: 'mixamorig:LeftArm' },
    left_forearm: { platformName: 'mixamorig:LeftForeArm' },
    left_hand: { platformName: 'mixamorig:LeftHand' },
    right_shoulder: { platformName: 'mixamorig:RightShoulder' },
    right_upper_arm: { platformName: 'mixamorig:RightArm' },
    right_forearm: { platformName: 'mixamorig:RightForeArm' },
    right_hand: { platformName: 'mixamorig:RightHand' },
    left_upper_leg: { platformName: 'mixamorig:LeftUpLeg' },
    left_lower_leg: { platformName: 'mixamorig:LeftLeg' },
    left_foot: { platformName: 'mixamorig:LeftFoot' },
    left_toes: { platformName: 'mixamorig:LeftToeBase' },
    right_upper_leg: { platformName: 'mixamorig:RightUpLeg' },
    right_lower_leg: { platformName: 'mixamorig:RightLeg' },
    right_foot: { platformName: 'mixamorig:RightFoot' },
    right_toes: { platformName: 'mixamorig:RightToeBase' },
  },
};

/** Unreal Engine 4/5 Mannequin (SK_Mannequin). */
const ueMannequinProfile: SkeletonStandardProfile = {
  id: 'ue_mannequin',
  displayName: 'UE Mannequin (UE4/5)',
  version: '1.0.0',
  mappingConfidence: 0.9,
  specUrl: 'https://docs.unrealengine.com/5.0/en-US/skeleton-asset/',
  boneMap: {
    hips: { platformName: 'pelvis' },
    spine: { platformName: 'spine_01' },
    spine1: { platformName: 'spine_02' },
    spine2: { platformName: 'spine_03' },
    neck: { platformName: 'neck_01' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'clavicle_l' },
    left_upper_arm: { platformName: 'upperarm_l' },
    left_forearm: { platformName: 'lowerarm_l' },
    left_hand: { platformName: 'hand_l' },
    right_shoulder: { platformName: 'clavicle_r' },
    right_upper_arm: { platformName: 'upperarm_r' },
    right_forearm: { platformName: 'lowerarm_r' },
    right_hand: { platformName: 'hand_r' },
    left_upper_leg: { platformName: 'thigh_l' },
    left_lower_leg: { platformName: 'calf_l' },
    left_foot: { platformName: 'foot_l' },
    left_toes: { platformName: 'ball_l' },
    right_upper_leg: { platformName: 'thigh_r' },
    right_lower_leg: { platformName: 'calf_r' },
    right_foot: { platformName: 'foot_r' },
    right_toes: { platformName: 'ball_r' },
  },
  unmappedPlatformBones: [
    'root',
    'ik_foot_root',
    'ik_hand_root',
    'ik_hand_gun',
    'ik_foot_l',
    'ik_foot_r',
  ],
};

/** MetaHuman (UE-native, same pelvis/spine naming as UE Mannequin but with face bones). */
const metahumanProfile: SkeletonStandardProfile = {
  id: 'metahuman',
  displayName: 'MetaHuman (Unreal)',
  version: '1.0.0',
  mappingConfidence: 0.8,
  specUrl: 'https://docs.metahuman.unrealengine.com/',
  boneMap: {
    hips: { platformName: 'pelvis' },
    spine: { platformName: 'spine_01' },
    spine1: { platformName: 'spine_02' },
    spine2: { platformName: 'spine_03' },
    neck: { platformName: 'neck_01' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'clavicle_l' },
    left_upper_arm: { platformName: 'upperarm_l' },
    left_forearm: { platformName: 'lowerarm_l' },
    left_hand: { platformName: 'hand_l' },
    right_shoulder: { platformName: 'clavicle_r' },
    right_upper_arm: { platformName: 'upperarm_r' },
    right_forearm: { platformName: 'lowerarm_r' },
    right_hand: { platformName: 'hand_r' },
    left_upper_leg: { platformName: 'thigh_l' },
    left_lower_leg: { platformName: 'calf_l' },
    left_foot: { platformName: 'foot_l' },
    left_toes: { platformName: 'ball_l' },
    right_upper_leg: { platformName: 'thigh_r' },
    right_lower_leg: { platformName: 'calf_r' },
    right_foot: { platformName: 'foot_r' },
    right_toes: { platformName: 'ball_r' },
  },
  unmappedPlatformBones: [
    // MetaHuman has extensive facial rig + spine_04/05
    'spine_04',
    'spine_05',
    'neck_02',
    'FACIAL_C_FacialRoot',
    'FACIAL_L_Eye',
    'FACIAL_R_Eye',
  ],
};

/** DAZ Studio Genesis 8. */
const dazGenesis8Profile: SkeletonStandardProfile = {
  id: 'daz_genesis8',
  displayName: 'DAZ Genesis 8',
  version: '1.0.0',
  mappingConfidence: 0.75,
  boneMap: {
    hips: { platformName: 'hip' },
    spine: { platformName: 'abdomenLower' },
    spine1: { platformName: 'abdomenUpper' },
    spine2: { platformName: 'chestLower' },
    neck: { platformName: 'neckLower' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'lCollar' },
    left_upper_arm: { platformName: 'lShldrBend' },
    left_forearm: { platformName: 'lForearmBend' },
    left_hand: { platformName: 'lHand' },
    right_shoulder: { platformName: 'rCollar' },
    right_upper_arm: { platformName: 'rShldrBend' },
    right_forearm: { platformName: 'rForearmBend' },
    right_hand: { platformName: 'rHand' },
    left_upper_leg: { platformName: 'lThighBend' },
    left_lower_leg: { platformName: 'lShin' },
    left_foot: { platformName: 'lFoot' },
    left_toes: { platformName: 'lToe' },
    right_upper_leg: { platformName: 'rThighBend' },
    right_lower_leg: { platformName: 'rShin' },
    right_foot: { platformName: 'rFoot' },
    right_toes: { platformName: 'rToe' },
  },
};

/** DAZ Studio Genesis 9. */
const dazGenesis9Profile: SkeletonStandardProfile = {
  id: 'daz_genesis9',
  displayName: 'DAZ Genesis 9',
  version: '1.0.0',
  mappingConfidence: 0.7,
  boneMap: {
    hips: { platformName: 'hip' },
    spine: { platformName: 'abdomenLower' },
    spine1: { platformName: 'abdomenUpper' },
    spine2: { platformName: 'chestLower' },
    neck: { platformName: 'neckLower' },
    head: { platformName: 'head' },
    left_shoulder: { platformName: 'lCollar' },
    left_upper_arm: { platformName: 'lShldrBend' },
    left_forearm: { platformName: 'lForearmBend' },
    left_hand: { platformName: 'lHand' },
    right_shoulder: { platformName: 'rCollar' },
    right_upper_arm: { platformName: 'rShldrBend' },
    right_forearm: { platformName: 'rForearmBend' },
    right_hand: { platformName: 'rHand' },
    left_upper_leg: { platformName: 'lThighBend' },
    left_lower_leg: { platformName: 'lShin' },
    left_foot: { platformName: 'lFoot' },
    left_toes: { platformName: 'lToe' },
    right_upper_leg: { platformName: 'rThighBend' },
    right_lower_leg: { platformName: 'rShin' },
    right_foot: { platformName: 'rFoot' },
    right_toes: { platformName: 'rToe' },
  },
  unmappedPlatformBones: ['chestUpper', 'neckUpper'],
};

/** AutoRig Pro (Blender add-on, c_root_master/c_spine/c_arm naming). */
const autoRigProProfile: SkeletonStandardProfile = {
  id: 'autorig_pro',
  displayName: 'AutoRig Pro (Blender)',
  version: '1.0.0',
  mappingConfidence: 0.75,
  boneMap: {
    hips: { platformName: 'c_root_master.x' },
    spine: { platformName: 'c_spine_01.x' },
    spine1: { platformName: 'c_spine_02.x' },
    spine2: { platformName: 'c_spine_03.x' },
    neck: { platformName: 'c_neck.x' },
    head: { platformName: 'c_head.x' },
    left_shoulder: { platformName: 'c_shoulder.l' },
    left_upper_arm: { platformName: 'c_arm_fk.l' },
    left_forearm: { platformName: 'c_forearm_fk.l' },
    left_hand: { platformName: 'c_hand_fk.l' },
    right_shoulder: { platformName: 'c_shoulder.r' },
    right_upper_arm: { platformName: 'c_arm_fk.r' },
    right_forearm: { platformName: 'c_forearm_fk.r' },
    right_hand: { platformName: 'c_hand_fk.r' },
    left_upper_leg: { platformName: 'c_thigh_fk.l' },
    left_lower_leg: { platformName: 'c_leg_fk.l' },
    left_foot: { platformName: 'c_foot_fk.l' },
    right_upper_leg: { platformName: 'c_thigh_fk.r' },
    right_lower_leg: { platformName: 'c_leg_fk.r' },
    right_foot: { platformName: 'c_foot_fk.r' },
  },
};

/** Character Creator 3 / Reallusion (CC3+). */
const cc3Profile: SkeletonStandardProfile = {
  id: 'cc3',
  displayName: 'Character Creator 3/4 (Reallusion)',
  version: '1.0.0',
  mappingConfidence: 0.8,
  boneMap: {
    hips: { platformName: 'CC_Base_Hip' },
    spine: { platformName: 'CC_Base_Waist' },
    spine1: { platformName: 'CC_Base_Spine01' },
    spine2: { platformName: 'CC_Base_Spine02' },
    neck: { platformName: 'CC_Base_NeckTwist01' },
    head: { platformName: 'CC_Base_Head' },
    left_shoulder: { platformName: 'CC_Base_L_Clavicle' },
    left_upper_arm: { platformName: 'CC_Base_L_Upperarm' },
    left_forearm: { platformName: 'CC_Base_L_Forearm' },
    left_hand: { platformName: 'CC_Base_L_Hand' },
    right_shoulder: { platformName: 'CC_Base_R_Clavicle' },
    right_upper_arm: { platformName: 'CC_Base_R_Upperarm' },
    right_forearm: { platformName: 'CC_Base_R_Forearm' },
    right_hand: { platformName: 'CC_Base_R_Hand' },
    left_upper_leg: { platformName: 'CC_Base_L_Thigh' },
    left_lower_leg: { platformName: 'CC_Base_L_Calf' },
    left_foot: { platformName: 'CC_Base_L_Foot' },
    left_toes: { platformName: 'CC_Base_L_ToeBase' },
    right_upper_leg: { platformName: 'CC_Base_R_Thigh' },
    right_lower_leg: { platformName: 'CC_Base_R_Calf' },
    right_foot: { platformName: 'CC_Base_R_Foot' },
    right_toes: { platformName: 'CC_Base_R_ToeBase' },
  },
};

// =============================================================================
// Registry
// =============================================================================

export const SKELETON_PROFILES: Record<SkeletonStandardId, SkeletonStandardProfile> = {
  holoscript_65: holoscript65Profile,
  vrm1: vrm1Profile,
  vrm0: vrm0Profile,
  rpm: rpmProfile,
  mixamo: mixamoProfile,
  ue_mannequin: ueMannequinProfile,
  metahuman: metahumanProfile,
  daz_genesis8: dazGenesis8Profile,
  daz_genesis9: dazGenesis9Profile,
  autorig_pro: autoRigProProfile,
  cc3: cc3Profile,
};

// =============================================================================
// Query helpers
// =============================================================================

/**
 * Resolve the platform-specific bone name for a canonical bone in a given
 * skeleton standard. Returns `undefined` if the bone is unmapped.
 */
export function resolveProfileBone(
  standard: SkeletonStandardId,
  canonicalBone: HumanoidBoneName
): string | undefined {
  return SKELETON_PROFILES[standard]?.boneMap[canonicalBone]?.platformName;
}

/**
 * Build the reverse map: platform-specific name → canonical HumanoidBoneName.
 * Useful when ingesting an unknown rig and trying to identify its standard.
 */
export function buildReverseMap(standard: SkeletonStandardId): Map<string, HumanoidBoneName> {
  const profile = SKELETON_PROFILES[standard];
  const result = new Map<string, HumanoidBoneName>();
  for (const [canonical, entry] of Object.entries(profile.boneMap) as [
    HumanoidBoneName,
    SkeletonBoneEntry,
  ][]) {
    result.set(entry.platformName, canonical);
  }
  return result;
}

/**
 * Candidate match result returned by `matchSkeletonStandard`.
 */
export interface SkeletonMatchCandidate {
  /** Profile that was tested. */
  standard: SkeletonStandardId;
  /** 0.0–1.0: fraction of input bones that matched this profile's platform names. */
  overlapScore: number;
  /**
   * Weighted score = overlapScore * mappingConfidence.
   * Use this for ranking; profiles with higher spec confidence rank above
   * equally-matching but under-documented ones.
   */
  weightedScore: number;
  /** Bones in the input that matched this profile. */
  matchedBones: string[];
  /** Bones in the input that did NOT match. */
  unmatchedBones: string[];
}

/**
 * Given a list of bone names from an unknown rig, rank all registered
 * skeleton standards by how well they match.
 *
 * @param inputBones - Raw bone names from the rig (case-sensitive).
 * @param topN        - Maximum number of candidates to return (default 5).
 */
export function matchSkeletonStandard(inputBones: string[], topN = 5): SkeletonMatchCandidate[] {
  const inputSet = new Set(inputBones);
  const results: SkeletonMatchCandidate[] = [];

  for (const [id, profile] of Object.entries(SKELETON_PROFILES) as [
    SkeletonStandardId,
    SkeletonStandardProfile,
  ][]) {
    const platformNames = Object.values(profile.boneMap).map((e) => e.platformName);
    const matched = inputBones.filter((b) => new Set(platformNames).has(b));
    const unmatched = inputBones.filter((b) => !new Set(platformNames).has(b));
    const overlapScore = inputBones.length > 0 ? matched.length / inputBones.length : 0;
    results.push({
      standard: id,
      overlapScore,
      weightedScore: overlapScore * profile.mappingConfidence,
      matchedBones: matched,
      unmatchedBones: unmatched,
    });
  }

  return results.sort((a, b) => b.weightedScore - a.weightedScore).slice(0, topN);
}

/**
 * Validate that all required canonical bones are covered by a profile.
 * Returns a list of missing canonical bones (empty = fully covered).
 */
export function validateProfileCoverage(
  standard: SkeletonStandardId,
  requiredCanonicalBones: HumanoidBoneName[]
): HumanoidBoneName[] {
  const profile = SKELETON_PROFILES[standard];
  return requiredCanonicalBones.filter((b) => !profile.boneMap[b]);
}
