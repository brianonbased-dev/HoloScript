/** Persistent texture-native rasterizer for character velocity and depth. */

import type { CharacterMotionVectorFrame } from './CharacterMotionVectors';

const BUFFER_COPY_DST = 0x0008;
const BUFFER_INDEX = 0x0010;
const BUFFER_VERTEX = 0x0020;
const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_BINDING = 0x04;
const TEXTURE_RENDER_ATTACHMENT = 0x10;

const MOTION_RASTER_WGSL = /* wgsl */ `
struct VSInput {
  @location(0) currentClip: vec4f,
  @location(1) motionPixels: vec2f,
  @location(2) currentDepth: f32,
}

struct VSOutput {
  @builtin(position) clip: vec4f,
  @location(0) motionPixels: vec2f,
  @location(1) currentDepth: f32,
}

@vertex
fn vs(input: VSInput) -> VSOutput {
  var output: VSOutput;
  output.clip = input.currentClip;
  output.motionPixels = input.motionPixels;
  output.currentDepth = input.currentDepth;
  return output;
}

struct FSOutput {
  @location(0) motion: vec4f,
  @location(1) depth: f32,
}

@fragment
fn fs(input: VSOutput) -> FSOutput {
  var output: FSOutput;
  output.motion = vec4f(input.motionPixels, 0.0, 1.0);
  output.depth = clamp(input.currentDepth, 0.0, 1.0);
  return output;
}
`;

export interface CharacterMotionTextureRasterizerOptions {
  width: number;
  height: number;
  vertexCount: number;
  indices: Uint32Array<ArrayBuffer>;
  label?: string;
}

export interface CharacterMotionTextureRasterReceipt {
  schemaVersion: 'holoscript.webgpu-character-motion-texture-raster.v1';
  backend: 'webgpu';
  width: number;
  height: number;
  vertexCount: number;
  triangleCount: number;
  movingVertexCount: number;
  maximumMagnitudePixels: number;
  motionVectorSpace: 'current-minus-previous-pixels';
  depthConvention: 'webgpu-ndc-zero-to-one';
  persistentPipeline: true;
  persistentGeometryBuffers: true;
  persistentOutputTextures: true;
  perFrameUploadCount: 3;
  zeroCopyTextureOutputs: true;
  intermediateCpuReadbackCount: 0;
  gpuTimestampWritesEncoded: boolean;
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('character motion texture raster dimensions must be positive integers');
  }
}

function createBuffer(device: GPUDevice, label: string, size: number, usage: number): GPUBuffer {
  return device.createBuffer({ label, size, usage: usage | BUFFER_COPY_DST });
}

/**
 * Fixed-topology raster stage. Clip positions and velocity are CPU-derived and
 * uploaded each frame; rasterization and all downstream consumption remain on GPU.
 */
export class CharacterMotionTextureRasterizer {
  readonly width: number;
  readonly height: number;
  readonly vertexCount: number;
  readonly motionTexture: GPUTexture;
  readonly depthTexture: GPUTexture;

  private readonly device: GPUDevice;
  private readonly label: string;
  private readonly indices: Uint32Array<ArrayBuffer>;
  private readonly pipeline: GPURenderPipeline;
  private readonly currentClipBuffer: GPUBuffer;
  private readonly motionBuffer: GPUBuffer;
  private readonly currentDepthBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly depthAttachment: GPUTexture;
  private destroyed = false;

