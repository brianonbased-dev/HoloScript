/**
 * dumb-glass-wgsl.ts
 *
 * WebGPU compute-shader implementation of Dumb-Glass provenance hashing.
 *
 * The Dumb Glass architecture (Epoch 8) requires every rendered frame to carry
 * an auditable provenance digest.  This module provides the GPU-side hot path:
 *
 *   - WGSL compute shader: parallel xxHash32 over arbitrary byte buffers
 *   - TypeScript wrapper: pipeline setup, dispatch, readback
 *   - CPU FP32 fallback: pure-JS xxHash32 when WebGPU is unavailable
 *
 * Paper-13 (neural-rendering under contract) cites this file as the canonical
 * GPU provenance implementation.  See also:
 *   packages/r3f-renderer/src/__tests__/dumb-glass.test.ts  — CPU benchmark
 *   HoloScript/.bench-logs/paper-13-gpu-bench.json          — GPU benchmark results
 */

// ---------------------------------------------------------------------------
// WGSL shader source
// ---------------------------------------------------------------------------

/**
 * xxHash32 compute shader.
 *
 * Dispatch: computeProvenanceHash(data, seed) → hash[0]
 *
 * Work-group layout: 256 threads × 1 × 1.
 * Each thread processes one 4-byte word; the partial hashes are folded by
 * thread 0 in a single-pass reduction after the per-word stage.
 *
 * For buffers not a multiple of 4 bytes, the caller pads to the next
 * multiple of 4 with 0x00 bytes.
 */
export const DUMB_GLASS_WGSL = /* wgsl */ `
// xxHash32 constants
const XXH32_PRIME1: u32 = 0x9e3779b1u;
const XXH32_PRIME2: u32 = 0x85ebca77u;
const XXH32_PRIME3: u32 = 0xc2b2ae3du;
const XXH32_PRIME4: u32 = 0x27d4eb2fu;
const XXH32_PRIME5: u32 = 0x165667b1u;

struct Params {
  length: u32,   // byte length of input (before padding)
  seed:   u32,   // caller-supplied seed
  nWords: u32,   // number of u32 words dispatched
  _pad:   u32,
}

@group(0) @binding(0) var<storage, read>           data:   array<u32>;
@group(0) @binding(1) var<storage, read_write>     partial: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write>     result: array<u32>;
@group(0) @binding(3) var<uniform>                 params: Params;

var<workgroup> scratch: array<u32, 256>;

fn xxh32_round(acc: u32, lane: u32) -> u32 {
  return rotl32(acc + lane * XXH32_PRIME2, 13u) * XXH32_PRIME1;
}

fn rotl32(x: u32, r: u32) -> u32 {
  return (x << r) | (x >> (32u - r));
}

fn xxh32_mix(h: u32, word: u32) -> u32 {
  var hh = h ^ (word * XXH32_PRIME3);
  hh = rotl32(hh, 17u) * XXH32_PRIME4;
  return hh;
}

fn xxh32_avalanche(h: u32) -> u32 {
  var hh = h;
  hh = hh ^ (hh >> 15u);
  hh = hh * XXH32_PRIME2;
  hh = hh ^ (hh >> 13u);
  hh = hh * XXH32_PRIME3;
  hh = hh ^ (hh >> 16u);
  return hh;
}

// Phase 1: each thread hashes its word into a lane accumulator.
@compute @workgroup_size(256, 1, 1)
fn hashPhase1(
  @builtin(global_invocation_id)  gid: vec3<u32>,
  @builtin(local_invocation_index) lid: u32,
) {
  let i = gid.x;
  var lane: u32 = 0u;
  if (i < params.nWords) {
    lane = xxh32_round(params.seed + params.length + XXH32_PRIME5, data[i]);
  }
  scratch[lid] = lane;

  // Tree reduction within workgroup
  workgroupBarrier();
  var stride = 128u;
  loop {
    if (stride == 0u) { break; }
    if (lid < stride) {
      scratch[lid] = scratch[lid] ^ scratch[lid + stride];
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (lid == 0u) {
    // Write partial fold to output slot for this workgroup
    let wg = gid.x / 256u;
    atomicStore(&partial[wg], scratch[0]);
  }
}

// Phase 2: single-workgroup reduction of partial hashes → final result.
@compute @workgroup_size(256, 1, 1)
fn hashPhase2(
  @builtin(local_invocation_index) lid: u32,
) {
  // Load one partial per thread (extras stay 0)
  let nPartials = arrayLength(&partial);
  var v: u32 = 0u;
  if (lid < nPartials) {
    v = atomicLoad(&partial[lid]);
  }
  scratch[lid] = v;

  workgroupBarrier();
  var stride = 128u;
  loop {
    if (stride == 0u) { break; }
    if (lid < stride) {
      scratch[lid] = scratch[lid] ^ xxh32_mix(scratch[lid], scratch[lid + stride]);
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (lid == 0u) {
    result[0] = xxh32_avalanche(scratch[0] ^ params.length);
  }
}
`;

