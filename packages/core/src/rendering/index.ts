// Rendering pipeline infrastructure
export * from './webgpu';
export * from './postprocess';
export * from './headless';
export { RenderGraph } from './RenderGraph';

// Visual effects and material systems
export { BloomEffect } from './BloomEffect';
export { CloudRenderer } from './CloudRenderer';
export { ColorGrading } from './ColorGrading';
export { DecalBatcher } from './DecalBatcher';
export { DecalSystem } from './DecalSystem';
export { FogSystem } from './FogSystem';
export { LightingModel } from './LightingModel';
export {
  MaterialLibrary,
  MATERIAL_PRESETS as RENDERING_MATERIAL_PRESETS,
  type MaterialDef,
  type MaterialInstance,
  type MaterialType as RenderingMaterialType,
  type TextureSlot,
  type BlendMode,
  type CullMode,
  hexToRGBA,
  rgbaToHex,
  createDefaultMaterialDef,
} from './MaterialLibrary';
export { MaterialSystem } from './MaterialSystem';
export * as PostProcessing from './PostProcessing';
export { PostProcessStack } from './PostProcessStack';
export { ProjectorLight } from './ProjectorLight';
export { RenderPass } from './RenderPass';
export { ShaderGraph } from './ShaderGraph';
export { VolumetricLight } from './VolumetricLight';
