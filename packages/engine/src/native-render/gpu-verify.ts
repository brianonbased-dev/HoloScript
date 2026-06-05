/**
 * gpu-verify — the render-verification gate for the native render path (D.083, task 2h3s).
 *
 * The pre-mortem's irreducible risk: WebGPU can't be unit-tested in Node, and a Node-green
 * suite "passing" while rendering nothing is the green-on-black trap (W.667/W.684). This is
 * the gate that closes it: render a real frame to an offscreen texture on a LIVE GPUDevice
 * and read the pixels BACK — an actual pixel, not a mock. Callers MUST gate on a live device
 * (e.g. gpu-setup's GPU_LIVE); on a mock/no-GPU host the render test skips, never false-passes.
 *
 * Zero foreign-engine deps (no three.js) — straight WebGPU + WGSL. The Inc-2 GPU backend
 * verifies its real .holo scene render through this same readback path.
 */

// WebGPU usage flags (spec constants — referenced numerically to avoid global-availability deps).
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const TEXTURE_USAGE_COPY_SRC = 0x01;
const BUFFER_USAGE_COPY_DST = 0x0008;
const BUFFER_USAGE_MAP_READ = 0x0001;
const MAP_MODE_READ = 0x0001;

export interface PixelGrid {
  width: number;
  height: number;
  /** RGBA bytes, row-major, length = width*height*4. */
  data: Uint8Array;
}

/** Read one RGBA pixel as a 4-tuple. */
export function pixelAt(grid: PixelGrid, x: number, y: number): [number, number, number, number] {
  const i = (y * grid.width + x) * 4;
  return [grid.data[i], grid.data[i + 1], grid.data[i + 2], grid.data[i + 3]];
}

/**
 * Render a single solid-color full-viewport triangle to an offscreen rgba8unorm texture and
 * read the pixels back. The minimal proof that the native WebGPU render→readback path works
 * end-to-end on a real device. `size` defaults to 64 so bytesPerRow = 64*4 = 256 (the required
 * copyTextureToBuffer alignment) with no padding math.
 *
 * @param device  a LIVE GPUDevice (mock devices will not produce real pixels — gate on GPU_LIVE).
 * @param color   RGBA in 0..1.
 */
export async function renderSolidColor(
  device: GPUDevice,
  color: [number, number, number, number] = [1, 0, 0, 1],
  size = 64,
): Promise<PixelGrid> {
  const format: GPUTextureFormat = 'rgba8unorm';
  const [r, g, b, a] = color;

  const texture = device.createTexture({
    size: [size, size],
    format,
    usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_COPY_SRC,
  });

  const module = device.createShaderModule({
    code: /* wgsl */ `
      @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
        return vec4f(p[i], 0.0, 1.0);
      }
      @fragment fn fs() -> @location(0) vec4f {
        return vec4f(${r}, ${g}, ${b}, ${a});
      }
    `,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: texture.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.draw(3);
  pass.end();

  const bytesPerRow = size * 4; // 256 at size=64 (copyTextureToBuffer requires 256-multiple)
  const readback = device.createBuffer({
    size: bytesPerRow * size,
    usage: BUFFER_USAGE_COPY_DST | BUFFER_USAGE_MAP_READ,
  });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer: readback, bytesPerRow, rowsPerImage: size },
    { width: size, height: size, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);

  await readback.mapAsync(MAP_MODE_READ);
  const data = new Uint8Array(readback.getMappedRange().slice(0));
  readback.unmap();
  readback.destroy();
  texture.destroy();

  return { width: size, height: size, data };
}
