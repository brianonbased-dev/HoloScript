/**
 * @fileoverview GaussianWebGPUTrainer — GPU dispatch layer for the sovereign 3DGS training loop.
 *
 * Dispatches `splat-train-forward.wgsl` (alpha-blend forward rasterizer) and
 * `splat-train-backward.wgsl` (gradient accumulation via fixed-point atomic<i32>) to absorb the
 * O(N×pixels) hot path on the GPU. CPU handles: 3D→2D projection (`forward3D`), chain-rule
 * gradient backprop to 3D params (`backward3D`), and Adam optimizer.
 *
 * This closes the executor gap flagged by the 2026-06-20 /critic review: the WGSL kernels were
 * GPU-validated on an RTX 3060 (forward: max-abs 1.33e-5 vs CPU ref; backward: worst rel 2.1e-3)
 * but were not yet dispatched from a TypeScript caller. This module is that caller.
 *
 * Usage:
 *   const trainer = new GaussianWebGPUTrainer(device);
 *   await trainer.init();
 *   const result = await runGaussianTrainJobGPU(trainer, job, initial, views);
 *   trainer.destroy();
 *
 * Lifecycle: `init()` once, then `runGaussianTrainJobGPU()` any number of times
 * (buffers are lazily reallocated when N or (W,H) changes). Call `destroy()` when done.
 *
 * Honest scope (same as GaussianTrainRunner — inherited constraints):
 *  - Fixed-cardinality by default (densification optional, same config surface).
 *  - Flat diffuse RGB; no spherical harmonics.
 *  - Per-pixel hit cap (MAX_HITS=256 in backward shader) — deep per-pixel overlap at large scale
 *    needs the tiled-reduction follow-up.
 *  - GPU readback is synchronous per-view (renderFrame → computeGradients → next view).
 *    Pipelining across views is a follow-up optimisation.
 */

import { forward3D, backward3D, type Gaussian3D } from './GaussianTrainer3D';
import { type Gaussian2D, type Gaussian2DGrad } from './GaussianTrainer2D';
import { densifyAndPrune, seededRng } from './GaussianDensify';
import type { GaussianTrainJobSpec, TrainView, TrainResult } from './GaussianTrainRunner';

// Vite/bundler raw-string import — same pattern as GaussianSplatSorter.ts.
import forwardWGSL from './shaders/splat-train-forward.wgsl?raw';
import backwardWGSL from './shaders/splat-train-backward.wgsl?raw';

// ─── constants ────────────────────────────────────────────────────────────────

/** Fields per Gauss struct in WGSL: posx, posy, a, b, c, r, g, bl, op (9 × f32 = 36 bytes). */
const GAUSS_FLOATS = 9;
const GAUSS_BYTES = GAUSS_FLOATS * 4;

/** Gradient slots per gaussian: same ordering as Gauss struct (9 × i32). */
const GRAD_SLOTS = 9;

/** Uniform buffer: width(u32) + height(u32) + count(u32) + _pad(u32) + bg(4×f32) = 32 bytes. */
const UNIFORM_BYTES = 32;

/** Must match FIXED_POINT_SCALE in splat-train-backward.wgsl. */
const FIXED_POINT_SCALE = 65536;

const PARAMS = ['x', 'y', 'z', 'sx', 'sy', 'sz', 'qr', 'qx', 'qy', 'qz', 'op', 'r', 'gr', 'bl'] as const;
type Param = (typeof PARAMS)[number];

// ─── utilities (exported for tests) ─────────────────────────────────────────

/**
 * Pack Gaussian2D SoA → AoS Float32Array for GPU splat buffer upload.
 * The field order matches `struct Gauss { posx, posy, a, b, c, r, g, bl, op }` in the WGSL.
 * Note: `Gaussian2D.gr` (green) maps to the shader's `g` slot.
 */