  constructor(device: GPUDevice, options: CharacterMotionTextureRasterizerOptions) {
    assertDimensions(options.width, options.height);
    if (!Number.isInteger(options.vertexCount) || options.vertexCount <= 0) {
      throw new RangeError('character motion texture raster vertexCount must be positive');
    }
    if (options.indices.length === 0 || options.indices.length % 3 !== 0) {
      throw new Error('character motion texture raster requires triangle-list indices');
    }
    for (const index of options.indices) {
      if (index >= options.vertexCount) {
        throw new RangeError('character motion texture raster index exceeds vertexCount');
      }
    }
    this.device = device;
    this.width = options.width;
    this.height = options.height;
    this.vertexCount = options.vertexCount;
    this.indices = options.indices.slice() as Uint32Array<ArrayBuffer>;
    this.label = options.label ?? 'holoscript-character-motion-texture-raster';

    const module = device.createShaderModule({
      label: `${this.label}-shader`,
      code: MOTION_RASTER_WGSL,
    });
    this.pipeline = device.createRenderPipeline({
      label: `${this.label}-pipeline`,
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] },
          { arrayStride: 8, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }] },
          { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }] },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba32float' }, { format: 'r32float' }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.currentClipBuffer = createBuffer(
      device,
      `${this.label}-current-clip`,
      this.vertexCount * 4 * 4,
      BUFFER_VERTEX
    );
    this.motionBuffer = createBuffer(
      device,
      `${this.label}-motion`,
      this.vertexCount * 2 * 4,
      BUFFER_VERTEX
    );
    this.currentDepthBuffer = createBuffer(
      device,
      `${this.label}-current-depth`,
      this.vertexCount * 4,
      BUFFER_VERTEX
    );
    this.indexBuffer = createBuffer(
      device,
      `${this.label}-indices`,
      this.indices.byteLength,
      BUFFER_INDEX
    );
    device.queue.writeBuffer(this.indexBuffer, 0, this.indices);
    this.motionTexture = device.createTexture({
      label: `${this.label}-motion-texture`,
      size: [this.width, this.height],
      format: 'rgba32float',
      usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_BINDING,
    });
    this.depthTexture = device.createTexture({
      label: `${this.label}-depth-texture`,
      size: [this.width, this.height],
      format: 'r32float',
      usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_BINDING | TEXTURE_COPY_SRC,
    });
    this.depthAttachment = device.createTexture({
      label: `${this.label}-depth-attachment`,
      size: [this.width, this.height],
      format: 'depth24plus',
      usage: TEXTURE_RENDER_ATTACHMENT,
    });
  }

  encode(
    encoder: GPUCommandEncoder,
    frame: CharacterMotionVectorFrame,
    timestampWrites?: GPURenderPassTimestampWrites
  ): CharacterMotionTextureRasterReceipt {
    if (this.destroyed) throw new Error('character motion texture rasterizer is destroyed');
    if (
      frame.width !== this.width ||
      frame.height !== this.height ||
      frame.vertexCount !== this.vertexCount
    ) {
      throw new Error('character motion texture raster frame does not match fixed dimensions');
    }
    this.device.queue.writeBuffer(this.currentClipBuffer, 0, frame.currentClipPositions);
    this.device.queue.writeBuffer(this.motionBuffer, 0, frame.motionPixels);
    this.device.queue.writeBuffer(this.currentDepthBuffer, 0, frame.currentDepth);

    const pass = encoder.beginRenderPass({
      label: `${this.label}-pass`,
      colorAttachments: [
        {
          view: this.motionTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: this.depthTexture.createView(),
          clearValue: { r: 1, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthAttachment.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
      ...(timestampWrites ? { timestampWrites } : {}),
    });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.currentClipBuffer);
    pass.setVertexBuffer(1, this.motionBuffer);
    pass.setVertexBuffer(2, this.currentDepthBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.indices.length);
    pass.end();

    return {
      schemaVersion: 'holoscript.webgpu-character-motion-texture-raster.v1',
      backend: 'webgpu',
      width: this.width,
      height: this.height,
      vertexCount: this.vertexCount,
      triangleCount: this.indices.length / 3,
      movingVertexCount: frame.receipt.movingVertexCount,
      maximumMagnitudePixels: frame.receipt.maximumMagnitudePixels,
      motionVectorSpace: 'current-minus-previous-pixels',
      depthConvention: 'webgpu-ndc-zero-to-one',
      persistentPipeline: true,
      persistentGeometryBuffers: true,
      persistentOutputTextures: true,
      perFrameUploadCount: 3,
      zeroCopyTextureOutputs: true,
      intermediateCpuReadbackCount: 0,
      gpuTimestampWritesEncoded: !!timestampWrites,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.depthAttachment.destroy();
    this.depthTexture.destroy();
    this.motionTexture.destroy();
    this.indexBuffer.destroy();
    this.currentDepthBuffer.destroy();
    this.motionBuffer.destroy();
    this.currentClipBuffer.destroy();
  }
}
