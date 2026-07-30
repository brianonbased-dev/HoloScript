/**
 * Native character motion vectors for temporal reprojection.
 *
 * The CPU stage evaluates the exact dual-influence skinning contract used by
 * skin-skinning.wgsl for both the previous and current CharacterDrawSpec. The
 * GPU stage rasterizes those per-vertex vectors with the character index
 * buffer, producing screen-space velocity and depth grids for temporal resolve.
 */

import type { CharacterDrawSpec } from '../native-render/draw-spec';
import type { DepthGrid, MotionVectorGrid } from '../rendering/webgpu/TemporalInputs';
import { multiply, type Mat4 } from './skin-math';

const BUFFER_COPY_DST = 0x0008;
const BUFFER_INDEX = 0x0010;
const BUFFER_MAP_READ = 0x0001;
const BUFFER_VERTEX = 0x0020;
const MAP_READ = 0x0001;
const TEXTURE_COPY_SRC = 0x01;
const TEXTURE_RENDER_ATTACHMENT = 0x10;

export interface CharacterMotionVectorOptions {
  width: number;
  height: number;
  currentViewProjection: Mat4;
  previousViewProjection?: Mat4;
}

export interface CharacterMotionVectorReceipt {
  schemaVersion: 'holoscript.character-motion-vectors.v1';
  entityId: string;
  vertexCount: number;
  movingVertexCount: number;
  invalidVertexCount: number;
  meanMagnitudePixels: number;
  maximumMagnitudePixels: number;
  motionVectorSpace: 'current-minus-previous-pixels';
  dualInfluenceSkinningConsumed: true;
  modelMotionConsumed: true;
  viewProjectionMotionConsumed: true;
  topologyIdentityRequired: true;
  currentClipDigest: string;
  previousClipDigest: string;
  motionDigest: string;
}

export interface CharacterMotionVectorFrame {
  schemaVersion: 'holoscript.character-motion-vector-frame.v1';
  width: number;
  height: number;
  vertexCount: number;
  currentClipPositions: Float32Array<ArrayBuffer>;
  previousClipPositions: Float32Array<ArrayBuffer>;
  currentDepth: Float32Array<ArrayBuffer>;
  motionPixels: Float32Array<ArrayBuffer>;
  receipt: CharacterMotionVectorReceipt;
}

export interface CharacterMotionRasterReceipt {
  schemaVersion: 'holoscript.webgpu-character-motion-raster.v1';
  backend: 'webgpu';
  deviceExecutionMeasured: true;
  width: number;
  height: number;
  vertexCount: number;
  triangleCount: number;
  rasterizedPixelCount: number;
  movingPixelCount: number;
  motionVectorSpace: 'current-minus-previous-pixels';
  depthConvention: 'webgpu-ndc-zero-to-one';
  gpuTimestampMeasured: false;
  timingClassification: 'not-measured';
}

export interface CharacterMotionRasterResult {
  motionVectors: MotionVectorGrid;
  depth: DepthGrid;
  receipt: CharacterMotionRasterReceipt;
}

function assertFrameShape(spec: CharacterDrawSpec, label: string): void {
  const { mesh } = spec;
  if (mesh.vertexCount <= 0 || mesh.positions.length !== mesh.vertexCount * 3) {
    throw new Error(`${label} character motion frame has invalid positions`);
  }
  if (
    mesh.jointIndices.length !== mesh.vertexCount ||
    mesh.jointWeights.length !== mesh.vertexCount
  ) {
    throw new Error(`${label} character motion frame has invalid primary skin channels`);
  }
  if (spec.jointMatrices.length !== spec.jointCount * 16) {
    throw new Error(`${label} character motion frame has invalid joint palette`);
  }
}

function assertTopologyIdentity(current: CharacterDrawSpec, previous: CharacterDrawSpec): void {
  if (
    current.mesh.vertexCount !== previous.mesh.vertexCount ||
    current.mesh.indices.length !== previous.mesh.indices.length
  ) {
    throw new Error('character motion vectors require identical previous/current topology');
  }
  for (let index = 0; index < current.mesh.indices.length; index += 1) {
    if (current.mesh.indices[index] !== previous.mesh.indices[index]) {
      throw new Error('character motion vectors require byte-identical index topology');
    }
  }
}

