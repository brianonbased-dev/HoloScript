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
  buildAgentAvatarGarment,
  type AgentAvatarGarmentData,
  type AgentAvatarGarmentOptions,
  type GarmentMeshPart,
  type SovereignGarmentStyle,
  type SovereignMantleStyle,
} from './AgentAvatarGarment';

export {
  DeterministicClothSimulation,
  DEFAULT_CLOTH_SIMULATION,
  type ClothSimulationConfig,
  type ClothSimulationReceipt,
} from './AgentAvatarCloth';

export {
  buildAgentAvatarHair,
  buildAgentAvatarEyes,
  buildCharacterMesh,
  type HairMeshData,
  type HairOptions,
  type CharacterMeshData,
} from './AgentAvatarHair';

export {
  parseGlb,
  extractGltfSkinnedMesh,
  extractGltfStaticMesh,
  extractGltfMeshes,
  type GltfSkinnedMesh,
  type GltfStaticMesh,
} from './GltfMeshExtractor';

export {
  CharacterHost,
  type CharacterHostOptions,
  type CharacterWorldState,
} from './CharacterHost';

export {
  StaticCharacterMind,
  type CharacterMind,
  type MindIdentity,
  type MindMemoryEntry,
} from './CharacterMind';

export {
  renderCharacter,
  framingMatrix,
  packCharacterMaterial,
  type CharacterRenderOptions,
} from './character-render';

// Render "Part 2" — native WebGPU Gaussian-splat variant (photoreal mesh/skin upgrade route).
export {
  renderSplats,
  packRawSplats,
  defaultSplatCamera,
  gaussian3DToSplats,
  gaussianSplatDataToSplats,
  type RawSplatInput,
  type SplatRenderOptions,
} from '../native-render/splat-render';

// Splat-bodied character entity (D.094 entity-generic + D.102 portable mind) loaded from the
// existing splat infrastructure (PLY loader / codec interchange).
export {
  SplatCharacterHost,
  framingSplatCamera,
  type SplatCharacterHostOptions,
  type SplatCharacterRenderOptions,
} from './SplatCharacterHost';

export {
  detectSupport,
  composeEyeViewProj,
  packFrameUniform,
  XRCharacterRenderer,
  type XRSupport,
  type XRRenderMode,
  type XRCharacterRendererOptions,
} from './character-render-xr';

export { gaitPose, type GaitMode, type AvatarPoseMap } from './gait';

export {
  buildCharacterHostFromComposition,
  type ParsedComposition,
  type CompObject,
  type CompTrait,
  type CompTemplate,
  type CharacterHostFromCompositionOptions,
  type CharacterHostFromCompositionResult,
} from './CharacterHostFromComposition';

export * as SkinMath from './skin-math';
