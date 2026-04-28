/**
 * pagedKVKernels.ts — GPU kernels for paged key/value cache operations.
 *
 * Two kernels:
 *   - appendKernel: writes a batch of new K or V vectors into a paged KV cache buffer.
 *   - lookupKernel: reads a contiguous sequence of K or V vectors from paged storage.
 *
 * ## Buffer layout
 *
 *   kv_pages: array<f32, numPages * pageSize * headDim>
 *
 *   Each page stores `pageSize` vectors, each of size `headDim`.
 *   A "page table" (array<u32>) maps logical page index → physical offset in kv_pages.
 *
 * ## Append
 *   Inputs: newVectors [numVecs, headDim], pageTable [numPages], writeSlot per vec
 *   Output: writes into kv_pages at the correct page + slot offsets.
 *
 * ## Lookup
 *   Inputs: pageTable [numPages], numOutputVecs, startSlot
 *   Output: out [numOutputVecs, headDim] — gathered in order
 */

// ---------------------------------------------------------------------------
// WGSL source — Append kernel
// ---------------------------------------------------------------------------
const WGSL_PAGED_KV_APPEND = `
struct AppendParams {
  numVecs:  u32,   // number of NEW vectors to append
  headDim:  u32,   // dimension of each vector
  pageSize: u32,   // vectors per page
}
// kv_pages: flat storage for all pages. page p, slot s, dim d:
//   index = pageTable[p] * pageSize * headDim + s * headDim + d
@group(0) @binding(0) var<storage, read>       newVecs:   array<f32>;   // [numVecs * headDim]
@group(0) @binding(1) var<storage, read>       pageTable: array<u32>;   // logical page → base offset in kv_pages (in elements)
@group(0) @binding(2) var<storage, read>       slotMap:   array<u32>;   // per-vector: (logicalPage << 16 | slotInPage)
@group(0) @binding(3) var<storage, read_write> kvPages:   array<f32>;   // output KV store
@group(0) @binding(4) var<uniform>             p:         AppendParams;
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // gid.x spans numVecs * headDim
  let total = p.numVecs * p.headDim;
  if (gid.x >= total) { return; }
  let vecIdx  = gid.x / p.headDim;
  let dimIdx  = gid.x % p.headDim;
  let slot    = slotMap[vecIdx];
  let logPage = slot >> 16u;
  let inPage  = slot & 0xFFFFu;
  let base    = pageTable[logPage] * p.pageSize * p.headDim;
  kvPages[base + inPage * p.headDim + dimIdx] = newVecs[vecIdx * p.headDim + dimIdx];
}
`;

