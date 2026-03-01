/**
 * WebGPU Renderer Types
 *
 * Type definitions for WebGPU-based rendering system
 */

// ============================================================================
// Device and Context Types
// ============================================================================

/** WebGPU initialization options */
export interface IWebGPUInitOptions {
  /** Canvas element or selector */
  canvas: HTMLCanvasElement | string;
  /** Preferred adapter power preference */
  powerPreference?: 'low-power' | 'high-performance';
  /** Required features */
  requiredFeatures?: GPUFeatureName[];
  /** Required limits */
  requiredLimits?: Record<string, number>;
  /** Enable debug mode */
  debug?: boolean;
  /** Preferred texture format (auto-detected if not specified) */
  preferredFormat?: GPUTextureFormat;
  /** MSAA sample count */
  sampleCount?: 1 | 4;
  /** Alpha mode for canvas */
  alphaMode?: GPUCanvasAlphaMode;
}

/** WebGPU context after initialization */
export interface IWebGPUContext {
  /** GPU adapter */
  adapter: GPUAdapter;
  /** GPU device */
  device: GPUDevice;
  /** Canvas context */
  context: GPUCanvasContext;
  /** Preferred texture format */
  format: GPUTextureFormat;
  /** Canvas element */
  canvas: HTMLCanvasElement;
  /** Device capabilities */
  capabilities: IDeviceCapabilities;
}

/** Device capabilities and limits */
export interface IDeviceCapabilities {
  maxTextureDimension2D: number;
  maxTextureArrayLayers: number;
  maxBindGroups: number;
  maxBindingsPerBindGroup: number;
  maxBufferSize: number;
  maxUniformBufferBindingSize: number;
  maxStorageBufferBindingSize: number;
  maxVertexBuffers: number;
  maxVertexAttributes: number;
  maxComputeWorkgroupsPerDimension: number;
  features: Set<string>;
}

// ============================================================================
// Pipeline Types
// ============================================================================

/** Render pipeline descriptor */
export interface IRenderPipelineDescriptor {
  /** Pipeline label for debugging */
  label?: string;
  /** Vertex shader module */
  vertexShader: IShaderModule;
  /** Fragment shader module */
  fragmentShader: IShaderModule;
  /** Vertex buffer layouts */
  vertexBufferLayouts: IVertexBufferLayout[];
  /** Primitive topology */
  topology?: GPUPrimitiveTopology;
  /** Cull mode */
  cullMode?: GPUCullMode;
  /** Front face winding */
  frontFace?: GPUFrontFace;
  /** Depth/stencil state */
  depthStencil?: IDepthStencilState;
  /** Color target states */
  colorTargets: IColorTargetState[];
  /** Bind group layouts */
  bindGroupLayouts?: GPUBindGroupLayout[];
  /** MSAA sample count */
  sampleCount?: number;
}

/** Shader module definition */
export interface IShaderModule {
  /** WGSL source code */
  code: string;
  /** Entry point function name */
  entryPoint: string;
  /** Shader label */
  label?: string;
}

/** Vertex buffer layout */
export interface IVertexBufferLayout {
  /** Stride in bytes */
  arrayStride: number;
  /** Step mode */
  stepMode?: GPUVertexStepMode;
  /** Vertex attributes */
  attributes: IVertexAttribute[];
}

/** Vertex attribute definition */
export interface IVertexAttribute {
  /** Attribute format */
  format: GPUVertexFormat;
  /** Byte offset */
  offset: number;
  /** Shader location */
  shaderLocation: number;
}

/** Depth/stencil state */
export interface IDepthStencilState {
  /** Depth texture format */
  format: GPUTextureFormat;
  /** Enable depth write */
  depthWriteEnabled: boolean;
  /** Depth comparison function */
  depthCompare: GPUCompareFunction;
  /** Stencil front face */
  stencilFront?: IStencilFaceState;
  /** Stencil back face */
  stencilBack?: IStencilFaceState;
  /** Depth bias */
  depthBias?: number;
  /** Depth bias slope scale */
  depthBiasSlopeScale?: number;
  /** Depth bias clamp */
  depthBiasClamp?: number;
}

