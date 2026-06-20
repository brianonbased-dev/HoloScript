#!/usr/bin/env node
/**
 * Real-GPU validation for splat-train-backward.wgsl (the trainer's alpha-blend backward kernel).
 *
 * Closes the /critic #2 gap ("the WGSL kernel has never been compiled by naga/tint or dispatched on a
 * GPU; validated only by a CPU twin + a structural regex"). This dispatches the kernel on a real
 * WebGPU adapter (native Chromium / Dawn-Tint, same path as run-p043-shared-sort-capture.mjs) and
 * compares the read-back fixed-point gradient buffer against the CPU backward2D reference computed
 * here in Node. Reports the adapter, any shader compilation messages, and PASS/FAIL within the
 * fixed-point tolerance.
 *
 *   WEBGPU_CHROME=<path> node packages/engine/run-train-backward-gpu.mjs   (uses native GPU Chrome)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHADER_PATH = resolve(__dirname, 'src/gpu/shaders/splat-train-backward.wgsl');
const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FIXED_POINT_SCALE = 65536; // MUST match the kernel
const W = 40, H = 30, N = 24;

// ── deterministic scene (same shape as the parity test) ──
function seeded(s) { return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
function makeScene() {
  const R = seeded(2026);
  const g = {
    N,
    posx: Float64Array.from({ length: N }, () => 2 + R() * (W - 4)),
    posy: Float64Array.from({ length: N }, () => 2 + R() * (H - 4)),
    a: Float64Array.from({ length: N }, () => 0.08 + R() * 0.25),
    b: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.05),
    c: Float64Array.from({ length: N }, () => 0.08 + R() * 0.25),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
    op: Float64Array.from({ length: N }, () => 0.3 + R() * 0.6),
  };
  for (let i = 0; i < N; i++) if (g.a[i] * g.c[i] - g.b[i] * g.b[i] <= 0.001) g.b[i] = 0;
  return g;
}

// ── CPU reference: backward2D (clip=true) — the production path the kernel mirrors ──
function cpuBackward2D(g, dLimg, bg = [0, 0, 0]) {
  const f = () => new Float64Array(N);
  const G = { posx: f(), posy: f(), a: f(), b: f(), c: f(), r: f(), gr: f(), bl: f(), op: f() };
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const o = (py * W + px) * 3, dLr = dLimg[o], dLg = dLimg[o + 1], dLb = dLimg[o + 2];
    const hits = []; let T = 1;
    for (let i = 0; i < N; i++) {
      const dx = px + 0.5 - g.posx[i], dy = py + 0.5 - g.posy[i];
      const sigma = 0.5 * (g.a[i] * dx * dx + g.c[i] * dy * dy) + g.b[i] * dx * dy;
      if (sigma < 0) continue;
      let alpha = g.op[i] * Math.exp(-sigma); if (alpha < 1 / 255) continue;
      const clamped = alpha > 0.999; alpha = Math.min(alpha, 0.999);
      hits.push({ i, dx, dy, sigma, alpha, clamped, Tb: T }); T *= 1 - alpha;
    }
    let sr = T * bg[0], sg = T * bg[1], sb = T * bg[2];
    for (let k = hits.length - 1; k >= 0; k--) {
      const h = hits[k], i = h.i, Tb = h.Tb, al = h.alpha;
      G.r[i] += dLr * Tb * al; G.gr[i] += dLg * Tb * al; G.bl[i] += dLb * Tb * al;
      const inv = 1 / (1 - al);
      const dCdA = dLr * (Tb * g.r[i] - sr * inv) + dLg * (Tb * g.gr[i] - sg * inv) + dLb * (Tb * g.bl[i] - sb * inv);
      sr += al * Tb * g.r[i]; sg += al * Tb * g.gr[i]; sb += al * Tb * g.bl[i];
      if (h.clamped) continue;
      G.op[i] += dCdA * Math.exp(-h.sigma);
      const dCdSigma = dCdA * -al;
      G.a[i] += dCdSigma * 0.5 * h.dx * h.dx; G.c[i] += dCdSigma * 0.5 * h.dy * h.dy; G.b[i] += dCdSigma * h.dx * h.dy;
      const dSdx = g.a[i] * h.dx + g.b[i] * h.dy, dSdy = g.c[i] * h.dy + g.b[i] * h.dx;
      G.posx[i] += dCdSigma * -dSdx; G.posy[i] += dCdSigma * -dSdy;
    }
  }
  return G;
}

async function main() {
  const shaderSource = readFileSync(SHADER_PATH, 'utf8');
  const g = makeScene();
  const Rd = seeded(99);
  const { img } = (() => {
    // forward2D (clip=true) to make a representative dLimg = img - target
    const im = new Float64Array(W * H * 3);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      let T = 1, cr = 0, cg = 0, cb = 0;
      for (let i = 0; i < N; i++) {
        const dx = px + 0.5 - g.posx[i], dy = py + 0.5 - g.posy[i];
        const s = 0.5 * (g.a[i] * dx * dx + g.c[i] * dy * dy) + g.b[i] * dx * dy; if (s < 0) continue;
        let al = g.op[i] * Math.exp(-s); if (al < 1 / 255) continue; al = Math.min(al, 0.999);
        cr += T * al * g.r[i]; cg += T * al * g.gr[i]; cb += T * al * g.bl[i]; T *= 1 - al;
      }
      const o = (py * W + px) * 3; im[o] = cr; im[o + 1] = cg; im[o + 2] = cb;
    }
    return { img: im };
  })();
  const dLimg = new Float64Array(W * H * 3);
  for (let k = 0; k < dLimg.length; k++) dLimg[k] = img[k] - Rd();
  const cpu = cpuBackward2D(g, dLimg);

  // pack inputs for the GPU
  const splats = new Float32Array(N * 9);
  for (let i = 0; i < N; i++) {
    const b = i * 9;
    splats[b] = g.posx[i]; splats[b + 1] = g.posy[i]; splats[b + 2] = g.a[i]; splats[b + 3] = g.b[i];
    splats[b + 4] = g.c[i]; splats[b + 5] = g.r[i]; splats[b + 6] = g.gr[i]; splats[b + 7] = g.bl[i]; splats[b + 8] = g.op[i];
  }
  const dL32 = Float32Array.from(dLimg);

  const { chromium } = await import('@playwright/test');
  const chromePath = process.env.WEBGPU_CHROME && existsSync(process.env.WEBGPU_CHROME)
    ? process.env.WEBGPU_CHROME : existsSync(DEFAULT_CHROME) ? DEFAULT_CHROME : undefined;
  const browser = await chromium.launch({
    headless: process.env.BENCH_HEADLESS !== '0',
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ['--enable-unsafe-webgpu', '--enable-webgpu-developer-features', '--ignore-gpu-blocklist',
      '--force_high_performance_gpu', '--enable-features=Vulkan,WebGPU', '--disable-software-rasterizer'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
    await page.goto(pathToFileURL(resolve(__dirname, 'benchmark-webgpu-physics.html')).href);
    const out = await page.evaluate(async ({ shaderSource, splats, dL32, W, H, N }) => {
      if (!('gpu' in navigator)) return { status: 'no-webgpu' };
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return { status: 'no-adapter' };
      const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
      // Name the actual GPU via WebGL's unmasked renderer (proves hardware, not a software rasterizer).
      let glRenderer = 'unknown';
      try {
        const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        if (gl && dbg) glRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      } catch { /* ignore */ }
      const device = await adapter.requestDevice();
      const errors = [];
      device.addEventListener?.('uncapturederror', (e) => errors.push(String(e.error?.message || e.error)));
      const module = device.createShaderModule({ code: shaderSource });
      const ci = await module.getCompilationInfo?.();
      const messages = (ci?.messages ?? []).map((m) => ({ type: m.type, line: m.lineNum, msg: m.message }));
      if (messages.some((m) => m.type === 'error')) return { status: 'compile-error', info, messages };
      let pipeline;
      try {
        pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'cs_train_backward' } });
      } catch (e) { return { status: 'pipeline-error', info, messages, error: String(e) }; }

      const splatBuf = device.createBuffer({ size: splats.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(splatBuf, 0, new Float32Array(splats));
      const dlBuf = device.createBuffer({ size: dL32.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(dlBuf, 0, new Float32Array(dL32));
      const gradBuf = device.createBuffer({ size: N * 9 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(gradBuf, 0, new Int32Array(N * 9)); // zero
      const uni = new ArrayBuffer(32); const dv = new DataView(uni);
      dv.setUint32(0, W, true); dv.setUint32(4, H, true); dv.setUint32(8, N, true);
      // bg vec4 at offset 16 stays 0
      const uniBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(uniBuf, 0, uni);
      const readBuf = device.createBuffer({ size: N * 9 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniBuf } },
          { binding: 1, resource: { buffer: splatBuf } },
          { binding: 2, resource: { buffer: dlBuf } },
          { binding: 3, resource: { buffer: gradBuf } },
        ],
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8), 1);
      pass.end();
      enc.copyBufferToBuffer(gradBuf, 0, readBuf, 0, N * 9 * 4);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await readBuf.mapAsync(GPUMapMode.READ);
      const grad = Array.from(new Int32Array(readBuf.getMappedRange().slice(0)));
      readBuf.unmap();
      return { status: 'completed', info, glRenderer, messages, grad, errors };
    }, { shaderSource, splats: Array.from(splats), dL32: Array.from(dL32), W, H, N });

    if (out.status !== 'completed') {
      console.error(`[gpu-validate] FAILED at GPU stage: ${out.status}`);
      if (out.messages?.length) console.error('  shader messages:', JSON.stringify(out.messages, null, 2));
      if (out.error) console.error('  error:', out.error);
      return 2;
    }
    console.log(`[gpu-validate] adapter: ${JSON.stringify(out.info)}  GPU(webgl): ${out.glRenderer}`);
    if (out.messages?.length) console.log(`[gpu-validate] shader warnings: ${JSON.stringify(out.messages)}`);

    // compare GPU (dequantized) vs CPU backward2D
    const K = ['posx', 'posy', 'a', 'b', 'c', 'r', 'gr', 'bl', 'op'];
    const ABS_FLOOR = 5e-3, ABS_TOL = 2e-3, REL_TOL = 1e-2;
    let worstRel = 0, worstAbs = 0, nMeaningful = 0, worstRelAt = '', worstAbsAt = '';
    for (let i = 0; i < N; i++) for (let k = 0; k < 9; k++) {
      const gpu = out.grad[i * 9 + k] / FIXED_POINT_SCALE;
      const c = cpu[K[k]][i];
      const ae = Math.abs(gpu - c);
      if (Math.abs(c) > ABS_FLOOR) { nMeaningful++; const rel = ae / Math.abs(c); if (rel > worstRel) { worstRel = rel; worstRelAt = `${K[k]}[${i}]=${c.toFixed(4)}`; } }
      else if (ae > worstAbs) { worstAbs = ae; worstAbsAt = `${K[k]}[${i}]`; }
    }
    const pass = nMeaningful > 10 && worstRel < REL_TOL && worstAbs < ABS_TOL;
    console.log(`[gpu-validate] meaningful grads: ${nMeaningful}  worstRel: ${worstRel.toExponential(2)} (${worstRelAt})  worstAbs: ${worstAbs.toExponential(2)} (${worstAbsAt})`);
    console.log(`[gpu-validate] ${pass ? 'PASS — GPU kernel matches CPU backward2D on real hardware' : 'FAIL — GPU diverges from CPU reference'}`);
    return pass ? 0 : 2;
  } catch (e) {
    console.error('[gpu-validate] fatal', e.stack || e.message);
    return 2;
  } finally {
    await browser.close();
  }
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
