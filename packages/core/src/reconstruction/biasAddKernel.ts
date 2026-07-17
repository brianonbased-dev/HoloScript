/**
 * biasAddKernel.ts — row-broadcast bias add on WebGPU.
 *
 * Computes: out[m, n] = in[m, n] + bias[n]   (bias broadcast over rows)
 *
 * HoloTorch decoder piece: a GPT-2 Linear is y = x @ Wᵀ + b. The general GEMM
 * (gemmKernel.ts) computes x @ Wᵀ; this composable kernel adds the bias. Kept
 * SEPARATE from GEMM on purpose — v0 is correctness-first, and a standalone
 * elementwise pass has zero regression risk to the proven GEMM. Fusing the bias
 * into the GEMM epilogue is a later performance optimization.
 */

const WGSL_BIAS_ADD_SOURCE = `
struct Params {
  rows: u32,
  cols: u32,
}
@group(0) @binding(0) var<storage, read>       input:  array<f32>;  // [rows * cols]
@group(0) @binding(1) var<storage, read>       bias:   array<f32>;  // [cols]
@group(0) @binding(2) var<storage, read_write> output: array<f32>;  // [rows * cols]
@group(0) @binding(3) var<uniform>             p:      Params;
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = p.rows * p.cols;
  if (idx >= total) { return; }
  let col = idx % p.cols;
  output[idx] = input[idx] + bias[col];
}
`;

export interface BiasAddKernel {
  /** out[m,n] = in[m,n] + bias[n]. input is [rows*cols], bias is [cols]. */
  run(input: Float32Array, bias: Float32Array, rows: number, cols: number): Promise<Float32Array>;
}

function storageBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buf;
}

export function createBiasAddKernel(device: GPUDevice): BiasAddKernel {
  const shader = device.createShaderModule({ code: WGSL_BIAS_ADD_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(input: Float32Array, bias: Float32Array, rows: number, cols: number): Promise<Float32Array> {
      if (input.length !== rows * cols) throw new Error(`biasAdd: input.length=${input.length} != rows*cols=${rows * cols}`);
      if (bias.length !== cols) throw new Error(`biasAdd: bias.length=${bias.length} != cols=${cols}`);

      const inputBuf = storageBuffer(device, input);
      const biasBuf = storageBuffer(device, bias);
      const outputBuf = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      const paramAB = new ArrayBuffer(16);
      const pu = new Uint32Array(paramAB);
      pu[0] = rows;
      pu[1] = cols;
      const paramsBuf = device.createBuffer({
        size: paramAB.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(paramsBuf, 0, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuf } },
          { binding: 1, resource: { buffer: biasBuf } },
          { binding: 2, resource: { buffer: outputBuf } },
          { binding: 3, resource: { buffer: paramsBuf } },
        ],
      });

      const total = rows * cols;
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(total / 64));
      pass.end();

      const staging = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      enc.copyBufferToBuffer(outputBuf, 0, staging, 0, input.byteLength);
      device.queue.submit([enc.finish()]);

      await staging.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(staging.getMappedRange().slice(0));
      staging.unmap();

      inputBuf.destroy();
      biasBuf.destroy();
      outputBuf.destroy();
      paramsBuf.destroy();
      staging.destroy();

      return result;
    },
  };
}