function transformPoint(
  matrix: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  w: number
): [number, number, number, number] {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w,
  ];
}

function transformJointPoint(
  palette: Float32Array,
  jointIndex: number,
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const offset = Math.trunc(jointIndex) * 16;
  if (offset < 0 || offset + 15 >= palette.length) {
    throw new RangeError(`character motion joint ${jointIndex} exceeds the palette`);
  }
  return [
    palette[offset] * x +
      palette[offset + 4] * y +
      palette[offset + 8] * z +
      palette[offset + 12],
    palette[offset + 1] * x +
      palette[offset + 5] * y +
      palette[offset + 9] * z +
      palette[offset + 13],
    palette[offset + 2] * x +
      palette[offset + 6] * y +
      palette[offset + 10] * z +
      palette[offset + 14],
  ];
}

function skinnedPoint(spec: CharacterDrawSpec, vertex: number): [number, number, number] {
  const positionOffset = vertex * 3;
  const x = spec.mesh.positions[positionOffset];
  const y = spec.mesh.positions[positionOffset + 1];
  const z = spec.mesh.positions[positionOffset + 2];
  const primaryWeight = Math.max(0, Math.min(1, spec.mesh.jointWeights[vertex] ?? 0));
  const secondaryWeight = Math.max(
    0,
    Math.min(
      1 - primaryWeight,
      spec.mesh.secondaryJointWeights?.[vertex] ?? 0
    )
  );
  const residualWeight = 1 - primaryWeight - secondaryWeight;
  const primary = transformJointPoint(
    spec.jointMatrices,
    spec.mesh.jointIndices[vertex],
    x,
    y,
    z
  );
  const secondary = transformJointPoint(
    spec.jointMatrices,
    spec.mesh.secondaryJointIndices?.[vertex] ?? spec.mesh.jointIndices[vertex],
    x,
    y,
    z
  );
  return [
    x * residualWeight + primary[0] * primaryWeight + secondary[0] * secondaryWeight,
    y * residualWeight + primary[1] * primaryWeight + secondary[1] * secondaryWeight,
    z * residualWeight + primary[2] * primaryWeight + secondary[2] * secondaryWeight,
  ];
}