/** Stencil face state */
export interface IStencilFaceState {
  compare?: GPUCompareFunction;
  failOp?: GPUStencilOperation;
  depthFailOp?: GPUStencilOperation;
  passOp?: GPUStencilOperation;
}

/** Color target state */
export interface IColorTargetState {
  /** Texture format */
  format: GPUTextureFormat;
  /** Blend state */
  blend?: IBlendState;
  /** Color write mask */
  writeMask?: GPUColorWriteFlags;
}

/** Blend state */
export interface IBlendState {
  /** Color blend component */
  color: IBlendComponent;
  /** Alpha blend component */
  alpha: IBlendComponent;
}

/** Blend component */
export interface IBlendComponent {
  operation?: GPUBlendOperation;
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
}

// ============================================================================
// Buffer Types
// ============================================================================

/** GPU buffer descriptor */
export interface IBufferDescriptor {
  /** Buffer label */
  label?: string;
  /** Size in bytes */
  size: number;
  /** Buffer usage flags */
  usage: GPUBufferUsageFlags;
  /** Map at creation */
  mappedAtCreation?: boolean;
}

/** Uniform buffer data */
export interface IUniformBuffer {
  /** Buffer handle */
  buffer: GPUBuffer;
  /** Current data */
  data: ArrayBuffer;
  /** Binding index */
  binding: number;
  /** Last update frame */
  lastUpdateFrame: number;
}

/** Vertex buffer data */
export interface IVertexBuffer {
  /** Buffer handle */
  buffer: GPUBuffer;
  /** Vertex count */
  vertexCount: number;
  /** Stride in bytes */
  stride: number;
  /** Buffer slot */
  slot: number;
}

/** Index buffer data */
export interface IIndexBuffer {
  /** Buffer handle */
  buffer: GPUBuffer;
  /** Index count */
  indexCount: number;
  /** Index format */
  format: GPUIndexFormat;
}

// ============================================================================
// Texture Types
// ============================================================================

/** Texture descriptor */
export interface ITextureDescriptor {
  /** Texture label */
  label?: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Depth or array layers */
  depthOrArrayLayers?: number;
  /** Mip level count */
  mipLevelCount?: number;
  /** Sample count */
  sampleCount?: number;
  /** Texture dimension */
  dimension?: GPUTextureDimension;
  /** Texture format */
  format: GPUTextureFormat;
  /** Texture usage */
  usage: GPUTextureUsageFlags;
}

/** Sampler descriptor */
export interface ISamplerDescriptor {
  /** Sampler label */
  label?: string;
  /** Address mode U */
  addressModeU?: GPUAddressMode;
  /** Address mode V */
  addressModeV?: GPUAddressMode;
  /** Address mode W */
  addressModeW?: GPUAddressMode;
  /** Mag filter */
  magFilter?: GPUFilterMode;
  /** Min filter */
  minFilter?: GPUFilterMode;
  /** Mipmap filter */
  mipmapFilter?: GPUMipmapFilterMode;
  /** LOD min clamp */
  lodMinClamp?: number;
  /** LOD max clamp */
  lodMaxClamp?: number;
  /** Compare function for shadow maps */
  compare?: GPUCompareFunction;
  /** Max anisotropy */
  maxAnisotropy?: number;
}

/** GPU texture with metadata */
export interface IGPUTexture {
  /** Texture handle */
  texture: GPUTexture;
  /** Default view */
  view: GPUTextureView;
  /** Sampler */
  sampler: GPUSampler;
  /** Width */
  width: number;
  /** Height */
  height: number;
  /** Format */
  format: GPUTextureFormat;
  /** Mip levels */
  mipLevels: number;
}

// ============================================================================
// Render Pass Types
// ============================================================================

/** Render pass descriptor */
export interface IRenderPassDescriptor {
  /** Pass label */
  label?: string;
  /** Color attachments */
  colorAttachments: IRenderPassColorAttachment[];
  /** Depth/stencil attachment */
  depthStencilAttachment?: IRenderPassDepthStencilAttachment;
  /** Occlusion query set */
  occlusionQuerySet?: GPUQuerySet;
  /** Timestamp writes */
  timestampWrites?: GPURenderPassTimestampWrites;
}

