/**
 * @holoscript/vrm-avatar-plugin — VRM 1.0 avatar interop stub.
 *
 * Research: ai-ecosystem memory/avatar-interop-vrm-gltf*.md (integration scouting)
 * Universal-IR matrix: docs/universal-ir-coverage.md (avatar column)
 *
 * Status: STUB. Full VRM 1.0 binary parsing + spring-bone physics are
 * future work; current scope maps VRM expression presets + humanoid bone
 * roles to @avatar_rig / @expression .holo traits.
 */

export type VrmHumanoidBone =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot';

export type VrmExpressionPreset = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised' | 'neutral' | 'blink' | 'aa' | 'ih' | 'ou';

export interface VrmAvatar {
  name: string;
  version: '1.0';
  humanoid_bones: Partial<Record<VrmHumanoidBone, string>>; // map VRM bone -> node name
  expressions?: Array<{ preset: VrmExpressionPreset; target_shape_keys: string[] }>;
}

export interface HoloAvatarEmission {
  rig: { kind: '@avatar_rig'; target_id: string; params: Record<string, unknown> };
  expressions: Array<{ kind: '@expression'; target_id: string; params: Record<string, unknown> }>;
  bone_coverage: number; // 0..1 fraction of required-humanoid bones present
}

const REQUIRED_BONES: VrmHumanoidBone[] = ['hips', 'spine', 'head', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg', 'rightUpperLeg'];

export function mapVrmToAvatar(vrm: VrmAvatar): HoloAvatarEmission {
  const present = REQUIRED_BONES.filter((b) => !!vrm.humanoid_bones[b]);
  const bone_coverage = present.length / REQUIRED_BONES.length;
  return {
    rig: {
      kind: '@avatar_rig',
      target_id: vrm.name,
      params: {
        version: vrm.version,
        bones: vrm.humanoid_bones,
        bone_coverage,
      },
    },
    expressions: (vrm.expressions ?? []).map((e) => ({
      kind: '@expression' as const,
      target_id: `${vrm.name}:${e.preset}`,
      params: { preset: e.preset, target_shape_keys: e.target_shape_keys },
    })),
    bone_coverage,
  };
}
