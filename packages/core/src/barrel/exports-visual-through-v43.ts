// =============================================================================
// Trait Visual System (Trait-to-PBR Mapping)
// =============================================================================

export {
  TraitVisualRegistry,
  registerAllPresets,
  type TraitVisualConfig,
  type R3FMaterialProps,
  type VisualLayer,
  VISUAL_LAYER_PRIORITY,
} from '../traits/visual/index';

export { TraitCompositor } from '../traits/visual/TraitCompositor';
export { COMPOSITION_RULES } from '../traits/visual/composition-rules';

// =============================================================================
// glTF/GLB Export Pipeline (Growth Vector 1 — Universal 3D Interop)
// =============================================================================

export {
  GLTFPipeline,
  createGLTFPipeline,
  generateScaleTexture,
  generateScaleNormalMap,
  type GLTFPipelineOptions,
  type GLTFExportResult,
  type GLTFExportStats,
} from '../compiler/GLTFPipeline';

// SceneGraph IR + GLTFExporter (for advanced pipelines)
export { GLTFExporter } from '../export/gltf/GLTFExporter';
export type { IGLTFExportOptions, IGLTFExportResult } from '../export/gltf/GLTFTypes';
export type {
  ISceneGraph,
  ISceneNode,
  IMaterial as ISceneGraphMaterial,
} from '../export/SceneGraph';
export { createEmptySceneGraph, createEmptyNode, createDefaultMaterial } from '../export/SceneGraph';

// USDZ Pipeline
export { USDZPipeline, type USDZPipelineOptions } from '../compiler/USDZPipeline';

// =============================================================================
// Audit Logging & Compliance (Sprint 9 - Priority 6)
// =============================================================================

export {
  AuditLogger,
  InMemoryAuditStorage,
  AuditQuery,
  ComplianceReporter,
  type AuditEvent,
  type AuditEventInput,
  type AuditQueryFilter,
  type AuditStorageBackend,
  type DateRange,
  type ReportSection,
  type ReportItem,
  type ReportSummary,
  type ComplianceReport,
} from '../audit';

// =============================================================================
// IPFS Storage (NFT Asset Uploads)
// =============================================================================

export {
  IPFSService,
  PinataProvider,
  NFTStorageProvider,
  InfuraProvider,
  IPFSUploadError,
  IPFSPinError,
  FileSizeExceededError,
  type IPFSProvider,
  type IPFSServiceOptions,
  type FallbackProvider,
  type IPFSFile,
  type UploadProgress,
  type UploadOptions,
  type UploadResult,
  type PinStatus,
  type PinInfo,
  type IIPFSProvider,
} from '../storage';

// =============================================================================
// V43 Trait Handlers (Tier 2: AI Generation & visionOS)
// =============================================================================

export {
  aiInpaintingHandler,
  type AiInpaintingConfig,
  type InpaintModel,
  type MaskSource,
  type BlendMode,
} from '../traits/AiInpaintingTrait';

export {
  aiTextureGenHandler,
  type AiTextureGenConfig,
  type TextureStyle,
  type TextureResolution,
  type MaterialType as AiTextureMaterialType,
} from '../traits/AiTextureGenTrait';

export {
  controlNetHandler,
  type ControlNetConfig,
  type ControlNetModel,
} from '../traits/ControlNetTrait';

export {
  diffusionRealtimeHandler,
  type DiffusionRealtimeConfig,
  type DiffusionBackend,
  type StreamMode,
} from '../traits/DiffusionRealtimeTrait';

export {
  sharePlayHandler,
  type SharePlayConfig,
  type SharePlayState,
  type SyncPolicy,
} from '../traits/SharePlayTrait';

export {
  spatialPersonaHandler,
  type SpatialPersonaConfig,
  type PersonaStyle,
  type PersonaVisibility,
} from '../traits/SpatialPersonaTrait';
