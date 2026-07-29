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
  AGENT_AVATAR_ORBITAL_PROFILES,
  AGENT_AVATAR_FACIAL_DETAIL_PROFILES,
  AGENT_AVATAR_UPPER_BODY_PROFILES,
  type AgentAvatarMeshData,
  type AgentAvatarMeshOptions,
  type AgentAvatarAnatomyReceipt,
  type AgentAvatarUpperBodyGeometryReceipt,
  type AgentAvatarUpperBodyProfile,
  type AgentAvatarFacialDetailProfile,
  type AgentAvatarFacialLandmarkReceipt,
  type AgentAvatarFaceTopology,
  type AgentAvatarOrbitalProfile,
  type AgentAvatarOrbitalGeometryReceipt,
  type AvatarPose,
} from './AgentAvatarMesh';

export {
  buildAgentAvatarGarment,
  type AgentAvatarGarmentData,
  type AgentAvatarGarmentGeometryReceipt,
  type AgentAvatarGarmentOptions,
  type GarmentMeshPart,
  type SovereignGarmentStyle,
  type SovereignMantleStyle,
} from './AgentAvatarGarment';

export {
  SOVEREIGN_MANTLE_CATALOG,
  getSovereignMantleCatalogEntry,
  isSovereignMantleStyle,
  listSovereignMantleStyles,
  type SovereignMantleCatalogEntry,
  type SovereignMantleFamilyId,
  type SovereignMantleGeometryProfile,
} from './AgentAvatarMantleCatalog';

export {
  DeterministicClothSimulation,
  DEFAULT_CLOTH_SIMULATION,
  type ClothSimulationConfig,
  type ClothSimulationReceipt,
} from './AgentAvatarCloth';

export {
  buildAgentAvatarHair,
  buildAgentAvatarEyes,
  buildAgentAvatarOcularRegions,
  buildCharacterMesh,
  resolveAgentAvatarGroomProfile,
  resolveAgentAvatarHairStyle,
  AGENT_AVATAR_GROOM_PROFILES,
  AGENT_AVATAR_HAIR_STYLES,
  AGENT_AVATAR_OCULAR_PROFILES,
  type HairMeshData,
  type OcularMeshData,
  type HairOptions,
  type AgentAvatarGroomGeometryReceipt,
  type AgentAvatarGroomProfile,
  type AgentAvatarHairStyle,
  type AgentAvatarOcularProfile,
  type AgentAvatarOcularRegion,
  type CharacterMeshData,
} from './AgentAvatarHair';

export {
  applyNativeFacialMorph,
  NATIVE_FACIAL_MORPH_TARGETS,
  type NativeFacialMorphGeometry,
  type NativeFacialMorphTarget,
  type NativeMorphReceipt,
  type NativeMorphResult,
  type NativeMorphWeights,
} from './AgentAvatarMorph';

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
  type AgentAvatarMaterialCalibrationProfile,
  type AgentAvatarSkinMaterialReceipt,
  type AgentAvatarSkinMicrodetailProfile,
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
  deriveCharacterDetailFrame,
  deriveCharacterMaterialPlateReceipt,
  deriveCharacterRenderPipelineReceipt,
  packCharacterMaterial,
  type CharacterDetailFrameOptions,
  type CharacterDetailFrameReceipt,
  type CharacterMaterialGroupReceipt,
  type CharacterMaterialPlateReceipt,
  type CharacterRenderOptions,
  type CharacterRenderPipelineReceipt,
  type CharacterVertexRange,
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
