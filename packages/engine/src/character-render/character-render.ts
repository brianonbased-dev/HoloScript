/**
 * character-render — native WebGPU skinned-character render to verified pixels.
 *
 * The character sibling of `native-render/scene-render.ts`: takes a pure-data
 * `CharacterDrawSpec` (skinned mesh + per-frame joint-matrix palette), uploads the geometry
 * and palette to a live GPUDevice, runs the `skin-skinning.wgsl` GPU-skinning pipeline with a
 * depth buffer, draws to an offscreen texture, and reads the pixels back. NO Three.js, NO R3F.
 *
 * This is BOTH the production render entry for the procedural body AND the headless
 * verification/fallback floor (G.GOLD.006): it runs under Dawn in CI and on a real browser
 * device identically. Gated by callers on a live device (gpu-setup GPU_LIVE) so it never
 * false-greens on a mock host.
 *
 * @module character-render
 */

import skinSkinningWGSL from '../rendering/webgpu/shaders/skin-skinning.wgsl?raw';
import type { CharacterDrawSpec } from '../native-render/draw-spec';
import type { PixelGrid } from '../native-render/gpu-verify';
import { multiply, type Mat4 } from './skin-math';

// WebGPU usage flags (numeric — avoids global-availability deps; matches scene-render.ts).
const BUF_VERTEX = 0x0020;
const BUF_INDEX = 0x0010;
const BUF_UNIFORM = 0x0040;
const BUF_STORAGE = 0x0080;
const BUF_COPY_DST = 0x0008;
const BUF_MAP_READ = 0x0001;
const TEX_RENDER_ATTACHMENT = 0x10;
const TEX_COPY_SRC = 0x01;
const MAP_READ = 0x0001;

/**
 * Orthographic front-view projection that frames a standing humanoid (looking down -Z, world
 * +Z toward the viewer → smaller depth). Centers a `heightScale`×1.75 m figure vertically.
 * Column-major; maps world z∈[-D,D] → clip depth [0,1] for the depth test.
 */
export function framingMatrix(heightScale = 1): Mat4 {
  const halfH = 1.0 * heightScale; // frames y ∈ [cy-halfH, cy+halfH]
  const halfW = halfH; // square framebuffer
  const cy = 0.9 * heightScale; // pelvis-ish center of a 1.75 m figure
  const D = 1.5 * heightScale; // half depth range
  const m = new Float32Array(16);
  m[0] = 1 / halfW;
  m[5] = 1 / halfH;
  m[10] = -1 / (2 * D);
  m[12] = 0;
  m[13] = -cy / halfH;
  m[14] = 0.5;
  m[15] = 1;
  return m;
}

export interface CharacterRenderOptions {
  /** Square framebuffer edge (default 128 → bytesPerRow 512, 256-aligned). */
  size?: number;
  /** Override the view·projection (defaults to framingMatrix for a standing figure). */
  viewProj?: Mat4;
  /** World-space light direction (default upper-front-right). */
  lightDir?: [number, number, number];
  /** Clear RGBA, 0..1 (default dark). */
  clear?: [number, number, number, number];
  heightScale?: number;
}

/**
 * Render a skinned character to an offscreen rgba8unorm texture and read the pixels back.
 * One render pass, depth-tested, GPU-skinned via the joint-matrix palette in `spec`.
 */
