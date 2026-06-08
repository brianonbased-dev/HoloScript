/**
 * scene-render — Inc 2 (D.083, task 2h3s): render a HoloScript VM scene to native pixels.
 *
 * Takes the pure-data DrawSpec[] (from extractDrawSpecs over the engine VM ECSWorld) and
 * draws each entity natively on a WebGPU device: primitiveToMesh geometry → GPU vertex/index
 * buffers, per-entity {MVP, color} uniform, indexed draw to an offscreen texture. Verified
 * through the gpu-verify readback path — a real pixel, no Three.js.
 *
 * SCOPE: headless render-to-texture (the part this environment + CI-with-Dawn can verify).
 * It deliberately does NOT go through WebGPURenderer's canvas/IDrawCall pipeline-registry
 * machinery (which is browser-canvas-bound per the pre-mortem) — that browser path is a later,
 * /journalist-screenshot-gated step before any default-flip. This proves VM-scene → native pixel.
 */

import type { DrawSpec } from './draw-spec';
import { primitiveToMesh } from './primitive-mesh';
import { type PixelGrid } from './gpu-verify';

const BUF_VERTEX = 0x0020,
  BUF_INDEX = 0x0010,
  BUF_COPY_DST = 0x0008,
  BUF_UNIFORM = 0x0040;
const BUF_MAP_READ = 0x0001;
const TEX_RENDER_ATTACHMENT = 0x10,
  TEX_COPY_SRC = 0x01;
const MAP_READ = 0x0001;

/** Column-major 4x4 multiply: out = a * b. */
function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Symmetric orthographic projection, half-extent `e`. Centers world origin in the viewport. */
export function orthographic(e = 2): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1 / e;
  m[5] = 1 / e;
  m[10] = -0.05;
  m[14] = 0.5;
  m[15] = 1; // z in [-1,1]→[0,1]-ish; depth unused for color
  return m;
}

export interface SceneRenderOptions {
  size?: number; // square framebuffer edge (default 64 → 256-aligned readback)
  viewProj?: Float32Array; // defaults to orthographic(2)
  clear?: [number, number, number, number]; // 0..1 RGBA, default dark
}

/**
 * Render the given draw specs to an offscreen rgba8unorm texture and read the pixels back.
 * One render pass; one vertex/index/uniform buffer + bind group per spec (fine for the small
 * scenes this verifies). `mesh`-kind specs (external geometry) are skipped here.
 */
export async function renderDrawSpecs(
  device: GPUDevice,
  specs: DrawSpec[],
  opts: SceneRenderOptions = {}
): Promise<PixelGrid> {
  const size = opts.size ?? 64;
  const viewProj = opts.viewProj ?? orthographic(2);
  const clear = opts.clear ?? [0.07, 0.07, 0.09, 1];
  const format: GPUTextureFormat = 'rgba8unorm';

  const module = device.createShaderModule({
    code: /* wgsl */ `
      struct U { mvp: mat4x4f, color: vec4f };
      @group(0) @binding(0) var<uniform> u: U;
      @vertex fn vs(@location(0) pos: vec3f) -> @builtin(position) vec4f {
        return u.mvp * vec4f(pos, 1.0);
      }
      @fragment fn fs() -> @location(0) vec4f { return u.color; }
    `,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });

  // Build per-spec GPU resources.
  const draws = specs
    .filter((s) => s.geometry.kind !== 'mesh')
    .map((s) => {
      const mesh = primitiveToMesh(s.geometry.kind, s.geometry.params);
      const vbuf = device.createBuffer({
        size: mesh.positions.byteLength,
        usage: BUF_VERTEX | BUF_COPY_DST,
      });
      device.queue.writeBuffer(vbuf, 0, mesh.positions);
      const ibuf = device.createBuffer({
        size: mesh.indices.byteLength,
        usage: BUF_INDEX | BUF_COPY_DST,
      });
      device.queue.writeBuffer(ibuf, 0, mesh.indices);

      const mvp = mul4(viewProj, s.modelMatrix);
      const uniform = new Float32Array(24); // mat4 (16) + vec4 color (4) + pad (4)
      uniform.set(mvp, 0);
      uniform[16] = ((s.material.color >> 16) & 0xff) / 255;
      uniform[17] = ((s.material.color >> 8) & 0xff) / 255;
      uniform[18] = (s.material.color & 0xff) / 255;
      uniform[19] = s.material.opacity;
      const ubuf = device.createBuffer({
        size: uniform.byteLength,
        usage: BUF_UNIFORM | BUF_COPY_DST,
      });
      device.queue.writeBuffer(ubuf, 0, uniform);

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubuf } }],
      });
      return { vbuf, ibuf, bindGroup, indexCount: mesh.indices.length };
    });

  const texture = device.createTexture({
    size: [size, size],
    format,
    usage: TEX_RENDER_ATTACHMENT | TEX_COPY_SRC,
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
  });
  pass.setPipeline(pipeline);
  for (const d of draws) {
    pass.setVertexBuffer(0, d.vbuf);
    pass.setIndexBuffer(d.ibuf, 'uint32');
    pass.setBindGroup(0, d.bindGroup);
    pass.drawIndexed(d.indexCount);
  }
  pass.end();

  const bytesPerRow = size * 4; // 256 at size=64
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
  readback.destroy();
  texture.destroy();
  for (const d of draws) {
    d.vbuf.destroy();
    d.ibuf.destroy();
  }

  return { width: size, height: size, data };
}