function digestFloat32(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Derive current/previous clip positions and current-minus-previous pixel
 * velocity from two topology-identical character frames.
 */
export function deriveCharacterMotionVectorFrame(
  current: CharacterDrawSpec,
  previous: CharacterDrawSpec,
  options: CharacterMotionVectorOptions
): CharacterMotionVectorFrame {
  assertFrameShape(current, 'current');
  assertFrameShape(previous, 'previous');
  assertTopologyIdentity(current, previous);
  if (
    !Number.isInteger(options.width) ||
    !Number.isInteger(options.height) ||
    options.width <= 0 ||
    options.height <= 0
  ) {
    throw new RangeError('character motion viewport dimensions must be positive integers');
  }

  const previousViewProjection =
    options.previousViewProjection ?? options.currentViewProjection;
  const currentMvp = multiply(
    options.currentViewProjection,
    current.modelMatrix as Mat4
  );
  const previousMvp = multiply(previousViewProjection, previous.modelMatrix as Mat4);
  const vertexCount = current.mesh.vertexCount;
  const currentClipPositions = new Float32Array(vertexCount * 4);
  const previousClipPositions = new Float32Array(vertexCount * 4);
  const currentDepth = new Float32Array(vertexCount);
  const motionPixels = new Float32Array(vertexCount * 2);
  let movingVertexCount = 0;
  let invalidVertexCount = 0;
  let magnitudeSum = 0;
  let maximumMagnitudePixels = 0;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const currentPoint = skinnedPoint(current, vertex);
    const previousPoint = skinnedPoint(previous, vertex);
    const currentClip = transformPoint(currentMvp, ...currentPoint, 1);
    const previousClip = transformPoint(previousMvp, ...previousPoint, 1);
    currentClipPositions.set(currentClip, vertex * 4);
    previousClipPositions.set(previousClip, vertex * 4);

    const valid =
      currentClip.every(Number.isFinite) &&
      previousClip.every(Number.isFinite) &&
      Math.abs(currentClip[3]) > 1e-8 &&
      Math.abs(previousClip[3]) > 1e-8;
    if (!valid) {
      invalidVertexCount += 1;
      currentDepth[vertex] = 1;
      continue;
    }

    const currentNdcX = currentClip[0] / currentClip[3];
    const currentNdcY = currentClip[1] / currentClip[3];
    const previousNdcX = previousClip[0] / previousClip[3];
    const previousNdcY = previousClip[1] / previousClip[3];
    const currentPixelX = (currentNdcX * 0.5 + 0.5) * options.width;
    const currentPixelY = (1 - (currentNdcY * 0.5 + 0.5)) * options.height;
    const previousPixelX = (previousNdcX * 0.5 + 0.5) * options.width;
    const previousPixelY = (1 - (previousNdcY * 0.5 + 0.5)) * options.height;
    const motionX = currentPixelX - previousPixelX;
    const motionY = currentPixelY - previousPixelY;
    const magnitude = Math.hypot(motionX, motionY);
    motionPixels[vertex * 2] = motionX;
    motionPixels[vertex * 2 + 1] = motionY;
    currentDepth[vertex] = currentClip[2] / currentClip[3];
    magnitudeSum += magnitude;
    maximumMagnitudePixels = Math.max(maximumMagnitudePixels, magnitude);
    if (magnitude > 1e-5) movingVertexCount += 1;
  }

  return {
    schemaVersion: 'holoscript.character-motion-vector-frame.v1',
    width: options.width,
    height: options.height,
    vertexCount,
    currentClipPositions,
    previousClipPositions,
    currentDepth,
    motionPixels,
    receipt: {
      schemaVersion: 'holoscript.character-motion-vectors.v1',
      entityId: current.entityId,
      vertexCount,
      movingVertexCount,
      invalidVertexCount,
      meanMagnitudePixels: vertexCount ? magnitudeSum / vertexCount : 0,
      maximumMagnitudePixels,
      motionVectorSpace: 'current-minus-previous-pixels',
      dualInfluenceSkinningConsumed: true,
      modelMotionConsumed: true,
      viewProjectionMotionConsumed: true,
      topologyIdentityRequired: true,
      currentClipDigest: digestFloat32(currentClipPositions),
      previousClipDigest: digestFloat32(previousClipPositions),
      motionDigest: digestFloat32(motionPixels),
    },
  };
}

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

function alignedBytesPerRow(width: number, bytesPerPixel: number): number {
  return Math.ceil((width * bytesPerPixel) / 256) * 256;
}

/**
 * Rasterize a character motion frame into screen-space velocity and NDC depth
 * on a live GPUDevice. Readback proves execution but is not a GPU timing result.
 */