export function packGauss2D(g2: Gaussian2D): Float32Array {
  const out = new Float32Array(g2.N * GAUSS_FLOATS);
  for (let i = 0; i < g2.N; i++) {
    const b = i * GAUSS_FLOATS;
    out[b]     = g2.posx[i];
    out[b + 1] = g2.posy[i];
    out[b + 2] = g2.a[i];
    out[b + 3] = g2.b[i];
    out[b + 4] = g2.c[i];
    out[b + 5] = g2.r[i];
    out[b + 6] = g2.gr[i]; // shader uses 'g'; TS uses 'gr' to avoid shadowing builtins
    out[b + 7] = g2.bl[i];
    out[b + 8] = g2.op[i];
  }
  return out;
}

/**
 * Convert fixed-point i32 gradient buffer → Gaussian2DGrad SoA.
 * Slot ordering matches the backward shader: posx(0), posy(1), a(2), b(3), c(4), r(5), g(6), bl(7), op(8).
 */
export function unpackGrad(raw: Int32Array, N: number): Gaussian2DGrad {
  const scale = 1 / FIXED_POINT_SCALE;
  const posx = new Float64Array(N), posy = new Float64Array(N);
  const a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N);
  const r = new Float64Array(N), gr = new Float64Array(N), bl = new Float64Array(N);
  const op = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const base = i * GRAD_SLOTS;
    posx[i] = raw[base]     * scale;
    posy[i] = raw[base + 1] * scale;
    a[i]    = raw[base + 2] * scale;
    b[i]    = raw[base + 3] * scale;
    c[i]    = raw[base + 4] * scale;
    r[i]    = raw[base + 5] * scale;
    gr[i]   = raw[base + 6] * scale;
    bl[i]   = raw[base + 7] * scale;
    op[i]   = raw[base + 8] * scale;
  }
  return { posx, posy, a, b, c, r, gr, bl, op };
}

// ─── trainer class ───────────────────────────────────────────────────────────

/**
 * GPU dispatch layer for 3DGS training. Owns WebGPU pipelines and buffer sets.
 * Call `init()` before any dispatch, `destroy()` when done.
 */
export class GaussianWebGPUTrainer {
  private readonly dev: GPUDevice;
  private fwdPipeline: GPUComputePipeline | null = null;
  private bwdPipeline: GPUComputePipeline | null = null;

  // Buffer set — lazily (re)allocated when (N, W, H) changes.
  private allocN = 0;
  private allocW = 0;
  private allocH = 0;
  private uniformBuf: GPUBuffer | null = null;
  private splatBuf: GPUBuffer | null = null;
  private imgBuf: GPUBuffer | null = null;
  private dLBuf: GPUBuffer | null = null;
  private gradBuf: GPUBuffer | null = null;
  private readbackImg: GPUBuffer | null = null;
  private readbackGrad: GPUBuffer | null = null;

  constructor(device: GPUDevice) {
    this.dev = device;
  }

  /** Compile shader modules and create compute pipelines. Must be called once before dispatch. */
  async init(): Promise<void> {
    const d = this.dev;
    const fwdMod = d.createShaderModule({ code: forwardWGSL,  label: 'splat-train-fwd' });
    const bwdMod = d.createShaderModule({ code: backwardWGSL, label: 'splat-train-bwd' });
    [this.fwdPipeline, this.bwdPipeline] = await Promise.all([
      d.createComputePipelineAsync({
        layout: 'auto',
        compute: { module: fwdMod, entryPoint: 'cs_train_forward' },
        label: 'fwd-pipeline',
      }),
      d.createComputePipelineAsync({
        layout: 'auto',
        compute: { module: bwdMod, entryPoint: 'cs_train_backward' },
        label: 'bwd-pipeline',
      }),
    ]);
  }

