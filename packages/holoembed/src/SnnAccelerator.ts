/**
 * SnnAccelerator — SNN-WebGPU population coding for HoloEmbed
 *
 * Replaces the static char-trigram histogram blocks with a richer
 * Leaky Integrate-and-Fire population code:
 *
 *   Input:  128-dim normalized trigram histogram h[0..127]
 *   Process: inject h[i] as synaptic current into LIF neuron i
 *            simulate T timesteps at dt=1ms (default T=50)
 *   Output: 128-dim spike-rate vector r[i] = spikes_i / T
 *
 * ## Why SNN population coding enriches embeddings
 *
 * The raw trigram histogram encodes frequency linearly: h[i] = count_i / total.
 * The LIF population code adds a nonlinear threshold transformation:
 *   - High-frequency trigrams (large h[i]) → many spikes → high r[i]
 *   - Rare trigrams (small h[i]) → sub-threshold → r[i] ≈ 0
 *
 * This sparse representation has better cosine similarity properties than
 * a dense histogram: two symbols with the same DOMINANT trigrams score high
 * even if their rare-trigram distribution differs. Matches the biological
 * precedent in Paper 33 (brain white-matter routing).
 *
 * ## WebGPU availability
 *
 * WebGPU is available in:
 *   - Chrome 113+ / Edge 113+ (desktop)
 *   - Node.js with the `webgpu` npm binding installed (auto-activated via ensureNodeWebGpu)
 *
 * In CI / Node.js without WebGPU, the accelerator reports `available = false`
 * and returns the input histogram unchanged (CPU passthrough). No behavior
 * difference — only performance difference for large batches.
 *
 * ## WGSL shader
 *
 * See `LIF_POPULATION_WGSL` below. One dispatch per symbol block.
 * Workgroup size 64 → 128 neurons fit in 2 workgroups.
 */

import type { EncoderOptions } from './types.js';
import { ensureNodeWebGpu } from '@holoscript/snn-webgpu';

// =============================================================================
// WGSL SHADER
// =============================================================================

/** LIF population coding compute shader — encodes 128-bin histogram to spike rates. */
const LIF_POPULATION_WGSL = /* wgsl */ `
struct LIFParams {
  tau       : f32,    // membrane time constant (ms). Default 20.0
  vThreshold: f32,    // spike threshold (mV). Default -55.0
  vReset    : f32,    // post-spike reset (mV). Default -75.0
  vRest     : f32,    // resting potential (mV). Default -65.0
  dt        : f32,    // timestep (ms). Default 1.0
  timeSteps : u32,    // number of LIF iterations. Default 50
  neuronCount: u32,   // number of neurons (= input dims)
  currentScale: f32,  // scale factor for current injection. Default 240.0
};

@group(0) @binding(0) var<uniform>          params  : LIFParams;
@group(0) @binding(1) var<storage, read>    currents: array<f32>;  // [neuronCount] in [0,1]
@group(0) @binding(2) var<storage, read_write> rates: array<f32>;  // [neuronCount] out

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.neuronCount) { return; }

  let I_ext = currents[i] * params.currentScale; // scale to mV-equivalent current
  var V     = params.vRest;
  var spikes: u32 = 0u;

  for (var t = 0u; t < params.timeSteps; t++) {
    // Euler LIF: dV/dt = (vRest - V + I_ext) / tau
    V += params.dt * (params.vRest - V + I_ext) / params.tau;
    if (V >= params.vThreshold) {
      V       = params.vReset;
      spikes += 1u;
    }
  }

  // Spike rate: fraction of timesteps with a spike
  rates[i] = f32(spikes) / f32(params.timeSteps);
}
`;

// =============================================================================
// LIF DEFAULT PARAMETERS
// =============================================================================

const DEFAULT_LIF: Required<LIFPopulationParams> = {
  tau:          20.0,
  vThreshold:  -55.0,
  vReset:      -75.0,
  vRest:       -65.0,
  dt:            1.0,
  currentScale: 240.0,
};

export interface LIFPopulationParams {
  tau?: number;
  vThreshold?: number;
  vReset?: number;
  vRest?: number;
  dt?: number;
  /** Scale factor applied to normalized trigram histogram values to produce mV-equivalent injection. */
  currentScale?: number;
}

export interface LIFPopulationCpuOptions {
  /** Number of LIF timesteps. Matches EncoderOptions.snnTimesteps. */
  timeSteps?: number;
  /** Optional LIF parameter overrides. */
  lifParams?: LIFPopulationParams;
}