export async function renderCharacter(
  device: GPUDevice,
  spec: CharacterDrawSpec,
  opts: CharacterRenderOptions = {}
): Promise<PixelGrid> {
  const size = opts.size ?? 128;
  const viewProj = opts.viewProj ?? framingMatrix(opts.heightScale ?? 1);
  const clear = opts.clear ?? [0.07, 0.07, 0.09, 1];
  const light = opts.lightDir ?? [0.4, 0.7, 0.6];
  const format: GPUTextureFormat = 'rgba8unorm';
  const { mesh } = spec;

  const module = device.createShaderModule({ code: skinSkinningWGSL });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
        { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'uint32' }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32' }] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  // Geometry buffers.
  const posBuf = device.createBuffer({ size: mesh.positions.byteLength, usage: BUF_VERTEX | BUF_COPY_DST });
  device.queue.writeBuffer(posBuf, 0, mesh.positions);
  const normBuf = device.createBuffer({ size: mesh.normals.byteLength, usage: BUF_VERTEX | BUF_COPY_DST });
  device.queue.writeBuffer(normBuf, 0, mesh.normals);
  const jiBuf = device.createBuffer({ size: mesh.jointIndices.byteLength, usage: BUF_VERTEX | BUF_COPY_DST });
  device.queue.writeBuffer(jiBuf, 0, mesh.jointIndices);
  const jwBuf = device.createBuffer({ size: mesh.jointWeights.byteLength, usage: BUF_VERTEX | BUF_COPY_DST });
  device.queue.writeBuffer(jwBuf, 0, mesh.jointWeights);
  const idxBuf = device.createBuffer({ size: mesh.indices.byteLength, usage: BUF_INDEX | BUF_COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, mesh.indices);

  // Uniform: mvp (16) + color (4) + lightDir (4).
  const mvp = multiply(viewProj, spec.modelMatrix);
  const uniform = new Float32Array(24);
  uniform.set(mvp, 0);
  uniform[16] = ((spec.material.color >> 16) & 0xff) / 255;
  uniform[17] = ((spec.material.color >> 8) & 0xff) / 255;
  uniform[18] = (spec.material.color & 0xff) / 255;
  uniform[19] = spec.material.opacity;
  uniform[20] = light[0];
  uniform[21] = light[1];
  uniform[22] = light[2];
  uniform[23] = 0;
  const uBuf = device.createBuffer({ size: uniform.byteLength, usage: BUF_UNIFORM | BUF_COPY_DST });
  device.queue.writeBuffer(uBuf, 0, uniform);

  // Joint-matrix palette (skin = worldPose · invBind), read-only storage.
  const jointBuf = device.createBuffer({ size: spec.jointMatrices.byteLength, usage: BUF_STORAGE | BUF_COPY_DST });
  device.queue.writeBuffer(jointBuf, 0, spec.jointMatrices);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uBuf } },
      { binding: 1, resource: { buffer: jointBuf } },
    ],
  });

  const texture = device.createTexture({
    size: [size, size],
    format,
    usage: TEX_RENDER_ATTACHMENT | TEX_COPY_SRC,
  });
  const depth = device.createTexture({
    size: [size, size],
    format: 'depth24plus',
    usage: TEX_RENDER_ATTACHMENT,
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: texture.createView(),
        clearValue: { r: clear[0], g: clear[1], b: clear[2], a: clear[3] },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depth.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, posBuf);
  pass.setVertexBuffer(1, normBuf);
  pass.setVertexBuffer(2, jiBuf);
  pass.setVertexBuffer(3, jwBuf);
  pass.setIndexBuffer(idxBuf, 'uint32');
  pass.setBindGroup(0, bindGroup);
  pass.drawIndexed(mesh.indices.length);
  pass.end();

  const bytesPerRow = size * 4; // 512 at size=128
  const readback = device.createBuffer({ size: bytesPerRow * size, usage: BUF_COPY_DST | BUF_MAP_READ });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer: readback, bytesPerRow, rowsPerImage: size },
    { width: size, height: size, depthOrArrayLayers: 1 }
  );
  device.queue.submit([encoder.finish()]);

  await readback.mapAsync(MAP_READ);
  const data = new Uint8Array(readback.getMappedRange().slice(0));
  readback.unmap();

  // Cleanup.
  readback.destroy();
  texture.destroy();
  depth.destroy();
  posBuf.destroy();
  normBuf.destroy();
  jiBuf.destroy();
  jwBuf.destroy();
  idxBuf.destroy();
  uBuf.destroy();
  jointBuf.destroy();

  return { width: size, height: size, data };
}