/** Color attachment */
export interface IRenderPassColorAttachment {
  /** View to render to */
  view: GPUTextureView;
  /** Resolve target for MSAA */
  resolveTarget?: GPUTextureView;
  /** Clear value */
  clearValue?: GPUColor;
  /** Load operation */
  loadOp: GPULoadOp;
  /** Store operation */
  storeOp: GPUStoreOp;
}

/** Depth/stencil attachment */
export interface IRenderPassDepthStencilAttachment {
  /** Depth texture view */
  view: GPUTextureView;
  /** Depth clear value */
  depthClearValue?: number;
  /** Depth load op */
  depthLoadOp?: GPULoadOp;
  /** Depth store op */
  depthStoreOp?: GPUStoreOp;
  /** Depth read-only */
  depthReadOnly?: boolean;
  /** Stencil clear value */
  stencilClearValue?: number;
  /** Stencil load op */
  stencilLoadOp?: GPULoadOp;
  /** Stencil store op */
  stencilStoreOp?: GPUStoreOp;
  /** Stencil read-only */
  stencilReadOnly?: boolean;
}

// ============================================================================
// Render Object Types
// ============================================================================

/** Renderable mesh */
export interface IRenderMesh {
  /** Mesh identifier */
  id: string;
  /** Vertex buffers */
  vertexBuffers: IVertexBuffer[];
  /** Index buffer (optional) */
  indexBuffer?: IIndexBuffer;
  /** Vertex count (for non-indexed draws) */
  vertexCount: number;
  /** Instance count */
  instanceCount: number;
  /** Bounding box for culling */
  boundingBox?: IBoundingBox;
}

/** Bounding box for frustum culling */
export interface IBoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}

/** Material for rendering */
export interface IRenderMaterial {
  /** Material identifier */
  id: string;
  /** Pipeline to use */
  pipelineId: string;
  /** Bind group for material uniforms */
  bindGroup: GPUBindGroup;
  /** Textures */
  textures: Map<string, IGPUTexture>;
  /** Uniform data */
  uniforms: ArrayBuffer;
  /** Transparency flag */
  transparent: boolean;
  /** Double-sided flag */
  doubleSided: boolean;
}

/** Draw call */
export interface IDrawCall {
  /** Mesh to draw */
  mesh: IRenderMesh;
  /** Material to use */
  material: IRenderMaterial;
  /** Model matrix */
  modelMatrix: Float32Array;
  /** Sort key for batching */
  sortKey: number;
  /** Distance from camera (for transparency sorting) */
  cameraDistance?: number;
}

// ============================================================================
// Camera Types
// ============================================================================

/** Camera uniforms */
export interface ICameraUniforms {
  /** View matrix */
  viewMatrix: Float32Array;
  /** Projection matrix */
  projectionMatrix: Float32Array;
  /** View-projection matrix */
  viewProjectionMatrix: Float32Array;
  /** Inverse view matrix */
  inverseViewMatrix: Float32Array;
  /** Inverse projection matrix */
  inverseProjectionMatrix: Float32Array;
  /** Camera position */
  cameraPosition: Float32Array;
  /** Near plane */
  near: number;
  /** Far plane */
  far: number;
  /** Field of view (radians) */
  fov: number;
  /** Aspect ratio */
  aspectRatio: number;
}

/** Scene uniforms */
export interface ISceneUniforms {
  /** Ambient light color */
  ambientColor: Float32Array;
  /** Time since start */
  time: number;
  /** Delta time */
  deltaTime: number;
  /** Frame number */
  frameNumber: number;
}

// ============================================================================
// Renderer Statistics
// ============================================================================

