// Components
export { MeshNode } from './components/MeshNode';
export type { MeshNodeProps } from './components/MeshNode';
export { ShaderMeshNode, hasShaderTrait } from './components/ShaderMeshNode';
export type { ShaderMeshNodeProps } from './components/ShaderMeshNode';
export { AnimatedMeshNode } from './components/AnimatedMeshNode';
export type { AnimatedMeshNodeProps } from './components/AnimatedMeshNode';
export { LODMeshNode, hasLOD } from './components/LODMeshNode';
export type { LODMeshNodeProps } from './components/LODMeshNode';
export {
  ProceduralGeometryComponent,
  getScaleTexture,
  FireEmbers,
  useKeyframeAnimation,
} from './components/ProceduralMesh';

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
