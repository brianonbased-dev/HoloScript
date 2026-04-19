import { describe, expect, it } from 'vitest';
import { createPagedKVAppendKernel, createPagedKVLookupKernel } from '../pagedKVKernels';
import { isWebGpuEnvironmentPresent } from '../webgpuGate';

// ---------------------------------------------------------------------------
// CPU reference implementations
// ---------------------------------------------------------------------------

/**
 * CPU reference for paged KV append.
 * slotMap: per-vector packed u32: (logicalPage << 16 | slotInPage)
 */
function pagedKVAppendCpu(
  kvPages: Float32Array,
  pageTable: Uint32Array,
  slotMap: Uint32Array,
  newVecs: Float32Array,
  pageSize: number,
  headDim: number,
): Float32Array {
  const out = new Float32Array(kvPages);
  const numVecs = newVecs.length / headDim;
  for (let v = 0; v < numVecs; v++) {
    const logPage = slotMap[v] >>> 16;
    const inPage  = slotMap[v] & 0xffff;
    const base    = pageTable[logPage] * pageSize * headDim;
    for (let d = 0; d < headDim; d++) {
      out[base + inPage * headDim + d] = newVecs[v * headDim + d];
    }
  }
  return out;
}

/**
 * CPU reference for paged KV lookup.
 */
function pagedKVLookupCpu(
  kvPages: Float32Array,
  pageTable: Uint32Array,
  numVecs: number,
  startSlot: number,
  pageSize: number,
  headDim: number,
): Float32Array {
  const out = new Float32Array(numVecs * headDim);
  for (let v = 0; v < numVecs; v++) {
    const logSlot = v + startSlot;
    const logPage = Math.floor(logSlot / pageSize);
    const inPage  = logSlot % pageSize;
    const base    = pageTable[logPage] * pageSize * headDim;
    for (let d = 0; d < headDim; d++) {
      out[v * headDim + d] = kvPages[base + inPage * headDim + d];
    }
  }
  return out;
}

function allClose(a: Float32Array, b: Float32Array, atol = 1e-5): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > atol) return false;
  }
  return true;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// CPU-only tests
// ---------------------------------------------------------------------------

describe('PagedKV — CPU reference', () => {
  it('append writes to correct page slot (single page, slot 0)', () => {
    const pageSize = 4, headDim = 2, numPhysPages = 1;
    const kvPages = new Float32Array(numPhysPages * pageSize * headDim); // all zeros
    const pageTable = new Uint32Array([0]); // logical page 0 → physical offset 0
    // Append 1 vector to (logPage=0, slotInPage=0)
    const slotMap = new Uint32Array([(0 << 16) | 0]);
    const newVec = new Float32Array([3.0, 4.0]);
    const out = pagedKVAppendCpu(kvPages, pageTable, slotMap, newVec, pageSize, headDim);
    expect(out[0]).toBeCloseTo(3.0);
    expect(out[1]).toBeCloseTo(4.0);
    // other slots untouched
    expect(out[2]).toBe(0);
  });

  it('append writes to correct page slot (second page, second slot)', () => {
    const pageSize = 4, headDim = 2;
    // 2 physical pages
    const kvPages = new Float32Array(2 * pageSize * headDim);
    const pageTable = new Uint32Array([0, 1]); // logical 0 → phys 0, logical 1 → phys 1
    // Write to logical page 1, slot 2
    const slotMap = new Uint32Array([(1 << 16) | 2]);
    const newVec = new Float32Array([7.0, 8.0]);
    const out = pagedKVAppendCpu(kvPages, pageTable, slotMap, newVec, pageSize, headDim);
    // Physical page 1 base = 1 * 4 * 2 = 8; slot 2 = + 2*2 = 4 → indices 12,13
    expect(out[12]).toBeCloseTo(7.0);
    expect(out[13]).toBeCloseTo(8.0);
  });

  it('lookup retrieves appended values correctly', () => {
    const pageSize = 4, headDim = 3;
    const numPhysPages = 2;
    let kvPages = new Float32Array(numPhysPages * pageSize * headDim);
    const pageTable = new Uint32Array([0, 1]);
    // Append 5 vectors across two pages
    const vecs = new Float32Array([1,2,3,  4,5,6,  7,8,9,  10,11,12,  13,14,15]);
    for (let v = 0; v < 5; v++) {
      const logSlot = v;
      const logPage = Math.floor(logSlot / pageSize);
      const inPage  = logSlot % pageSize;
      const slotMap = new Uint32Array([(logPage << 16) | inPage]);
      const vec = vecs.slice(v * headDim, v * headDim + headDim);
      kvPages = pagedKVAppendCpu(kvPages, pageTable, slotMap, new Float32Array(vec), pageSize, headDim);
    }
    // Now lookup all 5
    const out = pagedKVLookupCpu(kvPages, pageTable, 5, 0, pageSize, headDim);
    expect(Array.from(out)).toEqual(Array.from(vecs));
  });

  it('lookup startSlot > 0 skips earlier tokens', () => {
    const pageSize = 4, headDim = 2;
    // Fill kvPages with identity data: slot i → [i*2, i*2+1]
    const kvPages = new Float32Array(1 * pageSize * headDim);
    for (let i = 0; i < pageSize; i++) {
      kvPages[i * headDim]     = i * 2;
      kvPages[i * headDim + 1] = i * 2 + 1;
    }
    const pageTable = new Uint32Array([0]);
    const out = pagedKVLookupCpu(kvPages, pageTable, 2, 2, pageSize, headDim);
    expect(out[0]).toBeCloseTo(4);
    expect(out[1]).toBeCloseTo(5);
    expect(out[2]).toBeCloseTo(6);
    expect(out[3]).toBeCloseTo(7);
  });
});

