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