export async function rasterizeCharacterMotionVectorsGPU(
  device: GPUDevice,
  frame: CharacterMotionVectorFrame,
  indices: Uint32Array<ArrayBuffer>
): Promise<CharacterMotionRasterResult> {
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error('character motion raster requires triangle-list indices');
  }
  for (const index of indices) {
    if (index >= frame.vertexCount) {
      throw new RangeError('character motion raster index exceeds vertexCount');
    }
  }

  const module = device.createShaderModule({ code: MOTION_RASTER_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 16,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }],
        },
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
        },
        {
          arrayStride: 4,
          attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: 'rgba32float' }, { format: 'r32float' }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  const createVertexBuffer = (data: Float32Array<ArrayBuffer>): GPUBuffer => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: BUFFER_VERTEX | BUFFER_COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };
  const currentClipBuffer = createVertexBuffer(frame.currentClipPositions);
  const motionBuffer = createVertexBuffer(frame.motionPixels);
  const currentDepthBuffer = createVertexBuffer(frame.currentDepth);
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: BUFFER_INDEX | BUFFER_COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const motionTexture = device.createTexture({
    size: [frame.width, frame.height],
    format: 'rgba32float',
    usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_COPY_SRC,
  });
  const depthValueTexture = device.createTexture({
    size: [frame.width, frame.height],
    format: 'r32float',
    usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_COPY_SRC,
  });
  const depthAttachment = device.createTexture({
    size: [frame.width, frame.height],
    format: 'depth24plus',
    usage: TEXTURE_RENDER_ATTACHMENT,
  });

  const motionBytesPerRow = alignedBytesPerRow(frame.width, 16);
  const depthBytesPerRow = alignedBytesPerRow(frame.width, 4);
  const motionReadback = device.createBuffer({
    size: motionBytesPerRow * frame.height,
    usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
  });
  const depthReadback = device.createBuffer({
    size: depthBytesPerRow * frame.height,
    usage: BUFFER_COPY_DST | BUFFER_MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: motionTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: depthValueTexture.createView(),
        clearValue: { r: 1, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthAttachment.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, currentClipBuffer);
  pass.setVertexBuffer(1, motionBuffer);
  pass.setVertexBuffer(2, currentDepthBuffer);
  pass.setIndexBuffer(indexBuffer, 'uint32');
  pass.drawIndexed(indices.length);
  pass.end();
  encoder.copyTextureToBuffer(
    { texture: motionTexture },
    { buffer: motionReadback, bytesPerRow: motionBytesPerRow, rowsPerImage: frame.height },
    { width: frame.width, height: frame.height, depthOrArrayLayers: 1 }
  );
  encoder.copyTextureToBuffer(
    { texture: depthValueTexture },
    { buffer: depthReadback, bytesPerRow: depthBytesPerRow, rowsPerImage: frame.height },
    { width: frame.width, height: frame.height, depthOrArrayLayers: 1 }
  );
  device.queue.submit([encoder.finish()]);

  await Promise.all([motionReadback.mapAsync(MAP_READ), depthReadback.mapAsync(MAP_READ)]);
  const motionMapped = new Float32Array(motionReadback.getMappedRange());
  const depthMapped = new Float32Array(depthReadback.getMappedRange());
  const motionStride = motionBytesPerRow / 4;
  const depthStride = depthBytesPerRow / 4;
  const motionData = new Float32Array(frame.width * frame.height * 2);
  const depthData = new Float32Array(frame.width * frame.height);
  let rasterizedPixelCount = 0;
  let movingPixelCount = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const sourceMotion = y * motionStride + x * 4;
      const targetMotion = (y * frame.width + x) * 2;
      const targetDepth = y * frame.width + x;
      const motionX = motionMapped[sourceMotion];
      const motionY = motionMapped[sourceMotion + 1];
      const depth = depthMapped[y * depthStride + x];
      motionData[targetMotion] = motionX;
      motionData[targetMotion + 1] = motionY;
      depthData[targetDepth] = depth;
      if (depth < 0.999999) {
        rasterizedPixelCount += 1;
        if (Math.hypot(motionX, motionY) > 1e-5) movingPixelCount += 1;
      }
    }
  }
  motionReadback.unmap();
  depthReadback.unmap();

  motionReadback.destroy();
  depthReadback.destroy();
  motionTexture.destroy();
  depthValueTexture.destroy();
  depthAttachment.destroy();
  currentClipBuffer.destroy();
  motionBuffer.destroy();
  currentDepthBuffer.destroy();
  indexBuffer.destroy();

  return {
    motionVectors: {
      width: frame.width,
      height: frame.height,
      data: motionData,
      space: 'current-minus-previous-pixels',
    },
    depth: { width: frame.width, height: frame.height, data: depthData },
    receipt: {
      schemaVersion: 'holoscript.webgpu-character-motion-raster.v1',
      backend: 'webgpu',
      deviceExecutionMeasured: true,
      width: frame.width,
      height: frame.height,
      vertexCount: frame.vertexCount,
      triangleCount: indices.length / 3,
      rasterizedPixelCount,
      movingPixelCount,
      motionVectorSpace: 'current-minus-previous-pixels',
      depthConvention: 'webgpu-ndc-zero-to-one',
      gpuTimestampMeasured: false,
      timingClassification: 'not-measured',
    },
  };
}
