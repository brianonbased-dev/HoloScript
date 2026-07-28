/**
 * character-render — native WebGPU skinned-character render to verified pixels.
 *
 * The character sibling of `native-render/scene-render.ts`: takes a pure-data
 * `CharacterDrawSpec` (skinned mesh + per-frame joint-matrix palette), uploads geometry +
 * palette to a live GPUDevice, runs the `skin-skinning.wgsl` GPU-skinning module, and reads
 * pixels back. NO Three.js, NO R3F.
 *
 * Multi-material via MATERIAL GROUPS (glTF-primitive model): one shared vertex/index/palette,
 * contiguous index sub-ranges each drawn with its own shading pipeline in ONE render pass. The
 * shared frame state (camera/light/palette) binds once (@group0); only the per-group Material
 * (@group1) changes per draw. When `spec.materialGroups` is absent the renderer falls back to a
 * single full-mesh lambert draw — behaviorally identical to the pre-material-groups path.
 *
 * This is BOTH the production render entry AND the headless verification/fallback floor
 * (G.GOLD.006): it runs under Dawn in CI and on a real browser device identically.
 *
 * @module character-render
 */

import skinSkinningWGSL from '../rendering/webgpu/shaders/skin-skinning.wgsl?raw';
import type {
  CharacterDrawSpec,
  CharacterMaterialSpec,
  MaterialGroup,
  ShadingModel,
} from '../native-render/draw-spec';
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
const SHADER_VERTEX = 0x1;
const SHADER_FRAGMENT = 0x2;

/** WGSL fragment entry point per shading model (all live in skin-skinning.wgsl). */
const FRAG_ENTRY: Record<ShadingModel, string> = {
  lambert: 'fs_lambert',
  'skin-sss': 'fs_skin_sss',
  'marschner-hair': 'fs_marschner',
  'refractive-eye': 'fs_eye',
  'woven-cloth': 'fs_woven_cloth',
};

/**
 * Orthographic front-view projection that frames a standing humanoid (looking down -Z, world
 * +Z toward the viewer → smaller depth). Centers a `heightScale`×1.75 m figure vertically.
 * Column-major; maps world z∈[-D,D] → clip depth [0,1] for the depth test.
 */
export function framingMatrix(heightScale = 1): Mat4 {
  const halfH = 1.0 * heightScale;
  const halfW = halfH;
  const cy = 0.9 * heightScale;
  const D = 1.5 * heightScale;
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
  /** World camera position (for view dir / Fresnel; default in front on +Z for the ortho view). */
  cameraPos?: [number, number, number];
  /** Clear RGBA, 0..1 (default dark). */
  clear?: [number, number, number, number];
  heightScale?: number;
}

/** Pack a CharacterMaterialSpec into the 84-float Material uniform (see skin-skinning.wgsl). */
export function packCharacterMaterial(m: CharacterMaterialSpec): Float32Array<ArrayBuffer> {
  const out = new Float32Array(84);
  out.fill(1, 20, 36); // neutral albedo tile
  out.fill(0.5, 36, 68); // neutral tangent-space normal X/Y
  out.fill(m.roughness, 68, 84); // neutral roughness tile
  out[0] = ((m.color >> 16) & 0xff) / 255;
  out[1] = ((m.color >> 8) & 0xff) / 255;
  out[2] = (m.color & 0xff) / 255;
  out[3] = m.opacity;
  if (m.shadingModel === 'skin-sss') {
    out[4] = m.scatterColor[0];
    out[5] = m.scatterColor[1];
    out[6] = m.scatterColor[2];
    out[7] = m.roughness;
    out[8] = m.scatterRadii[0];
    out[9] = m.scatterRadii[1];
    out[10] = m.scatterRadii[2];
    out[11] = 0;
    out[12] = m.specularF0;
    out[13] = m.thickness;
    out[14] = m.transmitStrength;
    out[15] = m.ambient;
  } else if (m.shadingModel === 'marschner-hair') {
    out[4] = m.melanin;
    out[5] = m.melaninRedness;
    out[6] = m.primaryExp;
    out[7] = m.secondaryExp;
  } else if (m.shadingModel === 'refractive-eye') {
    out[4] = m.ior; // scatterColor.x = ior (Fresnel rim)
    out[5] =
      m.eyeRegion === 'sclera'
        ? 1
        : m.eyeRegion === 'iris'
          ? 2
          : m.eyeRegion === 'pupil'
            ? 3
            : m.eyeRegion === 'cornea'
              ? 4
              : 0;
  } else if (m.shadingModel === 'woven-cloth') {
    out[4] = m.roughness;
    out[5] = m.sheen;
    out[6] = m.weaveScale;
    out[7] = m.rimStrength;
    const tile = m.textureTile;
    if (
      tile?.size === 4 &&
      tile.albedo.length === 16 &&
      tile.normalXY.length === 32 &&
      tile.roughness.length === 16
    ) {
      out[16] = 1;
      out[17] = 1;
      out[18] = 1;
      out[19] = Math.max(1, Math.min(16, tile.repeat));
      for (let index = 0; index < 16; index += 1) {
        out[20 + index] = Math.max(0, Math.min(2, tile.albedo[index]));
        out[36 + index] = Math.max(
          0,
          Math.min(1, 0.5 + (tile.normalXY[index * 2] - 0.5) * tile.normalScale)
        );
        out[52 + index] = Math.max(
          0,
          Math.min(1, 0.5 + (tile.normalXY[index * 2 + 1] - 0.5) * tile.normalScale)
        );
        out[68 + index] = Math.max(0.08, Math.min(1, tile.roughness[index]));
      }
    } else {
      out[19] = 1;
    }
  }
  // Non-cloth models leave texture flags disabled; their fragment entry points ignore the tile.
  return out;
}