/** Frame statistics */
export interface IFrameStats {
  /** Frame time in milliseconds */
  frameTime: number;
  /** GPU time in milliseconds (if available) */
  gpuTime?: number;
  /** Draw calls */
  drawCalls: number;
  /** Triangles rendered */
  triangles: number;
  /** Vertices processed */
  vertices: number;
  /** Pipeline switches */
  pipelineSwitches: number;
  /** Bind group switches */
  bindGroupSwitches: number;
  /** Buffer uploads */
  bufferUploads: number;
  /** Texture uploads */
  textureUploads: number;
}

/** Renderer statistics */
export interface IRendererStats {
  /** Current frame stats */
  currentFrame: IFrameStats;
  /** Rolling average stats */
  average: IFrameStats;
  /** Total frames rendered */
  totalFrames: number;
  /** FPS */
  fps: number;
  /** GPU memory usage (if available) */
  gpuMemory?: number;
}

// ============================================================================
// Standard Shader Definitions
// ============================================================================

/** Standard PBR vertex shader */
export const STANDARD_VERTEX_SHADER = `
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct CameraUniforms {
  viewProjectionMatrix: mat4x4<f32>,
  cameraPosition: vec3<f32>,
}

struct ModelUniforms {
  modelMatrix: mat4x4<f32>,
  normalMatrix: mat3x3<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: ModelUniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = model.modelMatrix * vec4<f32>(input.position, 1.0);
  output.position = camera.viewProjectionMatrix * worldPos;
  output.worldPosition = worldPos.xyz;
  output.worldNormal = normalize(model.normalMatrix * input.normal);
  output.uv = input.uv;
  return output;
}
`;

/** Standard PBR fragment shader */
export const STANDARD_FRAGMENT_SHADER = `
struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct MaterialUniforms {
  baseColor: vec4<f32>,
  metallic: f32,
  roughness: f32,
  emissive: vec3<f32>,
}

struct LightUniforms {
  direction: vec3<f32>,
  color: vec3<f32>,
  intensity: f32,
}

@group(0) @binding(1) var<uniform> material: MaterialUniforms;
@group(0) @binding(2) var<uniform> light: LightUniforms;
@group(2) @binding(0) var baseColorTexture: texture_2d<f32>;
@group(2) @binding(1) var baseColorSampler: sampler;

const PI: f32 = 3.14159265359;

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let nom = a2;
  var denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  return nom / denom;
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  let nom = NdotV;
  let denom = NdotV * (1.0 - k) + k;
  return nom / denom;
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2 = geometrySchlickGGX(NdotV, roughness);
  let ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let baseColor = textureSample(baseColorTexture, baseColorSampler, input.uv) * material.baseColor;
  let N = normalize(input.worldNormal);
  let V = normalize(-input.worldPosition);
  let L = normalize(-light.direction);
  let H = normalize(V + L);
  
  let F0 = mix(vec3<f32>(0.04), baseColor.rgb, material.metallic);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  let NDF = distributionGGX(N, H, material.roughness);
  let G = geometrySmith(N, V, L, material.roughness);
  
  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  let specular = numerator / denominator;
  
  let kS = F;
  let kD = (vec3<f32>(1.0) - kS) * (1.0 - material.metallic);
  let NdotL = max(dot(N, L), 0.0);
  
  let Lo = (kD * baseColor.rgb / PI + specular) * light.color * light.intensity * NdotL;
  let ambient = vec3<f32>(0.03) * baseColor.rgb;
  var color = ambient + Lo + material.emissive;
  
  // Tone mapping (Reinhard)
  color = color / (color + vec3<f32>(1.0));
  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));
  
  return vec4<f32>(color, baseColor.a);
}
`;

/** Unlit vertex shader */
export const UNLIT_VERTEX_SHADER = `
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
}

struct Uniforms {
  mvpMatrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.mvpMatrix * vec4<f32>(input.position, 1.0);
  output.uv = input.uv;
  output.color = input.color;
  return output;
}
`;

/** Unlit fragment shader */
export const UNLIT_FRAGMENT_SHADER = `
struct FragmentInput {
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
}

@group(0) @binding(1) var colorTexture: texture_2d<f32>;
@group(0) @binding(2) var colorSampler: sampler;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  let texColor = textureSample(colorTexture, colorSampler, input.uv);
  return texColor * input.color;
}
`;
