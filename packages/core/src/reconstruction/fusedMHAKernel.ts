/**
 * fusedMHAKernel.ts — Multi-head attention (fused) via WebGPU
 *
 * Computes: Attention(Q, K, V) = softmax(Q·Kᵀ / √dHead) · V
 * for all heads in a single dispatch.
 *
 * Tensor shapes (row-major, packed):
 *   Q: [numHeads, qLen, dHead]
 *   K: [numHeads, kLen, dHead]
 *   V: [numHeads, kLen, vHead]    (vHead = dHead for standard MHA)
 *   O: [numHeads, qLen, vHead]
 *
 * Dispatch: one workgroup per (head, qRow).
 * Each workgroup iterates over kLen, implementing:
 *   1. scores[k] = dot(Q[qRow], K[k]) / sqrt(dHead)
 *   2. numerically-stable softmax over scores
 *   3. out = sum_k( softmax_k * V[k] )
 *
 * workgroup_size(64, 1, 1): threads fan out over vHead for the weighted sum.
 * The dot-product and softmax phases use a single-thread reduction (lid.x == 0)
 * then broadcast via workgroup shared memory — simplest correct approach
 * that avoids divergent cross-workgroup writes.
 */

const WGSL_FUSED_MHA = `
struct Params {
  numHeads: u32,
  qLen:     u32,
  kLen:     u32,
  dHead:    u32,   // head dimension (= sqrt-scale base)
  vHead:    u32,   // output feature dim per head (usually == dHead)
}

@group(0) @binding(0) var<storage, read>       Q:   array<f32>;  // [h, qLen, dHead]
@group(0) @binding(1) var<storage, read>       K:   array<f32>;  // [h, kLen, dHead]
@group(0) @binding(2) var<storage, read>       V:   array<f32>;  // [h, kLen, vHead]
@group(0) @binding(3) var<storage, read_write> O:   array<f32>;  // [h, qLen, vHead]
@group(0) @binding(4) var<uniform>             p:   Params;

// Shared memory: reuse for scores then for v-accumulation
var<workgroup> scores: array<f32, 1024>;  // max supported kLen per workgroup

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id)        wg:  vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  // workgroup index encodes (head, qRow)
  let head = wg.x / p.qLen;
  let qRow = wg.x % p.qLen;

  if (head >= p.numHeads || qRow >= p.qLen) { return; }

  let scale: f32 = 1.0 / sqrt(f32(p.dHead));

  // ---- Phase 1: compute dot products Q[qRow] · K[k] for all k ----
  // Thread 0 does sequential dot products and stores in shared scores[]
  // (for kLen ≤ 1024; if larger, falls back to partial accumulation)
  if (lid.x == 0u) {
    let qBase = (head * p.qLen + qRow) * p.dHead;
    for (var ki = 0u; ki < p.kLen; ki++) {
      let kBase = (head * p.kLen + ki) * p.dHead;
      var dot: f32 = 0.0;
      for (var d = 0u; d < p.dHead; d++) {
        dot = dot + Q[qBase + d] * K[kBase + d];
      }
      scores[ki] = dot * scale;
    }
  }
  workgroupBarrier();

  // ---- Phase 2: stable softmax in-place ----
  if (lid.x == 0u) {
    var maxS: f32 = scores[0];
    for (var ki = 1u; ki < p.kLen; ki++) {
      maxS = max(maxS, scores[ki]);
    }
    var sumExp: f32 = 0.0;
    for (var ki = 0u; ki < p.kLen; ki++) {
      scores[ki] = exp(scores[ki] - maxS);
      sumExp = sumExp + scores[ki];
    }
    for (var ki = 0u; ki < p.kLen; ki++) {
      scores[ki] = scores[ki] / sumExp;
    }
  }
  workgroupBarrier();

  // ---- Phase 3: weighted sum over V ----
  // Threads fan out over vHead dimension
  let outBase = (head * p.qLen + qRow) * p.vHead;
  var vi = lid.x;
  while (vi < p.vHead) {
    var acc: f32 = 0.0;
    for (var ki = 0u; ki < p.kLen; ki++) {
      acc = acc + scores[ki] * V[(head * p.kLen + ki) * p.vHead + vi];
    }
    O[outBase + vi] = acc;
    vi = vi + 64u;
  }
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buf;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface FusedMHAParams {
  numHeads: number;
  qLen:     number;
  kLen:     number;
  dHead:    number;
  /** If omitted, defaults to dHead */
  vHead?:   number;
}

export interface FusedMHAKernel {
  /**
   * Run multi-head attention.
   * @param Q [numHeads, qLen, dHead]
   * @param K [numHeads, kLen, dHead]
   * @param V [numHeads, kLen, vHead]
   * @returns  [numHeads, qLen, vHead]
   */
  run(Q: Float32Array, K: Float32Array, V: Float32Array, params: FusedMHAParams): Promise<Float32Array>;
}

export function createFusedMHAKernel(device: GPUDevice): FusedMHAKernel {
  const shader = device.createShaderModule({ code: WGSL_FUSED_MHA });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(
      Q: Float32Array,
      K: Float32Array,
      V: Float32Array,
      params: FusedMHAParams,
    ): Promise<Float32Array> {
      const { numHeads, qLen, kLen, dHead } = params;
      const vHead = params.vHead ?? dHead;

      if (kLen > 1024) throw new Error(`fusedMHA: kLen=${kLen} exceeds shared memory limit 1024`);
      if (Q.length !== numHeads * qLen * dHead) throw new Error(`fusedMHA: Q size mismatch`);
      if (K.length !== numHeads * kLen * dHead) throw new Error(`fusedMHA: K size mismatch`);
      if (V.length !== numHeads * kLen * vHead) throw new Error(`fusedMHA: V size mismatch`);

      const outBytes = numHeads * qLen * vHead * 4;

      const qBuf = storageBuffer(device, Q);
      const kBuf = storageBuffer(device, K);
      const vBuf = storageBuffer(device, V);
      const oBuf = device.createBuffer({
        size: outBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      const paramAB = new ArrayBuffer(24);
      const pu = new Uint32Array(paramAB);
      pu[0] = numHeads; pu[1] = qLen; pu[2] = kLen; pu[3] = dHead; pu[4] = vHead;
      const paramsBuf = device.createBuffer({
        size: paramAB.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(paramsBuf, 0, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: qBuf } },
          { binding: 1, resource: { buffer: kBuf } },
          { binding: 2, resource: { buffer: vBuf } },
          { binding: 3, resource: { buffer: oBuf } },
          { binding: 4, resource: { buffer: paramsBuf } },
        ],
      });

      // One workgroup per (head, qRow)
      const workgroups = numHeads * qLen;
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(workgroups);
      pass.end();

      const staging = device.createBuffer({
        size: outBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      enc.copyBufferToBuffer(oBuf, 0, staging, 0, outBytes);
      device.queue.submit([enc.finish()]);

      await staging.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(staging.getMappedRange().slice(0));
      staging.unmap();

      qBuf.destroy(); kBuf.destroy(); vBuf.destroy(); oBuf.destroy();
      paramsBuf.destroy(); staging.destroy();

      return result;
    },
  };
}
