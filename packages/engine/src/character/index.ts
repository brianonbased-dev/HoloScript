/**
 * Character Pipeline Module
 *
 * 7-stage character creation: sculpt → mesh → optimize → rig →
 * face → dress → deploy. Code-defined, diffable, composable.
 *
 * @module character
 */

// Pipeline types (all 7 stages)
export {
  type FillMode,
  type BlendMode,
  type GeometryPrimitive,
  type SculptRegion,
  type CharacterSculpt,
  type ExtractionAlgorithm,
  type MeshExtractionOptions,
  type CompiledMeshConfig,
  type HollowConfig,
  type LODTransition,
  type LODLevel,
  type CharacterLODConfig,
  type OptimizedCharacterConfig,
  type SkeletonTemplate,
  type SkinningMethod,
  type SkeletonCompatibility,
  type CustomBone,
  type SkinningConfig,
  type RiggedCharacterConfig,
  type ActionUnitMapping,
  type ExpressionWeights,
  type ExpressionPreset,
  type VisemeMapping,
  type ReactiveExpression,
  type FaceConfig,
  type SubsurfaceMaterialConfig,
  type RefractiveEyeConfig,
  type MarschnerHairConfig,
  type CharacterMaterial,
  type ClothingType,
  type WrinkleMapConfig,
  type ClothingConfig,
  type HairType,
  type HairConfig,
  type DeployFormat,
  type TextureCompression,
  type DeployTarget,
  type DeployConfig,
  type CharacterPipelineConfig,
  type PipelineStage,
  PIPELINE_STAGES,
} from './CharacterPipelineTypes';

// Humanoid skeleton
export {
  type BoneDefinition,
  type HumanoidBoneName,
  HUMANOID_BONE_NAMES,
  HUMANOID_65_SKELETON,
  MIXAMO_BONE_MAP,
  VRM_BONE_MAP,
  getBoneChildren,
  getBoneChain,
  validateSkeleton,
} from './HumanoidSkeleton';

// FACS system
export {
  type ActionUnitDefinition,
  type CompoundExpression,
  type VisemeDefinition,
  type VertexDelta,
  type SparseMorphTarget,
  FACS_ACTION_UNITS,
  EXPRESSION_PRESETS,
  VISEME_15,
  computeSparseMorphTarget,
  applyMorphTargets,
  evaluateExpression,
  getActionUnit,
  getViseme,
} from './FACSSystem';

// Lip sync
export {
  type AudioAnalysisMethod,
  type LipSyncConfig,
  type VisemeKeyframe,
  type LipSyncTrack,
  LipSyncEngine,
  DEFAULT_LIP_SYNC_CONFIG,
} from './LipSyncEngine';
