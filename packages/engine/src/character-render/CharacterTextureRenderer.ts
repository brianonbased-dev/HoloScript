/**
 * Persistent, texture-native WebGPU character renderer.
 *
 * Unlike renderCharacter(), this production seam owns reusable GPU resources,
 * records into a caller-owned command encoder, and never maps character pixels
 * through the CPU between render-graph passes.
 */

import skinSkinningWGSL from '../rendering/webgpu/shaders/skin-skinning.wgsl?raw';
import type {
  CharacterDrawSpec,
  CharacterMaterialSpec,
  MaterialGroup,
  ShadingModel,
} from '../native-render/draw-spec';
import {
  deriveCharacterEnvironmentLightReceipt,
  deriveCharacterRenderPipelineReceipt,
  framingMatrix,
  packCharacterMaterial,
  type CharacterRenderOptions,
} from './character-render';
import { multiply } from './skin-math';

const BUFFER_INDEX = 0x0010;
const BUFFER_VERTEX = 0x0020;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const BUFFER_COPY_DST = 0x0008;
const TEXTURE_RENDER_ATTACHMENT = 0x10;
const SHADER_VERTEX = 0x1;
const SHADER_FRAGMENT = 0x2;

const FRAGMENT_ENTRY: Record<ShadingModel, string> = {
  lambert: 'fs_lambert',
  'skin-sss': 'fs_skin_sss',
  'marschner-hair': 'fs_marschner',
  'refractive-eye': 'fs_eye',
  'woven-cloth': 'fs_woven_cloth',
};

const VERTEX_BUFFERS: GPUVertexBufferLayout[] = [
  { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
  { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
  { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'uint32' }] },
  { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32' }] },
  { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] },
  { arrayStride: 8, attributes: [{ shaderLocation: 5, offset: 0, format: 'float32x2' }] },
  { arrayStride: 4, attributes: [{ shaderLocation: 6, offset: 0, format: 'uint32' }] },
  { arrayStride: 4, attributes: [{ shaderLocation: 7, offset: 0, format: 'float32' }] },
];

export interface CharacterTextureRendererOptions {
  width: number;
  height: number;
  label?: string;
}

export interface CharacterTextureRenderReceipt {
  schemaVersion: 'holoscript.webgpu-character-texture-render.v1';
  backend: 'webgpu';
  width: number;
  height: number;
  vertexCount: number;
  triangleCount: number;
  scheduledDrawCount: number;
  sampleCount: 1 | 4;
  persistentGeometryBuffers: true;
  persistentFrameResources: true;
  persistentMaterialResources: true;
  persistentPipelineCount: number;
  geometryUploadCount: 8;
  frameUploadCount: 2;
  materialUploadCount: number;
  zeroCopyTextureOutput: true;
  intermediateCpuReadbackCount: 0;
  gpuTimestampWritesEncoded: boolean;
}

export interface CharacterTextureRenderEncodeOptions extends CharacterRenderOptions {
  timestampWrites?: GPURenderPassTimestampWrites;
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('character texture renderer dimensions must be positive integers');
  }
}

function orderedMaterialGroups(spec: CharacterDrawSpec): MaterialGroup[] {
  const groups = spec.materialGroups?.length
    ? spec.materialGroups
    : [
        {
          indexStart: 0,
          indexCount: spec.mesh.indices.length,
          material: { ...spec.material, shadingModel: 'lambert' as const },
          materialRole: 'fallback' as const,
        },
      ];
  return [...groups].sort(
    (a, b) => Number(a.transparent ?? false) - Number(b.transparent ?? false)
  );
}

function materialSchedule(groups: MaterialGroup[]): string {
  return groups
    .map(
      (group) =>
        `${group.indexStart}:${group.indexCount}:${group.material.shadingModel}:${group.transparent ? 1 : 0}`
    )
    .join('|');
}

