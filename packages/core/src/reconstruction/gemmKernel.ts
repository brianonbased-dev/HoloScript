/**
 * gemmKernel.ts — Dense f32 matrix-multiply on WebGPU
 *
 * Computes: C = A @ B
 *   A: [M, K]  (row-major)
 *   B: [K, N]  (row-major)
 *   C: [M, N]  (row-major)
 *
 * Tiling: 8×8 tile per workgroup (8 threads wide, 8 tall, 1 deep).
 * Inner loop accumulates along K in chunks of 8 using workgroup shared memory.
 * Falls back gracefully for non-tile-aligned sizes via bounds checks.
 */

const TILE = 8;

const WGSL_GEMM_SOURCE = `
const TILE: u32 = 8u;
struct Params {
  M: u32,
  N: u32,
  K: u32,
}
@group(0) @binding(0) var<storage, read>       A:  array<f32>;  // [M * K]
@group(0) @binding(1) var<storage, read>       B:  array<f32>;  // [K * N]
@group(0) @binding(2) var<storage, read_write> C:  array<f32>;  // [M * N]
@group(0) @binding(3) var<uniform>             p:  Params;
var<workgroup> tileA: array<f32, 64>; // TILE * TILE = 8*8
var<workgroup> tileB: array<f32, 64>;
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(workgroup_id)        wg:  vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let row = wg.y * TILE + lid.y;
  let col = wg.x * TILE + lid.x;
  var acc: f32 = 0.0;
  let numTiles = (p.K + TILE - 1u) / TILE;
  for (var t = 0u; t < numTiles; t++) {
    // Load tile of A (row of A) into shared
    let aCol = t * TILE + lid.x;
    if (row < p.M && aCol < p.K) {
      tileA[lid.y * TILE + lid.x] = A[row * p.K + aCol];
    } else {
      tileA[lid.y * TILE + lid.x] = 0.0;
    }
    // Load tile of B (col of B) into shared
    let bRow = t * TILE + lid.y;
    if (bRow < p.K && col < p.N) {
      tileB[lid.y * TILE + lid.x] = B[bRow * p.N + col];
    } else {
      tileB[lid.y * TILE + lid.x] = 0.0;
    }
    workgroupBarrier();
    for (var k = 0u; k < TILE; k++) {
      acc = acc + tileA[lid.y * TILE + k] * tileB[k * TILE + lid.x];
    }
    workgroupBarrier();
  }
  if (row < p.M && col < p.N) {
    C[row * p.N + col] = acc;
  }
}
`;

export interface GemmKernel {
  /**
   * Compute C = A @ B.
   * @param A Float32Array of shape [M, K]
   * @param B Float32Array of shape [K, N]
   * @param M Rows of A / rows of C
   * @param N Cols of B / cols of C
   * @param K Inner dimension
   */
  run(A: Float32Array, B: Float32Array, M: number, N: number, K: number): Promise<Float32Array>;
}

function storageBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

export function createGemmKernel(device: GPUDevice): GemmKernel {
  const shader = device.createShaderModule({ code: WGSL_GEMM_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(
      A: Float32Array,
      B: Float32Array,
      M: number,
      N: number,
      K: number,
    ): Promise<Float32Array> {
      if (A.length !== M * K) throw new Error(`GEMM: A.length=${A.length} != M*K=${M * K}`);
      if (B.length !== K * N) throw new Error(`GEMM: B.length=${B.length} != K*N=${K * N}`);

      const aBuf = storageBuffer(device, A);
      const bBuf = storageBuffer(device, B);

      const cBuf = device.createBuffer({
        size: M * N * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      const paramAB = new ArrayBuffer(16);
      const pu = new Uint32Array(paramAB);
      pu[0] = M; pu[1] = N; pu[2] = K;
      const paramsBuf = device.createBuffer({
        size: paramAB.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(paramsBuf, 0, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: aBuf } },
          { binding: 1, resource: { buffer: bBuf } },
          { binding: 2, resource: { buffer: cBuf } },
          { binding: 3, resource: { buffer: paramsBuf } },
        ],
      });

      const wgX = Math.ceil(N / TILE);
      const wgY = Math.ceil(M / TILE);
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wgX, wgY, 1);
      pass.end();

      const staging = device.createBuffer({
        size: M * N * 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      enc.copyBufferToBuffer(cBuf, 0, staging, 0, M * N * 4);
      device.queue.submit([enc.finish()]);

      await staging.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(staging.getMappedRange().slice(0));
      staging.unmap();

      aBuf.destroy();
      bBuf.destroy();
      cBuf.destroy();
      paramsBuf.destroy();
      staging.destroy();

      return result;
    },
  };
}
