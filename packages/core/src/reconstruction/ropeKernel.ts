/**
 * ropeKernel.ts — WebGPU Rotary Positional Encoding (RoPE)
 *
 * Applies sin/cos frequency rotation to Q or K tensors in-place.
 * Input layout: Float32Array of shape [seqLen, numHeads, headDim] (row-major).
 *
 * Usage:
 *   const kernel = createRopeKernel(device);
 *   const qRot = await kernel.run(q, { seqLen, numHeads, headDim, base: 10000, posOffset: 0 });
 */

const WGSL_ROPE_SOURCE = `
struct Params {
  seqLen:    u32,
  numHeads:  u32,
  headDim:   u32,
  base:      f32,
  posOffset: u32,
}
@group(0) @binding(0) var<storage, read>       qIn:  array<f32>;
@group(0) @binding(1) var<storage, read_write> qOut: array<f32>;
@group(0) @binding(2) var<uniform>             p:    Params;
fn flatIdx(token: u32, head: u32, dim: u32) -> u32 {
  return token * p.numHeads * p.headDim + head * p.headDim + dim;
}
@compute @workgroup_size(32, 1, 1)
fn main(
  @builtin(workgroup_id)        wgid: vec3<u32>,
  @builtin(local_invocation_id) lid:  vec3<u32>,
) {
  let wg    = wgid.x;
  let token = wg / p.numHeads;
  let head  = wg % p.numHeads;
  if (token >= p.seqLen) { return; }
  let pairs = p.headDim / 2u;
  let pos   = token + p.posOffset;
  var pairIdx = lid.x;
  while (pairIdx < pairs) {
    let d       = pairIdx;
    let exponent = -2.0 * f32(d) / f32(p.headDim);
    let theta    = f32(pos) * pow(p.base, exponent);
    let c = cos(theta);
    let s = sin(theta);
    let i0 = flatIdx(token, head, 2u * d);
    let i1 = flatIdx(token, head, 2u * d + 1u);
    let x0 = qIn[i0];
    let x1 = qIn[i1];
    qOut[i0] = x0 * c - x1 * s;
    qOut[i1] = x0 * s + x1 * c;
    pairIdx = pairIdx + 32u;
  }
}
`;

export interface RopeParams {
  seqLen: number;
  numHeads: number;
  headDim: number;
  /** RoPE frequency base. Default 10000. */
  base?: number;
  /** Offset added to position index (for KV-cache continuation). Default 0. */
  posOffset?: number;
}

export interface RopeKernel {
  run(input: Float32Array, params: RopeParams): Promise<Float32Array>;
}

function createStorageBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buf;
}

function createOutputBuffer(device: GPUDevice, byteLength: number): GPUBuffer {
  return device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
}

function createParamsBuffer(device: GPUDevice, rp: Required<RopeParams>): GPUBuffer {
  // Params struct: 5 fields, each 4 bytes → 20 bytes; pad to 32 for alignment.
  const buf = new ArrayBuffer(32);
  const u = new Uint32Array(buf);
  const f = new Float32Array(buf);
  u[0] = rp.seqLen;
  u[1] = rp.numHeads;
  u[2] = rp.headDim;
  f[3] = rp.base;
  u[4] = rp.posOffset;

  const gpuBuf = device.createBuffer({
    size: buf.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(gpuBuf, 0, buf);
  return gpuBuf;
}

export function createRopeKernel(device: GPUDevice): RopeKernel {
  const shader = device.createShaderModule({ code: WGSL_ROPE_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(input: Float32Array, params: RopeParams): Promise<Float32Array> {
      const { seqLen, numHeads, headDim } = params;
      const base = params.base ?? 10000;
      const posOffset = params.posOffset ?? 0;

      if (headDim % 2 !== 0) {
        throw new Error('RoPE: headDim must be even');
      }
      const expected = seqLen * numHeads * headDim;
      if (input.length !== expected) {
        throw new Error(
          `RoPE: input length ${input.length} does not match seqLen*numHeads*headDim=${expected}`,
        );
      }

      const rp: Required<RopeParams> = { seqLen, numHeads, headDim, base, posOffset };

      const inBuf     = createStorageBuffer(device, input);
      const outBuf    = createOutputBuffer(device, input.byteLength);
      const paramsBuf = createParamsBuffer(device, rp);

      const stagingBuf = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inBuf } },
          { binding: 1, resource: { buffer: outBuf } },
          { binding: 2, resource: { buffer: paramsBuf } },
        ],
      });

      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      // Each workgroup handles one (token, head) pair.
      pass.dispatchWorkgroups(seqLen * numHeads);
      pass.end();
      enc.copyBufferToBuffer(outBuf, 0, stagingBuf, 0, input.byteLength);
      device.queue.submit([enc.finish()]);

      await stagingBuf.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(stagingBuf.getMappedRange().slice(0));
      stagingBuf.unmap();

      inBuf.destroy();
      outBuf.destroy();
      paramsBuf.destroy();
      stagingBuf.destroy();

      return result;
    },
  };
}