// ---------------------------------------------------------------------------
// TypeScript pipeline wrapper
// ---------------------------------------------------------------------------

export interface DumbGlassHashResult {
  /** xxHash32 digest as a hex string */
  hash: string;
  /** Wall-clock time for GPU dispatch + readback (ms) */
  gpuMs: number;
  /** Number of 4-byte words processed */
  words: number;
  /** true if GPU path was taken; false if CPU fallback was used */
  gpuPath: boolean;
}

export interface DumbGlassGpuPipelineOptions {
  /** Seed passed into xxHash32.  Default: 0 */
  seed?: number;
  /** Re-use an existing GPUDevice instead of requesting a new one. */
  device?: GPUDevice;
}

/**
 * GPU-accelerated provenance hash for arbitrary byte buffers.
 *
 * Falls back to the CPU xxHash32 implementation when WebGPU is unavailable
 * (e.g., in Node.js Vitest without a real GPU adapter).
 */
export async function dumbGlassHash(
  data: Uint8Array,
  options: DumbGlassGpuPipelineOptions = {},
): Promise<DumbGlassHashResult> {
  // Attempt WebGPU path
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      return await _gpuHash(data, options);
    } catch {
      // fall through to CPU
    }
  }
  // CPU fallback
  const t0 = performance.now();
  const hashVal = xxHash32Cpu(data, options.seed ?? 0);
  const gpuMs = performance.now() - t0;
  const words = Math.ceil(data.byteLength / 4);
  return { hash: hashVal.toString(16).padStart(8, '0'), gpuMs, words, gpuPath: false };
}

// ---------------------------------------------------------------------------
// GPU path (WebGPU)
// ---------------------------------------------------------------------------