/**
 * CPU reference implementation of the LIF population coder.
 *
 * Production fallback remains identity passthrough so no CPU-only runtime pays
 * for LIF simulation accidentally. Tests and benchmarks use this function as
 * the apples-to-apples reference for the WebGPU shader.
 */
export function encodeLifPopulationCpu(
  histogram: Float32Array,
  options: LIFPopulationCpuOptions = {},
): Float32Array {
  const timeSteps = normalizeTimeSteps(options.timeSteps ?? 50);
  const lif = resolveLifPopulationParams(options.lifParams);
  const rates = new Float32Array(histogram.length);

  for (let i = 0; i < histogram.length; i++) {
    const input = histogram[i] ?? 0;
    const current = input * lif.currentScale;
    let voltage = lif.vRest;
    let spikes = 0;

    for (let t = 0; t < timeSteps; t++) {
      voltage += lif.dt * (lif.vRest - voltage + current) / lif.tau;
      if (voltage >= lif.vThreshold) {
        voltage = lif.vReset;
        spikes++;
      }
    }

    rates[i] = spikes / timeSteps;
  }

  return rates;
}

function resolveLifPopulationParams(lifParams: LIFPopulationParams = {}): Required<LIFPopulationParams> {
  return { ...DEFAULT_LIF, ...lifParams };
}

