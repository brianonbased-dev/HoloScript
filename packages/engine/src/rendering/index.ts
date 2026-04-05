/**
 * Rendering subsystem — extracted from @holoscript/core (A.011.01a).
 *
 * Includes WebGPU renderer, post-processing pipeline, headless (Puppeteer)
 * rendering, materials, lighting, ray tracing, shader graph, and visual effects.
 */

export { BloomEffect, type BloomConfig } from './BloomEffect';
export {
	AdvancedLightingManager,
	parseIESProfile,
	sampleIES,
	rectSolidAngle,
	diskSolidAngle,
	buildCircleCookie,
	sampleCookie,
	type Vec3 as AdvancedLightingVec3,
	type Vec2 as AdvancedLightingVec2,
	type AreaLightShape,
	type LightType as AdvancedLightingLightType,
	type AreaLightConfig,
	type IESProfile,
	type LightCookie,
	type CausticConfig,
	type AdvancedLight,
} from './AdvancedLighting';
export {
	AdvancedPBRMaterial,
	MATERIAL_PRESETS as ADVANCED_PBR_PRESETS,
	distributionGGX,
	geometrySmith,
	fresnelSchlick,
	fresnelRoughness,
	evaluateClearcoat,
	distributionGGXAnisotropic,
	anisotropicRoughness,
	sheenDistribution,
	sheenVisibility,
	evaluateSheen,
	evaluateIridescence,
	computeF0,
	computeDiffuseAlbedo,
	type Vec3 as AdvancedPBRVec3,
	type RGB,
	type ClearcoatConfig,
	type AnisotropyConfig,
	type SheenConfig,
	type IridescenceConfig,
	type AdvancedPBRConfig,
} from './AdvancedPBR';
export {
	createSolidTexture,
	sampleTexture,
	sampleTextureBilinear,
	computeDisplacedPosition,
	computeDisplacementNormalsFromHeightMap,
	computePOM,
	triplanarWeights,
	sampleTriplanar,
	applyDetailAlbedo,
	blendDetailNormal,
	createAtlasPacker,
	packRect,
	getRectUV,
	getAtlasEfficiency,
	type Vec2 as AdvancedTexturingVec2,
	type Vec3 as AdvancedTexturingVec3,
	type Texture2D,
	type DisplacementConfig,
	type POMConfig,
	type DetailMapConfig,
	type AtlasRect,
	type AtlasPacker,
} from './AdvancedTexturing';
export { CloudRenderer, type CloudConfig, type CloudSample } from './CloudRenderer';
export { ColorGrading, type TonemapOperator, type ColorGradingConfig } from './ColorGrading';
export {
	DecalBatcher,
	type DecalInstance,
	type DrawBatch,
	type BatchStats,
} from './DecalBatcher';
export { DecalSystem, type DecalDef } from './DecalSystem';
export { FogSystem, type FogMode, type FogConfig } from './FogSystem';
export {
	createSH9,
	addSHSample,
	evalSH9Irradiance,
	scaleSH9,
	lerpSH9,
	GIProbeGrid,
	type Vec3 as GlobalIlluminationVec3,
	type SH9,
	type GIMode,
	type GIConfig,
	type ProbeInfo,
} from './GlobalIllumination';
export {
	LightingModel,
	type LightType,
	type Light,
	type AmbientConfig,
	type GIProbe,
} from './LightingModel';
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
export {
	MaterialSystem,
	type BlendMode as MaterialSystemBlendMode,
	type CullMode as MaterialSystemCullMode,
	type UniformType,
	type UniformDef,
	type Material as MaterialSystemMaterial,
} from './MaterialSystem';
export { PostProcessingStack, PP_PRESETS, type ToneMapper, type PostProcessProfile } from './PostProcessing';
export { PostProcessStack, type PostProcessEffect } from './PostProcessStack';
export { ProjectorLight, type ProjectorConfig } from './ProjectorLight';
export {
	RenderPass,
	type AttachmentFormat,
	type ClearOp,
	type FramebufferAttachment,
	type RenderPassConfig,
} from './RenderPass';
export {
	RenderGraph,
	type TextureFormat,
	type RenderTarget,
	type RenderPassDescriptor,
	type PassContext,
	type GraphStats,
} from './RenderGraph';
export {
	computeTriangleNormal,
	computeAABB,
	aabbSurfaceArea,
	aabbCentroid,
	intersectRayAABB,
	intersectRayTriangle,
	pathTrace,
	nlmDenoise,
	BVH,
	RayTracer,
	type Vec3 as RayTracingVec3,
	type RTApi,
	type RTFeature,
	type RayTracingConfig,
	type AABB,
	type Triangle,
	type Ray,
	type HitRecord,
	type BVHNode,
	type PathTracerScene,
	type NLMConfig,
} from './RayTracing';
export * from './ScreenSpaceEffects';
export {
	ShaderGraph,
	SHADER_NODES,
	type ShaderDataType,
	type ShaderPort,
	type ShaderNodeDef,
	type ShaderPortRef,
	type ShaderNode,
	type ShaderConnection,
	type ShaderUniform,
	type CompiledShader,
} from './ShaderGraph';
export {
	burleyProfile,
	burleyProfileRGB,
	christensenProfile,
	buildSeparableSSSKernel,
	evalSeparableKernel,
	thinSlabTransmission,
	SSSMaterial,
	SSS_PRESETS,
	type RGB as SSSRGB,
	type SSSModel,
	type SSSLayer,
	type SSSConfig,
} from './SubsurfaceScattering';
export {
	VolumetricLight,
	type VolumetricLightConfig,
	type VolumetricSample,
} from './VolumetricLight';

// ── Subdirectory modules ─────────────────────────────────────────────
// WebGPU renderer, types, constants, debug tools
export * from './webgpu';

// Post-processing pipeline (namespaced to avoid BlendMode conflicts)
export * as PostProcess from './postprocess';

// Headless (Puppeteer) rendering
export * from './headless';

