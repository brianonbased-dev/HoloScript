/**
 * @module character-render
 *
 * Native-WebGPU character rendering — the sovereign, Three.js-free path that turns the
 * `engine/character` library (HUMANOID_65 skeleton, FACS, idle) into GPU-skinned pixels.
 *
 *   buildAgentAvatarMesh()  → entity-generic procedural humanoid (pure data)
 *   CharacterHost           → owns a body, applies a pose, emits a CharacterDrawSpec
 *   renderCharacter()       → uploads + GPU-skins + renders to verified pixels (Part 1 rasterizer)
 *
 * Body sources: procedural default here; glTF/VRM upgrade is a separate opt-in path.
 */

export {
  buildAgentAvatarMesh,
  computeBindWorld,
  computeInverseBind,
  computeJointPalette,
  colorForEntity,
  BONE_ORDER,
  JOINT_COUNT,
  type AgentAvatarMeshData,
  type AgentAvatarMeshOptions,
  type AvatarPose,
} from './AgentAvatarMesh';

export {
  CharacterHost,
  type CharacterHostOptions,
  type CharacterWorldState,
} from './CharacterHost';

export {
  renderCharacter,
  framingMatrix,
  type CharacterRenderOptions,
} from './character-render';

export { gaitPose, type GaitMode, type AvatarPoseMap } from './gait';

export * as SkinMath from './skin-math';