function createUploadedBuffer(
  device: GPUDevice,
  label: string,
  data: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
  usage: number
): GPUBuffer {
  const buffer = device.createBuffer({
    label,
    size: data.byteLength,
    usage: usage | BUFFER_COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

/**
 * Fixed-topology character encoder. Geometry allocations, material bind groups,
 * pipeline objects, MSAA storage, and depth storage persist across frames.
 */
export class CharacterTextureRenderer {
  readonly width: number;
  readonly height: number;
  readonly sampleCount: 1 | 4;

  private readonly device: GPUDevice;
  private readonly label: string;
  private readonly vertexCount: number;
  private readonly indexCount: number;
  private readonly jointCount: number;
  private readonly indices: Uint32Array<ArrayBuffer>;
  private readonly schedule: string;
  private readonly groups: MaterialGroup[];
  private readonly positionBuffer: GPUBuffer;
  private readonly normalBuffer: GPUBuffer;
  private readonly jointIndexBuffer: GPUBuffer;
  private readonly jointWeightBuffer: GPUBuffer;
  private readonly tangentBuffer: GPUBuffer;
  private readonly uvBuffer: GPUBuffer;
  private readonly secondaryJointIndexBuffer: GPUBuffer;
  private readonly secondaryJointWeightBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly frameBuffer: GPUBuffer;
  private readonly jointBuffer: GPUBuffer;
  private readonly materialBuffers: GPUBuffer[];
  private readonly materialBindGroups: GPUBindGroup[];
  private readonly pipelines: GPURenderPipeline[];
  private readonly frameBindGroup: GPUBindGroup;
  private readonly multisampleTexture: GPUTexture | null;
  private readonly depthTexture: GPUTexture;
  private destroyed = false;

  constructor(
    device: GPUDevice,
    initialSpec: CharacterDrawSpec,
    options: CharacterTextureRendererOptions
  ) {
    assertDimensions(options.width, options.height);
    this.device = device;
    this.width = options.width;
    this.height = options.height;
    this.label = options.label ?? 'holoscript-character-texture-renderer';
    this.vertexCount = initialSpec.mesh.vertexCount;
    this.indexCount = initialSpec.mesh.indices.length;
    this.jointCount = initialSpec.jointCount;
    this.indices = initialSpec.mesh.indices.slice() as Uint32Array<ArrayBuffer>;
    this.groups = orderedMaterialGroups(initialSpec);
    this.schedule = materialSchedule(this.groups);
    this.sampleCount = deriveCharacterRenderPipelineReceipt(initialSpec).sampleCount;

    const mesh = initialSpec.mesh;
    const uvData = mesh.uvs ?? new Float32Array(mesh.vertexCount * 2);
    const secondaryJointIndices = mesh.secondaryJointIndices ?? mesh.jointIndices;
    const secondaryJointWeights = mesh.secondaryJointWeights ?? new Float32Array(mesh.vertexCount);
    this.positionBuffer = createUploadedBuffer(
      device,
      `${this.label}-positions`,
      mesh.positions,
      BUFFER_VERTEX
    );
    this.normalBuffer = createUploadedBuffer(
      device,
      `${this.label}-normals`,
      mesh.normals,
      BUFFER_VERTEX
    );
    this.jointIndexBuffer = createUploadedBuffer(
      device,
      `${this.label}-joint-indices`,
      mesh.jointIndices,
      BUFFER_VERTEX
    );
    this.jointWeightBuffer = createUploadedBuffer(
      device,
      `${this.label}-joint-weights`,
      mesh.jointWeights,
      BUFFER_VERTEX
    );
    this.tangentBuffer = createUploadedBuffer(
      device,
      `${this.label}-tangents`,
      mesh.tangents,
      BUFFER_VERTEX
    );
    this.uvBuffer = createUploadedBuffer(device, `${this.label}-uvs`, uvData, BUFFER_VERTEX);
    this.secondaryJointIndexBuffer = createUploadedBuffer(
      device,
      `${this.label}-secondary-joint-indices`,
      secondaryJointIndices,
      BUFFER_VERTEX
    );
    this.secondaryJointWeightBuffer = createUploadedBuffer(
      device,
      `${this.label}-secondary-joint-weights`,
      secondaryJointWeights,
      BUFFER_VERTEX
    );
    this.indexBuffer = createUploadedBuffer(
      device,
      `${this.label}-indices`,
      mesh.indices,
      BUFFER_INDEX
    );
    this.frameBuffer = device.createBuffer({
      label: `${this.label}-frame`,
      size: 64 * 4,
      usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
    });
    this.jointBuffer = device.createBuffer({
      label: `${this.label}-joint-palette`,
      size: initialSpec.jointMatrices.byteLength,
      usage: BUFFER_STORAGE | BUFFER_COPY_DST,
    });

    const module = device.createShaderModule({
      label: `${this.label}-shader`,
      code: skinSkinningWGSL,
    });
    const frameLayout = device.createBindGroupLayout({
      label: `${this.label}-frame-layout`,
      entries: [
        { binding: 0, visibility: SHADER_VERTEX | SHADER_FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: SHADER_VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const materialLayout = device.createBindGroupLayout({
      label: `${this.label}-material-layout`,
      entries: [{ binding: 0, visibility: SHADER_FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [frameLayout, materialLayout],
    });
    this.frameBindGroup = device.createBindGroup({
      label: `${this.label}-frame-bind-group`,
      layout: frameLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: this.jointBuffer } },
      ],
    });

    const pipelineCache = new Map<string, GPURenderPipeline>();
    this.materialBuffers = [];
    this.materialBindGroups = [];
    this.pipelines = [];
    for (const [ordinal, group] of this.groups.entries()) {
      const transparent = !!group.transparent;
      const material = group.material;
      const alphaToCoverageEnabled =
        this.sampleCount > 1 &&
        !transparent &&
        material.shadingModel === 'marschner-hair' &&
        material.coverageProfile === 'alpha-to-coverage-v1';
      const pipelineKey = `${material.shadingModel}:${transparent ? 1 : 0}:${this.sampleCount}:${alphaToCoverageEnabled ? 1 : 0}`;
      let pipeline = pipelineCache.get(pipelineKey);
      if (!pipeline) {
        pipeline = device.createRenderPipeline({
          label: `${this.label}-pipeline-${pipelineCache.size}`,
          layout: pipelineLayout,
          vertex: { module, entryPoint: 'vs', buffers: VERTEX_BUFFERS },
          fragment: {
            module,
            entryPoint: FRAGMENT_ENTRY[material.shadingModel],
            targets: [
              {
                format: 'rgba8unorm',
                ...(transparent
                  ? {
                      blend: {
                        color: {
                          srcFactor: 'src-alpha' as const,
                          dstFactor: 'one-minus-src-alpha' as const,
                        },
                        alpha: {
                          srcFactor: 'one' as const,
                          dstFactor: 'one-minus-src-alpha' as const,
                        },
                      },
                    }
                  : {}),
              },
            ],
          },
          primitive: { topology: 'triangle-list', cullMode: 'none' },
          depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: !transparent,
            depthCompare: 'less',
          },
          multisample: { count: this.sampleCount, alphaToCoverageEnabled },
        });
        pipelineCache.set(pipelineKey, pipeline);
      }
      this.pipelines.push(pipeline);
      const materialBuffer = device.createBuffer({
        label: `${this.label}-material-${ordinal}`,
        size: 84 * 4,
        usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
      });
      this.materialBuffers.push(materialBuffer);
      this.materialBindGroups.push(
        device.createBindGroup({
          label: `${this.label}-material-bind-group-${ordinal}`,
          layout: materialLayout,
          entries: [{ binding: 0, resource: { buffer: materialBuffer } }],
        })
      );
    }

    this.multisampleTexture =
      this.sampleCount > 1
        ? device.createTexture({
            label: `${this.label}-multisample-color`,
            size: [this.width, this.height],
            sampleCount: this.sampleCount,
            format: 'rgba8unorm',
            usage: TEXTURE_RENDER_ATTACHMENT,
          })
        : null;
    this.depthTexture = device.createTexture({
      label: `${this.label}-depth`,
      size: [this.width, this.height],
      sampleCount: this.sampleCount,
      format: 'depth24plus',
      usage: TEXTURE_RENDER_ATTACHMENT,
    });
  }

  private assertCompatible(spec: CharacterDrawSpec): MaterialGroup[] {
    if (
      spec.mesh.vertexCount !== this.vertexCount ||
      spec.mesh.indices.length !== this.indexCount ||
      spec.jointCount !== this.jointCount ||
      spec.jointMatrices.byteLength !== this.jointCount * 16 * 4
    ) {
      throw new Error('character texture renderer requires fixed vertex, index, and joint counts');
    }
    for (let index = 0; index < this.indexCount; index += 1) {
      if (spec.mesh.indices[index] !== this.indices[index]) {
        throw new Error('character texture renderer requires byte-identical index topology');
      }
    }
    const groups = orderedMaterialGroups(spec);
    if (materialSchedule(groups) !== this.schedule) {
      throw new Error('character texture renderer requires a fixed material draw schedule');
    }
    if (deriveCharacterRenderPipelineReceipt(spec).sampleCount !== this.sampleCount) {
      throw new Error('character texture renderer requires a fixed multisample schedule');
    }
    return groups;
  }

  encode(
    encoder: GPUCommandEncoder,
    outputTexture: GPUTexture,
    spec: CharacterDrawSpec,
    options: CharacterTextureRenderEncodeOptions = {}
  ): CharacterTextureRenderReceipt {
    if (this.destroyed) throw new Error('character texture renderer is destroyed');
    const groups = this.assertCompatible(spec);
    const mesh = spec.mesh;
    const uvData = mesh.uvs ?? new Float32Array(mesh.vertexCount * 2);
    const secondaryJointIndices = mesh.secondaryJointIndices ?? mesh.jointIndices;
    const secondaryJointWeights = mesh.secondaryJointWeights ?? new Float32Array(mesh.vertexCount);
    const geometryUploads: Array<
      [GPUBuffer, Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>]
    > = [
      [this.positionBuffer, mesh.positions],
      [this.normalBuffer, mesh.normals],
      [this.jointIndexBuffer, mesh.jointIndices],
      [this.jointWeightBuffer, mesh.jointWeights],
      [this.tangentBuffer, mesh.tangents],
      [this.uvBuffer, uvData],
      [this.secondaryJointIndexBuffer, secondaryJointIndices],
      [this.secondaryJointWeightBuffer, secondaryJointWeights],
    ];
    for (const [buffer, data] of geometryUploads) this.device.queue.writeBuffer(buffer, 0, data);

    const heightScale = options.heightScale ?? 1;
    const viewProjection = options.viewProj ?? framingMatrix(heightScale);
    const camera = options.cameraPos ?? [0, 0.9 * heightScale, 6];
    const environment = deriveCharacterEnvironmentLightReceipt(
      options.environmentLight,
      options.lightDir ?? [0.4, 0.7, 0.6]
    );
    const frame = new Float32Array(64);
    frame.set(multiply(viewProjection, spec.modelMatrix), 0);
    frame.set(spec.modelMatrix, 16);
    frame.set(camera, 32);
    frame.set(environment.key.direction, 36);
    frame.set(environment.key.color, 40);
    frame[43] = environment.key.intensity;
    frame.set(environment.fill.direction, 44);
    frame.set(environment.fill.color, 48);
    frame[51] = environment.fill.intensity;
    frame.set(environment.rim.direction, 52);
    frame.set(environment.rim.color, 56);
    frame[59] = environment.rim.intensity;
    frame[60] = environment.exposure;
    frame[61] =
      environment.profile === 'stormglass-room-basis-v2'
        ? 3
        : environment.profile === 'directional-reflection-probe-v1'
          ? 2
          : environment.profile === 'analytic-three-point-v1'
            ? 1
            : 0;
    this.device.queue.writeBuffer(this.frameBuffer, 0, frame);
    this.device.queue.writeBuffer(this.jointBuffer, 0, spec.jointMatrices);
    groups.forEach((group, index) => {
      this.device.queue.writeBuffer(
        this.materialBuffers[index],
        0,
        packCharacterMaterial(group.material)
      );
    });

    const clear = options.clear ?? [0.07, 0.07, 0.09, 1];
    const pass = encoder.beginRenderPass({
      label: `${this.label}-pass`,
      colorAttachments: [
        {
          view: (this.multisampleTexture ?? outputTexture).createView(),
          ...(this.multisampleTexture ? { resolveTarget: outputTexture.createView() } : {}),
          clearValue: { r: clear[0], g: clear[1], b: clear[2], a: clear[3] },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
      ...(options.timestampWrites ? { timestampWrites: options.timestampWrites } : {}),
    });
    pass.setVertexBuffer(0, this.positionBuffer);
    pass.setVertexBuffer(1, this.normalBuffer);
    pass.setVertexBuffer(2, this.jointIndexBuffer);
    pass.setVertexBuffer(3, this.jointWeightBuffer);
    pass.setVertexBuffer(4, this.tangentBuffer);
    pass.setVertexBuffer(5, this.uvBuffer);
    pass.setVertexBuffer(6, this.secondaryJointIndexBuffer);
    pass.setVertexBuffer(7, this.secondaryJointWeightBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.setBindGroup(0, this.frameBindGroup);
    groups.forEach((group, index) => {
      pass.setPipeline(this.pipelines[index]);
      pass.setBindGroup(1, this.materialBindGroups[index]);
      pass.drawIndexed(group.indexCount, 1, group.indexStart);
    });
    pass.end();

    return {
      schemaVersion: 'holoscript.webgpu-character-texture-render.v1',
      backend: 'webgpu',
      width: this.width,
      height: this.height,
      vertexCount: this.vertexCount,
      triangleCount: this.indexCount / 3,
      scheduledDrawCount: groups.length,
      sampleCount: this.sampleCount,
      persistentGeometryBuffers: true,
      persistentFrameResources: true,
      persistentMaterialResources: true,
      persistentPipelineCount: new Set(this.pipelines).size,
      geometryUploadCount: 8,
      frameUploadCount: 2,
      materialUploadCount: groups.length,
      zeroCopyTextureOutput: true,
      intermediateCpuReadbackCount: 0,
      gpuTimestampWritesEncoded: !!options.timestampWrites,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.depthTexture.destroy();
    this.multisampleTexture?.destroy();
    for (const buffer of this.materialBuffers) buffer.destroy();
    this.jointBuffer.destroy();
    this.frameBuffer.destroy();
    this.indexBuffer.destroy();
    this.secondaryJointWeightBuffer.destroy();
    this.secondaryJointIndexBuffer.destroy();
    this.uvBuffer.destroy();
    this.tangentBuffer.destroy();
    this.jointWeightBuffer.destroy();
    this.jointIndexBuffer.destroy();
    this.normalBuffer.destroy();
    this.positionBuffer.destroy();
  }
}
