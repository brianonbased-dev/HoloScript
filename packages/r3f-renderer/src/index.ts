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

// Utilities
export {
  getGeometry,
  getMaterialProps,
  isScaledBody,
  isFireMesh,
} from './utils/materialUtils';
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
