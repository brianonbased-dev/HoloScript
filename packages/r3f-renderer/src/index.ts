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