// ---------------------------------------------------------------------------
// WebGPU tests
// ---------------------------------------------------------------------------

describe('PagedKV — WebGPU append', () => {
  it('append: GPU output matches CPU reference', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping paged KV append GPU test');
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const pageSize = 4, headDim = 4;
    const numPhysPages = 2;
    const kvPages = new Float32Array(numPhysPages * pageSize * headDim);
    const pageTable = new Uint32Array([0, 1]);
    // Append 3 vectors: slots 0,1,4 (page 0 slot 0, page 0 slot 1, page 1 slot 0)
    const slotMap = new Uint32Array([
      (0 << 16) | 0,
      (0 << 16) | 1,
      (1 << 16) | 0,
    ]);
    const rng = mulberry32(777);
    const newVecs = new Float32Array(3 * headDim);
    for (let i = 0; i < newVecs.length; i++) newVecs[i] = rng() * 10;

    const cpuOut = pagedKVAppendCpu(kvPages, pageTable, slotMap, newVecs, pageSize, headDim);

    const kernel = createPagedKVAppendKernel(device);
    const gpuOut = await kernel.run(
      new Float32Array(kvPages),
      pageTable,
      slotMap,
      newVecs,
      pageSize,
      headDim,
    );

    expect(allClose(gpuOut, cpuOut)).toBe(true);
    device.destroy();
  });
});

describe('PagedKV — WebGPU lookup', () => {
  it('lookup: GPU reads same values as CPU', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping paged KV lookup GPU test');
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const pageSize = 4, headDim = 4;
    const numPhysPages = 2;
    const rng = mulberry32(123);
    const kvPages = new Float32Array(numPhysPages * pageSize * headDim);
    for (let i = 0; i < kvPages.length; i++) kvPages[i] = rng() * 5;
    const pageTable = new Uint32Array([0, 1]);

    const numVecs = 6, startSlot = 1;
    const cpuOut = pagedKVLookupCpu(kvPages, pageTable, numVecs, startSlot, pageSize, headDim);

    const kernel = createPagedKVLookupKernel(device);
    const gpuOut = await kernel.run(
      kvPages,
      pageTable,
      numVecs,
      startSlot,
      pageSize,
      headDim,
    );

    expect(allClose(gpuOut, cpuOut)).toBe(true);
    device.destroy();
  });

  it('lookup at slot 0 retrieves first pageSize vectors', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const pageSize = 4, headDim = 2;
    const kvPages = new Float32Array([1,2, 3,4, 5,6, 7,8]);
    const pageTable = new Uint32Array([0]);

    const kernel = createPagedKVLookupKernel(device);
    const gpuOut = await kernel.run(kvPages, pageTable, 4, 0, pageSize, headDim);
    expect(Array.from(gpuOut)).toEqual([1,2,3,4,5,6,7,8]);
    device.destroy();
  });
});
