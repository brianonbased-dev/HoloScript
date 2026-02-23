/**
 * Export Module
 *
 * Scene graph serialization and export functionality for HoloScript.
 * Supports JSON, binary, and streaming formats.
 *
 * @module export
 * @version 3.3.0
 */

// Scene Graph IR
export {
  // Transform types
  IVector3,
  IQuaternion,
  ITransform,

  // Component types
  IComponent,
  IMeshComponent,
  ILightComponent,
  ICameraComponent,
  IColliderComponent,
  IRigidbodyComponent,
  IAudioSourceComponent,
  IAnimationComponent,
  IScriptComponent,

  // Node types
  ISceneNode,

  // Asset types
  IMaterial,
  ITexture,
  IMesh,
  IMeshPrimitive,
  IAnimation,
  IAnimationChannel,
  IAnimationSampler,
  ISkin,
  IJoint,
  IBuffer,
  IBufferView,
  IAccessor,

  // Scene graph
  ISceneGraph,
  ISceneMetadata,

  // Factory functions
  createIdentityTransform,
  createEmptyNode,
  createDefaultMaterial,
  createEmptySceneGraph,

  // Type guards
  isMeshComponent,
  isLightComponent,
  isCameraComponent,
  isColliderComponent,
  isRigidbodyComponent,
} from './SceneGraph';

// Scene Serializer
export {
  ISerializeOptions,
  IDeserializeOptions,
  ISerializeResult,
  ISerializeStats,
  IValidationResult,
  IValidationError,
  SceneSerializer,
  findNodeById,
  findNodesByTag,
  traverseNodes,
  getWorldTransform,
} from './SceneSerializer';

// Binary Serializer
export {
  IBinaryEncoderOptions,
  IBinaryDecoderOptions,
  BinaryWriter,
  BinaryReader,
  BinarySerializer,
} from './BinarySerializer';

// USDZ Exporter (Apple Vision Pro)
export {
  USDZExporter,
  IUSDZExportOptions,
  IUSDZExportResult,
  IUSDZExportStats,
  IUSDStage,
  IUSDMetadata,
  IUSDPrim,
  IUSDMesh,
  IUSDMaterial,
  IUSDShader,
  IUSDAttribute,
  IUSDXformOp,
  IUSDPreviewSurfaceInputs,
  IARQuickLookMetadata,
  ISpatialAudioMetadata,
  IUSDZPackage,
  IUSDZFileEntry,
  USDPrimType,
  USDAttributeType,
  USDAttributeValue,
  createEmptyUSDStage,
  createUSDXform,
  createUSDPreviewSurfaceMaterial,
  quaternionToEuler,
  sanitizeUSDName,
  isValidUSDPath,
} from './usdz';

// Advanced Compression (KTX2/Draco)
export {
  AdvancedCompression,
  CompressionOptions,
  CompressionStats,
  CompressedTexture,
  CompressedMesh,
  GPUTextureFormat,
  TextureCompressionFormat,
  CompressionQualityPreset,
  ImageData,
  KTX2Options,
  DracoOptions,
  MipmapOptions,
  DracoQuantization,
  DracoExtensionData,
  MipmapFilter,
  BasisTextureFormat,
  KTX2SupercompressionScheme,
  DracoCompressionMethod,
  getQualityPresetOptions,
  calculateCompressionRatio,
  calculateReductionPercentage,
} from './compression';