  private ensureBuffers(N: number, W: number, H: number): void {
    if (N === this.allocN && W === this.allocW && H === this.allocH) return;
    this.destroyBuffers();
    const d = this.dev;
    const pix = W * H;
    const U = GPUBufferUsage;
    // Minimum size 4 to avoid zero-size buffer creation errors on some backends.
    const splatSz = Math.max(4, N * GAUSS_BYTES);
    const gradSz  = Math.max(4, N * GRAD_SLOTS * 4);
    this.uniformBuf  = d.createBuffer({ size: UNIFORM_BYTES,  usage: U.UNIFORM | U.COPY_DST,                     label: 'train-uniforms' });
    this.splatBuf    = d.createBuffer({ size: splatSz,        usage: U.STORAGE | U.COPY_DST,                     label: 'train-splats'   });
    this.imgBuf      = d.createBuffer({ size: pix * 3 * 4,   usage: U.STORAGE | U.COPY_SRC | U.COPY_DST,        label: 'train-img'      });
    this.dLBuf       = d.createBuffer({ size: pix * 3 * 4,   usage: U.STORAGE | U.COPY_DST,                     label: 'train-dL'       });
    this.gradBuf     = d.createBuffer({ size: gradSz,         usage: U.STORAGE | U.COPY_SRC | U.COPY_DST,        label: 'train-grad'     });
    this.readbackImg  = d.createBuffer({ size: pix * 3 * 4,  usage: U.MAP_READ | U.COPY_DST,                     label: 'rb-img'         });
    this.readbackGrad = d.createBuffer({ size: gradSz,        usage: U.MAP_READ | U.COPY_DST,                     label: 'rb-grad'        });
    this.allocN = N; this.allocW = W; this.allocH = H;
  }

  private writeUniforms(W: number, H: number, N: number, bg: readonly [number, number, number]): void {
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const ui = new Uint32Array(buf);
    const uf = new Float32Array(buf);
    ui[0] = W; ui[1] = H; ui[2] = N; ui[3] = 0;
    uf[4] = bg[0]; uf[5] = bg[1]; uf[6] = bg[2]; uf[7] = 0;
    this.dev.queue.writeBuffer(this.uniformBuf!, 0, buf);
  }

  /**
   * Upload packed 2D gaussians → dispatch forward shader → read back composited image.
   * Returns Float32Array of length W*H*3 (row-major RGB, values in [0,1]).
   */
  async renderFrame(
    packed: Float32Array,
    N: number,
    W: number,
    H: number,
    bg: readonly [number, number, number] = [0, 0, 0],
  ): Promise<Float32Array> {
    if (!this.fwdPipeline) throw new Error('GaussianWebGPUTrainer: call init() before renderFrame()');
    this.ensureBuffers(N, W, H);
    const d = this.dev;
    this.writeUniforms(W, H, N, bg);
    d.queue.writeBuffer(this.splatBuf!, 0, packed);

    const enc = d.createCommandEncoder({ label: 'fwd-enc' });
    enc.clearBuffer(this.imgBuf!);
    const fwdBG = d.createBindGroup({
      layout: this.fwdPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf! } },
        { binding: 1, resource: { buffer: this.splatBuf!   } },
        { binding: 2, resource: { buffer: this.imgBuf!     } },
      ],
    });
    const pass = enc.beginComputePass({ label: 'fwd-pass' });
    pass.setPipeline(this.fwdPipeline);
    pass.setBindGroup(0, fwdBG);
    pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8));
    pass.end();
    enc.copyBufferToBuffer(this.imgBuf!, 0, this.readbackImg!, 0, W * H * 3 * 4);
    d.queue.submit([enc.finish()]);

    await this.readbackImg!.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(this.readbackImg!.getMappedRange().slice(0));
    this.readbackImg!.unmap();
    return result;
  }

  /**
   * Upload packed splats + dL/dimg → dispatch backward shader → read back gradient buffer.
   * Returns Gaussian2DGrad SoA (f64 arrays, converted from fixed-point i32).
   */
  async computeGradients(
    packed: Float32Array,
    N: number,
    W: number,
    H: number,
    dLimg: Float32Array,
    bg: readonly [number, number, number] = [0, 0, 0],
  ): Promise<Gaussian2DGrad> {
    if (!this.bwdPipeline) throw new Error('GaussianWebGPUTrainer: call init() before computeGradients()');
    this.ensureBuffers(N, W, H);
    const d = this.dev;
    this.writeUniforms(W, H, N, bg);
    d.queue.writeBuffer(this.splatBuf!, 0, packed);
    d.queue.writeBuffer(this.dLBuf!,   0, dLimg);

    const enc = d.createCommandEncoder({ label: 'bwd-enc' });
    enc.clearBuffer(this.gradBuf!);
    const bwdBG = d.createBindGroup({
      layout: this.bwdPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf! } },
        { binding: 1, resource: { buffer: this.splatBuf!   } },
        { binding: 2, resource: { buffer: this.dLBuf!      } },
        { binding: 3, resource: { buffer: this.gradBuf!    } },
      ],
    });
    const pass = enc.beginComputePass({ label: 'bwd-pass' });
    pass.setPipeline(this.bwdPipeline);
    pass.setBindGroup(0, bwdBG);
    pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8));
    pass.end();
    enc.copyBufferToBuffer(this.gradBuf!, 0, this.readbackGrad!, 0, N * GRAD_SLOTS * 4);
    d.queue.submit([enc.finish()]);

    await this.readbackGrad!.mapAsync(GPUMapMode.READ);
    const rawI32 = new Int32Array(this.readbackGrad!.getMappedRange().slice(0));
    this.readbackGrad!.unmap();
    return unpackGrad(rawI32, N);
  }

  private destroyBuffers(): void {
    this.uniformBuf?.destroy();   this.uniformBuf  = null;
    this.splatBuf?.destroy();     this.splatBuf    = null;
    this.imgBuf?.destroy();       this.imgBuf      = null;
    this.dLBuf?.destroy();        this.dLBuf       = null;
    this.gradBuf?.destroy();      this.gradBuf     = null;
    this.readbackImg?.destroy();  this.readbackImg  = null;
    this.readbackGrad?.destroy(); this.readbackGrad = null;
    this.allocN = 0; this.allocW = 0; this.allocH = 0;
  }

  /** Release all GPU resources. Call when training is complete. */
  destroy(): void {
    this.destroyBuffers();
    this.fwdPipeline = null;
    this.bwdPipeline = null;
  }
}