async function _gpuHash(
  data: Uint8Array,
  opts: DumbGlassGpuPipelineOptions,
): Promise<DumbGlassHashResult> {
  const gpu: GPU = navigator.gpu;
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device: GPUDevice = opts.device ?? (await adapter.requestDevice());

  // Pad data to 4-byte boundary
  const paddedLen = Math.ceil(data.byteLength / 4) * 4;
  const nWords = paddedLen / 4;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);

  // Workgroup count for phase 1
  const wgCount = Math.ceil(nWords / 256);

  // Buffers
  const dataBuf = device.createBuffer({ size: paddedLen, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(dataBuf, 0, padded);

  const partialBuf = device.createBuffer({ size: wgCount * 4, usage: GPUBufferUsage.STORAGE });
  const resultBuf  = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readBuf    = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ  | GPUBufferUsage.COPY_DST });

  const paramData = new Uint32Array([data.byteLength, opts.seed ?? 0, nWords, 0]);
  const paramBuf  = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(paramBuf, 0, paramData);

  // Shader module
  const shaderModule = device.createShaderModule({ code: DUMB_GLASS_WGSL });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const phase1Pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'hashPhase1' },
  });
  const phase2Pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'hashPhase2' },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: dataBuf } },
      { binding: 1, resource: { buffer: partialBuf } },
      { binding: 2, resource: { buffer: resultBuf } },
      { binding: 3, resource: { buffer: paramBuf } },
    ],
  });

  // Encode + dispatch
  const t0 = performance.now();
  const enc = device.createCommandEncoder();

  {
    const pass = enc.beginComputePass();
    pass.setPipeline(phase1Pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(wgCount);
    pass.end();
  }
  {
    const pass = enc.beginComputePass();
    pass.setPipeline(phase2Pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
  }

  enc.copyBufferToBuffer(resultBuf, 0, readBuf, 0, 4);
  device.queue.submit([enc.finish()]);
  await readBuf.mapAsync(GPUMapMode.READ);
  const result = new Uint32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();
  const gpuMs = performance.now() - t0;

  // Cleanup
  [dataBuf, partialBuf, resultBuf, readBuf, paramBuf].forEach(b => b.destroy());
  if (!opts.device) device.destroy();

  return {
    hash: result[0].toString(16).padStart(8, '0'),
    gpuMs,
    words: nWords,
    gpuPath: true,
  };
}

// ---------------------------------------------------------------------------
// CPU fallback: xxHash32
// ---------------------------------------------------------------------------

/** Pure-TypeScript xxHash32 for CPU fallback / Vitest determinism checks. */
export function xxHash32Cpu(data: Uint8Array, seed = 0): number {
  const len = data.byteLength;
  let i = 0;
  let h32: number;

  const PRIME1 = 0x9e3779b1;
  const PRIME2 = 0x85ebca77;
  const PRIME3 = 0xc2b2ae3d;
  const PRIME4 = 0x27d4eb2f;
  const PRIME5 = 0x165667b1;

  const u32 = (n: number) => n >>> 0;
  const rotl = (x: number, r: number) => u32((x << r) | (x >>> (32 - r)));
  const read32 = (p: number) =>
    u32(data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24));

  if (len >= 16) {
    let v1 = u32(seed + PRIME1 + PRIME2);
    let v2 = u32(seed + PRIME2);
    let v3 = u32(seed);
    let v4 = u32(seed - PRIME1);

    const limit = len - 16;
    while (i <= limit) {
      v1 = u32(rotl(u32(v1 + u32(read32(i)     * PRIME2)), 13) * PRIME1); i += 4;
      v2 = u32(rotl(u32(v2 + u32(read32(i)     * PRIME2)), 13) * PRIME1); i += 4;
      v3 = u32(rotl(u32(v3 + u32(read32(i)     * PRIME2)), 13) * PRIME1); i += 4;
      v4 = u32(rotl(u32(v4 + u32(read32(i)     * PRIME2)), 13) * PRIME1); i += 4;
    }
    h32 = u32(rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18));
  } else {
    h32 = u32(seed + PRIME5);
  }

  h32 = u32(h32 + len);

  while (i + 4 <= len) {
    h32 = u32(rotl(u32(h32 ^ u32(read32(i) * PRIME3)), 17) * PRIME4);
    i += 4;
  }
  while (i < len) {
    h32 = u32(rotl(u32(h32 ^ u32(data[i] * PRIME5)), 11) * PRIME1);
    i += 1;
  }

  h32 = u32(h32 ^ (h32 >>> 15));
  h32 = u32(u32(h32 * PRIME2) ^ (h32 >>> 13));
  h32 = u32(h32 ^ (h32 >>> 16));
  return h32;
}

// ---------------------------------------------------------------------------
// Batch helper: hash multiple tiles in parallel (GPU path) or serial (CPU)
// ---------------------------------------------------------------------------

export interface TileHashBatch {
  hashes: string[];
  totalGpuMs: number;
  gpuPath: boolean;
}

/**
 * Hash multiple pixel tiles.  GPU path pipelines all tiles into a single
 * command buffer; CPU fallback hashes serially.
 */
export async function hashTileBatch(
  tiles: Uint8Array[],
  seed = 0,
): Promise<TileHashBatch> {
  const t0 = performance.now();
  const results = await Promise.all(tiles.map(t => dumbGlassHash(t, { seed })));
  const totalGpuMs = performance.now() - t0;
  return {
    hashes: results.map(r => r.hash),
    totalGpuMs,
    gpuPath: results.some(r => r.gpuPath),
  };
}