/**
 * Render a skinned character to an offscreen rgba8unorm texture and read the pixels back.
 * One depth-tested render pass; GPU-skinned via the joint palette; one draw per material group
 * (or a single lambert draw when no groups are given).
 */
export async function renderCharacter(
  device: GPUDevice,
  spec: CharacterDrawSpec,
  opts: CharacterRenderOptions = {}
): Promise<PixelGrid> {
  const size = opts.size ?? 128;
  const hs = opts.heightScale ?? 1;
  const viewProj = opts.viewProj ?? framingMatrix(hs);
  const clear = opts.clear ?? [0.07, 0.07, 0.09, 1];
  const light = opts.lightDir ?? [0.4, 0.7, 0.6];
  const camera = opts.cameraPos ?? [0, 0.9 * hs, 6];
  const format: GPUTextureFormat = 'rgba8unorm';
  const { mesh } = spec;

  const module = device.createShaderModule({ code: skinSkinningWGSL });

  // Explicit shared layouts so the @group(0) frame bind group is portable across every
  // shading-model pipeline (layout:'auto' would make non-portable per-pipeline layouts).
  const frameBGL = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: SHADER_VERTEX | SHADER_FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: SHADER_VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });
  const matBGL = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: SHADER_FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [frameBGL, matBGL] });

  const VERTEX_BUFFERS: GPUVertexBufferLayout[] = [
    { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
    { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
    { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'uint32' }] },
    { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32' }] },
    { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] },
    { arrayStride: 8, attributes: [{ shaderLocation: 5, offset: 0, format: 'float32x2' }] },
  ];

  const pipelineCache = new Map<string, GPURenderPipeline>();
  const getPipeline = (model: ShadingModel, transparent: boolean): GPURenderPipeline => {
    const key = `${model}:${transparent ? 1 : 0}`;
    let p = pipelineCache.get(key);
    if (!p) {
      p = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module, entryPoint: 'vs', buffers: VERTEX_BUFFERS },
        fragment: {
          module,
          entryPoint: FRAG_ENTRY[model],
          targets: [
            {
              format,
              ...(transparent
                ? {
                    blend: {
                      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
                      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
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
      });
      pipelineCache.set(key, p);
    }
    return p;
  };

  // Geometry buffers (shared across all groups).
  const posBuf = device.createBuffer({
    size: mesh.positions.byteLength,
    usage: BUF_VERTEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(posBuf, 0, mesh.positions);
  const normBuf = device.createBuffer({
    size: mesh.normals.byteLength,
    usage: BUF_VERTEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(normBuf, 0, mesh.normals);
  const jiBuf = device.createBuffer({
    size: mesh.jointIndices.byteLength,
    usage: BUF_VERTEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(jiBuf, 0, mesh.jointIndices);
  const jwBuf = device.createBuffer({
    size: mesh.jointWeights.byteLength,
    usage: BUF_VERTEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(jwBuf, 0, mesh.jointWeights);
  const tanBuf = device.createBuffer({
    size: mesh.tangents.byteLength,
    usage: BUF_VERTEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(tanBuf, 0, mesh.tangents);
  const uvData = mesh.uvs ?? new Float32Array(mesh.vertexCount * 2);
  const uvBuf = device.createBuffer({
    size: uvData.byteLength,
    usage: BUF_VERTEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(uvBuf, 0, uvData);
  const idxBuf = device.createBuffer({
    size: mesh.indices.byteLength,
    usage: BUF_INDEX | BUF_COPY_DST,
  });
  device.queue.writeBuffer(idxBuf, 0, mesh.indices);

  // Shared frame uniform: mvp(16) + model(16) + cameraPos(4) + lightDir(4) = 40 floats.
  const mvp = multiply(viewProj, spec.modelMatrix);
  const frame = new Float32Array(40);
  frame.set(mvp, 0);
  frame.set(spec.modelMatrix, 16);
  frame[32] = camera[0];
  frame[33] = camera[1];
  frame[34] = camera[2];
  frame[35] = 0;
  frame[36] = light[0];
  frame[37] = light[1];
  frame[38] = light[2];
  frame[39] = 0;
  const frameBuf = device.createBuffer({
    size: frame.byteLength,
    usage: BUF_UNIFORM | BUF_COPY_DST,
  });
  device.queue.writeBuffer(frameBuf, 0, frame);

  // Shared skin palette storage buffer.
  const jointBuf = device.createBuffer({
    size: spec.jointMatrices.byteLength,
    usage: BUF_STORAGE | BUF_COPY_DST,
  });
  device.queue.writeBuffer(jointBuf, 0, spec.jointMatrices);

  const frameBindGroup = device.createBindGroup({
    layout: frameBGL,
    entries: [
      { binding: 0, resource: { buffer: frameBuf } },
      { binding: 1, resource: { buffer: jointBuf } },
    ],
  });

  // Normalise to material groups; absent → one lambert group over the whole index buffer
  // (byte-for-byte the pre-material-groups behavior).
  const groups: MaterialGroup[] =
    spec.materialGroups && spec.materialGroups.length > 0
      ? spec.materialGroups
      : [
          {
            indexStart: 0,
            indexCount: mesh.indices.length,
            material: { ...spec.material, shadingModel: 'lambert' },
          },
        ];
  // Opaque groups before transparent (depth-correct refraction/blend ordering).
  const ordered = [...groups].sort(
    (a, b) => Number(a.transparent ?? false) - Number(b.transparent ?? false)
  );

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

  pass.setVertexBuffer(0, posBuf);
  pass.setVertexBuffer(1, normBuf);
  pass.setVertexBuffer(2, jiBuf);
  pass.setVertexBuffer(3, jwBuf);
  pass.setVertexBuffer(4, tanBuf);
  pass.setVertexBuffer(5, uvBuf);
  pass.setIndexBuffer(idxBuf, 'uint32');
  pass.setBindGroup(0, frameBindGroup);

  const matBufs: GPUBuffer[] = [];
  for (const g of ordered) {
    const pipe = getPipeline(g.material.shadingModel, !!g.transparent);
    const matData = packCharacterMaterial(g.material);
    const matBuf = device.createBuffer({
      size: matData.byteLength,
      usage: BUF_UNIFORM | BUF_COPY_DST,
    });
    device.queue.writeBuffer(matBuf, 0, matData);
    matBufs.push(matBuf);
    pass.setPipeline(pipe);
    pass.setBindGroup(
      1,
      device.createBindGroup({
        layout: matBGL,
        entries: [{ binding: 0, resource: { buffer: matBuf } }],
      })
    );
    pass.drawIndexed(g.indexCount, 1, g.indexStart);
  }
  pass.end();

  const bytesPerRow = size * 4;
  const readback = device.createBuffer({
    size: bytesPerRow * size,
    usage: BUF_COPY_DST | BUF_MAP_READ,
  });
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
  tanBuf.destroy();
  uvBuf.destroy();
  idxBuf.destroy();
  frameBuf.destroy();
  jointBuf.destroy();
  for (const b of matBufs) b.destroy();

  return { width: size, height: size, data };
}