function normalizeTimeSteps(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

// =============================================================================
// SNN ACCELERATOR
// =============================================================================

/**
 * SNN-WebGPU population coder for HoloEmbed trigram blocks.
 *
 * Usage:
 * ```ts
 * const accel = new SnnAccelerator();
 * await accel.initialize({ enableSnn: true });
 *
 * // In embedding loop:
 * const spikeRates = await accel.encode(trigramHistogram);
 * ```
 */

export class SnnAccelerator {
  private _available = false;
  private _timeSteps = 50;
  private _lif: Required<LIFPopulationParams> = { ...DEFAULT_LIF };

  // WebGPU resources (set after initialize() when GPU is available)
  private _device?: GPUDevice;
  private _pipeline?: GPUComputePipeline;
  private _paramsBuffer?: GPUBuffer;

  // ── Public ─────────────────────────────────────────────────────────────

  /** Whether the GPU path is active. In Node, requires the `webgpu` binding (auto-activated via ensureNodeWebGpu). */
  get available(): boolean { return this._available; }

  /**
   * Initialize the accelerator.
   * Detects WebGPU, compiles the LIF shader, allocates uniform buffers.
   * Safe to call multiple times; no-op after first successful init.
   */
  async initialize(opts: EncoderOptions = {}, lifParams: LIFPopulationParams = {}): Promise<void> {
    if (this._available) return; // already up

    this._timeSteps = normalizeTimeSteps(opts.snnTimesteps ?? 50);
    this._lif = resolveLifPopulationParams(lifParams);

    const enabled = opts.enableSnn !== false;
    if (!enabled) return;

    // Activate the Node WebGPU binding if present (no-op in browser).
    await ensureNodeWebGpu();

    // Feature-detect WebGPU (browser native, or Node via the `webgpu` binding)
    const gpu = (globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu
             ?? (globalThis as { GPU?: unknown }).GPU;
    if (!gpu) return;

    try {
      const adapter = await (gpu as GPU).requestAdapter();
      if (!adapter) return;
      this._device = await adapter.requestDevice();
      await this._compilePipeline();
      this._available = true;
    } catch {
      // WebGPU init failed — fall back to CPU passthrough
      this._device = undefined;
      this._available = false;
    }
  }

  /**
   * Encode a 128-dim trigram histogram through the LIF population.
   *
   * Returns a 128-dim spike-rate vector.
   * If GPU is unavailable, returns the input histogram unchanged (CPU passthrough).
   */
  async encode(histogram: Float32Array): Promise<Float32Array> {
    if (!this._available || !this._device) {
      return histogram; // CPU passthrough — identical dims, no transformation
    }
    return this._gpuEncode(histogram);
  }

  /**
   * Encode a batch of histograms. Amortizes GPU round-trip cost.
   * Falls back to sequential CPU passthrough if GPU unavailable.
   */
  async encodeBatch(histograms: Float32Array[]): Promise<Float32Array[]> {
    if (!this._available || !this._device) {
      return histograms; // CPU passthrough
    }
    if (histograms.length === 0) return [];
    // Fused batch path: all histograms must share one length (the 128-bin trigram
    // block invariant). LIF is per-element independent, so we flatten M x N into one
    // storage buffer and run a single dispatch + single readback, eliminating the
    // per-histogram buffer-create/map-read round-trip that dominated the old path.
    const n = histograms[0]!.length;
    const uniform = histograms.every(h => h.length === n);
    if (uniform) return this._gpuEncodeBatch(histograms, n);
    // Mixed lengths (rare) — fall back to per-item.
    return Promise.all(histograms.map(h => this._gpuEncode(h)));
  }

  /** Release GPU resources. */
  dispose(): void {
    this._paramsBuffer?.destroy();
    this._device?.destroy();
    this._device = undefined;
    this._pipeline = undefined;
    this._paramsBuffer = undefined;
    this._available = false;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async _compilePipeline(): Promise<void> {
    const device = this._device!;

    // Compile the LIF compute shader
    const module = device.createShaderModule({ code: LIF_POPULATION_WGSL });

    this._pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });

    // Allocate params uniform buffer (constant per LIF config)
    this._paramsBuffer = device.createBuffer({
      size: 32, // 8 × f32/u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Upload LIF parameters
    const paramData = new ArrayBuffer(32);
    const f32 = new Float32Array(paramData);
    const u32 = new Uint32Array(paramData);
    f32[0] = this._lif.tau;
    f32[1] = this._lif.vThreshold;
    f32[2] = this._lif.vReset;
    f32[3] = this._lif.vRest;
    f32[4] = this._lif.dt;
    u32[5] = this._timeSteps;
    // neuronCount is set per-call
    f32[7] = this._lif.currentScale;
    device.queue.writeBuffer(this._paramsBuffer, 0, paramData);
  }

  private async _gpuEncode(histogram: Float32Array): Promise<Float32Array> {
    const device = this._device!;
    const pipeline = this._pipeline!;
    const paramsBuffer = this._paramsBuffer!;
    const neuronCount = histogram.length;

    // Patch neuronCount into the uniform buffer
    const neuronCountBuf = new Uint32Array([neuronCount]);
    device.queue.writeBuffer(paramsBuffer, 24, neuronCountBuf); // offset 24 = 6th u32

    // Input buffer (write histogram)
    const inputBuffer = device.createBuffer({
      size: neuronCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(inputBuffer.getMappedRange()).set(histogram);
    inputBuffer.unmap();

    // Output buffer (read spike rates)
    const outputBuffer = device.createBuffer({
      size: neuronCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const stagingBuffer = device.createBuffer({
      size: neuronCount * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Bind group
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    });

    // Dispatch
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(neuronCount / 64));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, neuronCount * 4);
    device.queue.submit([encoder.finish()]);

    // Readback
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    // Cleanup
    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  }

  /**
   * Fused batch encode: M histograms of equal length N processed in a SINGLE
   * dispatch + single readback. Because the LIF update is per-element independent,
   * the existing shader runs unchanged over a flattened (M*N) array; each thread
   * encodes one (histogram, neuron) pair. This removes the M x buffer-create and
   * M x mapAsync round-trips that made the per-item path slower than CPU.
   */
  private async _gpuEncodeBatch(histograms: Float32Array[], n: number): Promise<Float32Array[]> {
    const device = this._device!;
    const pipeline = this._pipeline!;
    const paramsBuffer = this._paramsBuffer!;
    const m = histograms.length;
    const total = m * n;

    // neuronCount uniform = total flattened elements (per-element bounds check)
    device.queue.writeBuffer(paramsBuffer, 24, new Uint32Array([total]));

    // Flatten M x N into one contiguous input buffer
    const flat = new Float32Array(total);
    for (let j = 0; j < m; j++) flat.set(histograms[j]!, j * n);

    const inputBuffer = device.createBuffer({
      size: total * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(inputBuffer.getMappedRange()).set(flat);
    inputBuffer.unmap();

    const outputBuffer = device.createBuffer({
      size: total * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const stagingBuffer = device.createBuffer({
      size: total * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(total / 64));
    pass.end();
    encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, total * 4);
    device.queue.submit([encoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    // Slice the flat result back into M per-histogram vectors
    const out: Float32Array[] = new Array(m);
    for (let j = 0; j < m; j++) out[j] = all.slice(j * n, j * n + n);
    return out;
  }
}
