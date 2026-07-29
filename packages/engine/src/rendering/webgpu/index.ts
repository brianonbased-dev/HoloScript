/**
 * WebGPU Render Module
 *
 * WebGPU-based rendering for HoloScript
 */

// Types
export type {
  IWebGPUInitOptions,
  IWebGPUContext,
  IDeviceCapabilities,
  IRenderPipelineDescriptor,
  IShaderModule,
  IVertexAttribute,
  IVertexBufferLayout,
  IDepthStencilState,
  IColorTargetState,
  IBlendState,
  IBlendComponent,
  IBufferDescriptor,
  IUniformBuffer,
  IVertexBuffer,
  IIndexBuffer,
  ITextureDescriptor,
  ISamplerDescriptor,
  IGPUTexture,
  IRenderPassDescriptor,
  IRenderPassColorAttachment,
  IRenderPassDepthStencilAttachment,
  IRenderMesh,
  IBoundingBox,
  IRenderMaterial,
  IDrawCall,
  ICameraUniforms,
  ISceneUniforms,
  IFrameStats,
  IRendererStats,
} from './WebGPUTypes';

// Constants
export {
  STANDARD_VERTEX_SHADER,
  STANDARD_FRAGMENT_SHADER,
  UNLIT_VERTEX_SHADER,
  UNLIT_FRAGMENT_SHADER,
} from './WebGPUTypes';

// Renderer
export { WebGPURenderer } from './WebGPURenderer';

// Deterministic temporal history policy and native WebGPU resolve
export {
  TEMPORAL_CONVERGENCE_PROFILES,
  TemporalConvergenceController,
  jitterProjectionMatrix,
  resolveTemporalFrameGPU,
  temporalHaltonJitter,
  type TemporalConvergenceConfig,
  type TemporalConvergenceProfile,
  type TemporalConvergenceReceipt,
  type TemporalFramePlan,
  type TemporalFrameSignals,
  type TemporalInvalidationReason,
  type TemporalResolveOptions,
  type TemporalResolveReceipt,
  type TemporalResolveResult,
} from './TemporalConvergence';

// Debug tools
export { PhysicsDebugDrawer } from './PhysicsDebugDrawer';