// ---------------------------------------------------------------------------
// WGSL source — Lookup kernel
// ---------------------------------------------------------------------------
const WGSL_PAGED_KV_LOOKUP = `
struct LookupParams {
  numVecs:    u32,   // number of vectors to read
  headDim:    u32,
  pageSize:   u32,
  startSlot:  u32,   // logical first slot (token offset)
}
@group(0) @binding(0) var<storage, read>       kvPages:   array<f32>;
@group(0) @binding(1) var<storage, read>       pageTable: array<u32>;  // logical page → base offset (in elements)
@group(0) @binding(2) var<storage, read_write> out:       array<f32>;  // [numVecs * headDim]
@group(0) @binding(3) var<uniform>             p:         LookupParams;
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let total = p.numVecs * p.headDim;
  if (gid.x >= total) { return; }
  let vecIdx   = gid.x / p.headDim;
  let dimIdx   = gid.x % p.headDim;
  let logSlot  = (vecIdx + p.startSlot);
  let logPage  = logSlot / p.pageSize;
  let inPage   = logSlot % p.pageSize;
  let base     = pageTable[logPage] * p.pageSize * p.headDim;
  out[gid.x]   = kvPages[base + inPage * p.headDim + dimIdx];
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageBuffer(device: GPUDevice, data: Float32Array | Uint32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buf;
}

function outputBuffer(device: GPUDevice, bytes: number): GPUBuffer {
  return device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
}

function uniformBuffer(device: GPUDevice, data: ArrayBuffer): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

async function readback(device: GPUDevice, src: GPUBuffer, bytes: number): Promise<Float32Array> {
  const staging = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(src, 0, staging, 0, bytes);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return result;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PagedKVAppendKernel {
  /**
   * Write `newVectors` into `kvPages` using the provided page table and slot map.
   *
   * @param kvPages      Existing KV page buffer (mutated via read_write binding)
   * @param pageTable    Logical page index → base element index in kvPages
   * @param slotMap      Per-vector packed slot: (logicalPage << 16 | slotInPage)
   * @param newVectors   Flat [numVecs * headDim] values to write
   * @param pageSize     Vectors per page
   * @param headDim      Dimension of each vector
   * @returns Updated KV page buffer as Float32Array
   */
  run(
    kvPages: Float32Array,
    pageTable: Uint32Array,
    slotMap: Uint32Array,
    newVectors: Float32Array,
    pageSize: number,
    headDim: number,
  ): Promise<Float32Array>;
}

export interface PagedKVLookupKernel {
  /**
   * Read `numVecs` contiguous vectors starting at `startSlot` from paged storage.
   *
   * @param kvPages    KV page buffer
   * @param pageTable  Logical page index → base element index in kvPages
   * @param numVecs    How many vectors to read
   * @param startSlot  Logical slot of the first vector
   * @param pageSize   Vectors per page
   * @param headDim    Dimension of each vector
   * @returns Float32Array of shape [numVecs * headDim]
   */
  run(
    kvPages: Float32Array,
    pageTable: Uint32Array,
    numVecs: number,
    startSlot: number,
    pageSize: number,
    headDim: number,
  ): Promise<Float32Array>;
}

// ---------------------------------------------------------------------------
// Factory: Append
// ---------------------------------------------------------------------------

export function createPagedKVAppendKernel(device: GPUDevice): PagedKVAppendKernel {
  const shader = device.createShaderModule({ code: WGSL_PAGED_KV_APPEND });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(
      kvPagesData: Float32Array,
      pageTableData: Uint32Array,
      slotMapData: Uint32Array,
      newVectors: Float32Array,
      pageSize: number,
      headDim: number,
    ): Promise<Float32Array> {
      const numVecs = newVectors.length / headDim;

      // kv_pages is both read and written, so we use STORAGE | read_write
      const kvBuf = device.createBuffer({
        size: kvPagesData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      device.queue.writeBuffer(kvBuf, 0, kvPagesData.buffer as ArrayBuffer, kvPagesData.byteOffset, kvPagesData.byteLength);

      const newVecsBuf = storageBuffer(device, newVectors);
      const pageTableBuf = storageBuffer(device, pageTableData);
      const slotMapBuf = storageBuffer(device, slotMapData);

      const paramAB = new ArrayBuffer(16);
      new Uint32Array(paramAB)[0] = numVecs;
      new Uint32Array(paramAB)[1] = headDim;
      new Uint32Array(paramAB)[2] = pageSize;
      const paramsBuf = uniformBuffer(device, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: newVecsBuf } },
          { binding: 1, resource: { buffer: pageTableBuf } },
          { binding: 2, resource: { buffer: slotMapBuf } },
          { binding: 3, resource: { buffer: kvBuf } },
          { binding: 4, resource: { buffer: paramsBuf } },
        ],
      });

      const total = numVecs * headDim;
      const workgroups = Math.ceil(total / 64);
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
      device.queue.submit([enc.finish()]);

      const result = await readback(device, kvBuf, kvPagesData.byteLength);

      newVecsBuf.destroy();
      pageTableBuf.destroy();
      slotMapBuf.destroy();
      kvBuf.destroy();
      paramsBuf.destroy();

      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// Factory: Lookup
// ---------------------------------------------------------------------------

export function createPagedKVLookupKernel(device: GPUDevice): PagedKVLookupKernel {
  const shader = device.createShaderModule({ code: WGSL_PAGED_KV_LOOKUP });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(
      kvPagesData: Float32Array,
      pageTableData: Uint32Array,
      numVecs: number,
      startSlot: number,
      pageSize: number,
      headDim: number,
    ): Promise<Float32Array> {
      const outBytes = numVecs * headDim * 4;

      const kvBuf = storageBuffer(device, kvPagesData);
      const pageTableBuf = storageBuffer(device, pageTableData);
      const outBuf = outputBuffer(device, outBytes);

      const paramAB = new ArrayBuffer(16);
      const pu = new Uint32Array(paramAB);
      pu[0] = numVecs;
      pu[1] = headDim;
      pu[2] = pageSize;
      pu[3] = startSlot;
      const paramsBuf = uniformBuffer(device, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: kvBuf } },
          { binding: 1, resource: { buffer: pageTableBuf } },
          { binding: 2, resource: { buffer: outBuf } },
          { binding: 3, resource: { buffer: paramsBuf } },
        ],
      });

      const total = numVecs * headDim;
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(total / 64));
      pass.end();
      device.queue.submit([enc.finish()]);

      const result = await readback(device, outBuf, outBytes);

      kvBuf.destroy();
      pageTableBuf.destroy();
      outBuf.destroy();
      paramsBuf.destroy();

      return result;
    },
  };
}

