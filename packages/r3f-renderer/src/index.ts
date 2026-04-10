// Components
export { MeshNode } from './components/MeshNode';
export type { MeshNodeProps } from './components/MeshNode';
export { ShaderMeshNode, hasShaderTrait } from './components/ShaderMeshNode';
export type { ShaderMeshNodeProps } from './components/ShaderMeshNode';
export { AnimatedMeshNode } from './components/AnimatedMeshNode';
export type { AnimatedMeshNodeProps } from './components/AnimatedMeshNode';
export { LODMeshNode, hasLOD } from './components/LODMeshNode';
export type { LODMeshNodeProps, LODConfigProp } from './components/LODMeshNode';
export { DraftMeshNode } from './components/DraftMeshNode';
export type { DraftMeshNodeProps, DraftShape } from './components/DraftMeshNode';
export {
  ProceduralGeometryComponent,
  getScaleTexture,
  FireEmbers,
  useKeyframeAnimation,
} from './components/ProceduralMesh';
export { ProgressiveLoader } from './components/ProgressiveLoader';
export type { ProgressiveLoaderProps, LoadingEntity } from './components/ProgressiveLoader';

// HoloMesh Components (Social/A2A)
export { SpatialFeedRenderer } from './components/SpatialFeedRenderer';

// Hologram Components (2D-to-3D pipeline)
export { HologramImage } from './components/HologramImage';
export type { HologramImageProps } from './components/HologramImage';
export { HologramGif } from './components/HologramGif';
export type { HologramGifProps } from './components/HologramGif';
export { HologramVideo } from './components/HologramVideo';
export type { HologramVideoProps } from './components/HologramVideo';
export { QuiltViewer } from './components/QuiltViewer';
export type { QuiltViewerProps } from './components/QuiltViewer';
export { GaussianSplatViewer } from './components/GaussianSplatViewer';
export type { GaussianSplatViewerProps } from './components/GaussianSplatViewer';

// GAPS Physics Components (Phase 3)
export { FluidRenderer } from './components/FluidRenderer';
export type { FluidRendererProps } from './components/FluidRenderer';
export { CloudRenderer } from './components/CloudRenderer';
export type { CloudRendererProps } from './components/CloudRenderer';
export { GodRaysEffect } from './components/GodRaysEffect';
export type { GodRaysEffectProps } from './components/GodRaysEffect';

// Environment Rendering Components (Phase R1)
export { PostProcessingRenderer } from './components/PostProcessingRenderer';
export type {
  PostProcessingRendererProps,
  PostProcessStep,
  PostProcessEffect,
  QualityTier,
} from './components/PostProcessingRenderer';
export { AtmosphereRenderer } from './components/AtmosphereRenderer';
export type { AtmosphereRendererProps, SkyModel } from './components/AtmosphereRenderer';
export { OceanRenderer } from './components/OceanRenderer';
export type { OceanRendererProps, OceanType, GerstnerSwell } from './components/OceanRenderer';
export { TerrainRenderer } from './components/TerrainRenderer';
export type { TerrainRendererProps, BiomeConfig } from './components/TerrainRenderer';
export { GIRenderer } from './components/GIRenderer';
export type {
  GIRendererProps,
  GIMethod,
  GIQualityTier,
  LightProbeConfig,
} from './components/GIRenderer';

// Simulation Visualization Components (Phase R2)
export { ScalarFieldOverlay } from './components/ScalarFieldOverlay';
export type { ScalarFieldOverlayProps, ColormapName } from './components/ScalarFieldOverlay';

// VFX & Audio Components (Phase R3)
export { VFXParticleRenderer } from './components/VFXParticleRenderer';
export type {
  VFXParticleRendererProps,
  VFXPreset,
  EmitterShape,
} from './components/VFXParticleRenderer';
export { SpatialAudioRenderer } from './components/SpatialAudioRenderer';
export type {
  SpatialAudioRendererProps,
  AudioSourceType,
  ReverbZone,
} from './components/SpatialAudioRenderer';

// Character Rendering Components (Phase R4)
export { ShapePoolRenderer } from './components/ShapePoolRenderer';
export type {
  ShapePoolRendererProps,
  ShapeInstance,
  PoolGeometryType,
} from './components/ShapePoolRenderer';
export { SkinSSRenderer } from './components/SkinSSRenderer';
export type { SkinSSRendererProps } from './components/SkinSSRenderer';
export { EyeRenderer } from './components/EyeRenderer';
export type { EyeRendererProps } from './components/EyeRenderer';
export { HairRenderer } from './components/HairRenderer';
export type { HairRendererProps, HairMode, HairGuide } from './components/HairRenderer';

// HoloMesh V5 Spatial Renderers (MySpace for Agents)
export { AgentRoomRenderer } from './components/AgentRoomRenderer';
export type { AgentRoomRendererProps, FurnitureItem } from './components/AgentRoomRenderer';
export { RoomPortalRenderer } from './components/RoomPortalRenderer';
export type { RoomPortalRendererProps, PortalStyle } from './components/RoomPortalRenderer';
export { GuestbookRenderer } from './components/GuestbookRenderer';
export type { GuestbookRendererProps, GuestbookEntryData } from './components/GuestbookRenderer';
export { BadgeHolographicRenderer } from './components/BadgeHolographicRenderer';
export type {
  BadgeHolographicRendererProps,
  BadgeData,
  BadgeDisplayMode,
  BadgeTier,
} from './components/BadgeHolographicRenderer';

// Utilities
export { getGeometry, getMaterialProps, isScaledBody, isFireMesh } from './utils/materialUtils';
export type { LODDetail } from './utils/materialUtils';

// Hooks
export { useHoloTextures, hasTextures } from './hooks/useHoloTextures';
export { useProceduralTexture } from './hooks/useProceduralTexture';
export { useLODBridge, resetLODBridge } from './hooks/useLODBridge';
export type { UseLODBridgeResult } from './hooks/useLODBridge';
export { usePerformanceRegression } from './hooks/usePerformanceRegression';
export type {
  UsePerformanceRegressionOptions,
  UsePerformanceRegressionResult,
} from './hooks/usePerformanceRegression';
export { useGpuSplatSort } from './hooks/useGpuSplatSort';
export type { GpuSplatSortOptions, GpuSplatSortResult } from './hooks/useGpuSplatSort';