// ─── GPU training loop ───────────────────────────────────────────────────────

/**
 * GPU-accelerated 3DGS training loop. Mirrors `runGaussianTrainJob` from GaussianTrainRunner.ts
 * but dispatches the O(N×pixels) forward+backward rasterization to the GPU.
 *
 * The training structure is identical (Adam + optional densification); only the rasterize and
 * gradient-accumulate steps move to the GPU — projection and optimizer remain on CPU.
 *
 * @param trainer An initialised GaussianWebGPUTrainer (call trainer.init() before this).
 * @param bg Background color for rendering (default black).
 * @param onProgress Called every iteration with (iterIndex, loss); omit to suppress.
 */
export async function runGaussianTrainJobGPU(
  trainer: GaussianWebGPUTrainer,
  job: GaussianTrainJobSpec,
  initial: Gaussian3D,
  views: TrainView[],
  bg: readonly [number, number, number] = [0, 0, 0],
  onProgress?: (iter: number, loss: number) => void,
): Promise<TrainResult> {
  if (views.length === 0) throw new Error('runGaussianTrainJobGPU: no training views provided');

  let g = initial;
  const iters = Math.max(1, Math.floor(job.hyperparams.iterations));
  const dc = job.densification;
  const rng = seededRng(dc?.seed ?? 1);

  function lrMap(): Record<Param, number> {
    const lr = job.hyperparams.learningRates;
    return { x: lr.position, y: lr.position, z: lr.position, sx: lr.scale, sy: lr.scale, sz: lr.scale, qr: lr.rotation, qx: lr.rotation, qy: lr.rotation, qz: lr.rotation, op: lr.opacity, r: lr.color, gr: lr.color, bl: lr.color };
  }
  const zeros = (n: number): Float64Array => new Float64Array(n);

  let m: Record<string, Float64Array> = {}, vAdam: Record<string, Float64Array> = {};
  for (const p of PARAMS) { m[p] = zeros(g.N); vAdam[p] = zeros(g.N); }

  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  let gradAccum2d = zeros(g.N);
  let accumCount = 0;
  const lossHistory: number[] = [];
  let initialLoss = 0, loss = 0;
  const lr = lrMap();

  for (let it = 0; it < iters; it++) {
    const N = g.N;
    const G: Record<string, Float64Array> = {};
    for (const p of PARAMS) G[p] = zeros(N);
    loss = 0;

    for (const view of views) {
      // CPU: project 3D gaussians → 2D projected gaussians + intermediates for backprop.
      const { g2, I } = forward3D(g, view.cam, view.W, view.H);
      const packed = packGauss2D(g2);

      // GPU: rasterize → read back rendered image.
      const img = await trainer.renderFrame(packed, N, view.W, view.H, bg);

      // CPU: L1 loss gradient (img[k] - target[k]).
      const dLimg = new Float32Array(img.length);
      for (let k = 0; k < img.length; k++) {
        const d = img[k] - (view.target as Float64Array)[k];
        dLimg[k] = d;
        loss += 0.5 * d * d;
      }

      // GPU: backward → read back Gaussian2D gradients (fixed-point → f64 SoA).
      const dG2 = await trainer.computeGradients(packed, N, view.W, view.H, dLimg, bg);

      // CPU: chain-rule 3D parameter gradients through the projection.
      const grad = backward3D(g, view.cam, view.W, view.H, I, dG2);
      for (const p of PARAMS) {
        const gp = grad[p as keyof typeof grad] as Float64Array;
        const acc = G[p];
        for (let i = 0; i < N; i++) acc[i] += gp[i];
      }
      if (dc) {
        for (let i = 0; i < N; i++) gradAccum2d[i] += Math.hypot(dG2.posx[i], dG2.posy[i]);
      }
    }
    if (dc) accumCount += views.length;
    if (it === 0) initialLoss = loss;
    lossHistory.push(loss);
    onProgress?.(it, loss);

    // Adam step with per-group learning rates.
    const t = it + 1;
    for (const p of PARAMS) {
      const gp = G[p], mp = m[p], vp = vAdam[p];
      const buf = (g as unknown as Record<Param, Float64Array>)[p];
      const step = lr[p];
      for (let i = 0; i < N; i++) {
        const gr = gp[i];
        mp[i] = b1 * mp[i] + (1 - b1) * gr;
        vp[i] = b2 * vp[i] + (1 - b2) * gr * gr;
        buf[i] -= step * (mp[i] / (1 - b1 ** t)) / (Math.sqrt(vp[i] / (1 - b2 ** t)) + eps);
        if      (p === 'op')                          buf[i] = Math.max(0.02, Math.min(0.999, buf[i]));
        else if (p === 'sx' || p === 'sy' || p === 'sz') buf[i] = Math.max(0.02, buf[i]);
        else if (p === 'r' || p === 'gr' || p === 'bl')  buf[i] = Math.max(0, Math.min(1, buf[i]));
      }
    }

    // Adaptive density control (mirrors GaussianTrainRunner densification block).
    if (dc && it >= dc.fromIter && it <= dc.untilIter && (it + 1) % dc.interval === 0 && accumCount > 0) {
      const avgGrad2d = new Float64Array(g.N);
      for (let i = 0; i < g.N; i++) avgGrad2d[i] = gradAccum2d[i] / accumCount;
      const { gaussians, origin } = densifyAndPrune(
        g, { avgGrad2d },
        { gradThreshold: dc.gradThreshold, opacityPrune: dc.opacityPrune, scaleThreshold: dc.scaleThreshold, splitFactor: dc.splitFactor, maxGaussians: dc.maxGaussians },
        rng,
      );
      const nm: Record<string, Float64Array> = {}, nv: Record<string, Float64Array> = {};
      for (const p of PARAMS) {
        const a = zeros(gaussians.N), b = zeros(gaussians.N);
        for (let j = 0; j < gaussians.N; j++) { const o = origin[j]; if (o >= 0) { a[j] = m[p][o]; b[j] = vAdam[p][o]; } }
        nm[p] = a; nv[p] = b;
      }
      g = gaussians; m = nm; vAdam = nv;
      gradAccum2d = zeros(g.N); accumCount = 0;
    }
  }

  return { gaussians: g, initialLoss, finalLoss: loss, iterations: iters, lossHistory, finalCount: g.N };
}
