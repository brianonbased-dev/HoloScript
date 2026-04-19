const WGSL_LAYER_NORM_SOURCE = `
struct Params {
  rows: u32,
  dModel: u32,
  eps: f32,
}
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read> gamma: array<f32>;
@group(0) @binding(2) var<storage, read> beta: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;
var<workgroup> reduceScratch: array<f32, 64>;
fn inputIndex(row: u32, col: u32) -> u32 {
  return row * params.dModel + col;
}
@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id) workgroupId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
) {
  let row = workgroupId.x;
  let lane = localId.x;
  if (row >= params.rows || params.dModel == 0u) {
    return;
  }
  var sum = 0.0;
  for (var c: u32 = lane; c < params.dModel; c = c + 64u) {
    sum = sum + input[inputIndex(row, c)];
  }
  reduceScratch[lane] = sum;
  workgroupBarrier();
  var stride: u32 = 32u;
  loop {
    if (lane < stride) {
      reduceScratch[lane] = reduceScratch[lane] + reduceScratch[lane + stride];
    }
    workgroupBarrier();
    if (stride == 1u) {
      break;
    }
    stride = stride >> 1u;
  }
  let mean = reduceScratch[0] / f32(params.dModel);
  var sq = 0.0;
  for (var c: u32 = lane; c < params.dModel; c = c + 64u) {
    let d = input[inputIndex(row, c)] - mean;
    sq = sq + d * d;
  }
  reduceScratch[lane] = sq;
  workgroupBarrier();
  stride = 32u;
  loop {
    if (lane < stride) {
      reduceScratch[lane] = reduceScratch[lane] + reduceScratch[lane + stride];
    }
    workgroupBarrier();
    if (stride == 1u) {
      break;
    }
    stride = stride >> 1u;
  }
  let variance = reduceScratch[0] / f32(params.dModel);
  let invStd = inverseSqrt(variance + params.eps);
  for (var c: u32 = lane; c < params.dModel; c = c + 64u) {
    let idx = inputIndex(row, c);
    let normalized = (input[idx] - mean) * invStd;
    output[idx] = normalized * gamma[c] + beta[c];
  }
}
`;

export interface LayerNormKernel {
  run(input: Float32Array, gamma: Float32Array, beta: Float32Array): Promise<Float32Array>;
}

function createStorageBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

function createParamsBuffer(device: GPUDevice, rows: number, dModel: number, eps: number): GPUBuffer {
  const paramsBytes = new ArrayBuffer(16);
  const view = new DataView(paramsBytes);
  view.setUint32(0, rows, true);
  view.setUint32(4, dModel, true);
  view.setFloat32(8, eps, true);

  const params = device.createBuffer({
    size: paramsBytes.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(params, 0, paramsBytes);
  return params;
}

export function createLayerNormKernel(device: GPUDevice): LayerNormKernel {
  const shader = device.createShaderModule({ code: WGSL_LAYER_NORM_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main',
    },
  });

  return {
    async run(input: Float32Array, gamma: Float32Array, beta: Float32Array): Promise<Float32Array> {
      if (gamma.length === 0) {
        throw new Error('LayerNorm: gamma must be non-empty');
      }
      if (beta.length !== gamma.length) {
        throw new Error('LayerNorm: beta length must match gamma length');
      }
      if (input.length % gamma.length !== 0) {
        throw new Error('LayerNorm: input length must be a multiple of gamma length (dModel)');
      }

      const dModel = gamma.length;
      const rows = input.length / dModel;
      const eps = 1e-5;

      const inputBuf = createStorageBuffer(device, input);
      const gammaBuf = createStorageBuffer(device, gamma);
      const betaBuf = createStorageBuffer(device, beta);
      const outputBuf = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const paramsBuf = createParamsBuffer(device, rows, dModel, eps);

      const readback = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuf } },
          { binding: 1, resource: { buffer: gammaBuf } },
          { binding: 2, resource: { buffer: betaBuf } },
          { binding: 3, resource: { buffer: outputBuf } },
          { binding: 4, resource: { buffer: paramsBuf } },
        ],
      });

      const encoder = device.createCommandEncoder();
      {
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(rows, 1, 1);
        pass.end();
      }
      encoder.copyBufferToBuffer(outputBuf, 0, readback, 0, input.byteLength);

      device.queue.submit([encoder.finish()]);

      await readback.mapAsync(GPUMapMode.READ);
      const bytes = readback.getMappedRange();
      const out = new Float32Array(bytes.slice(0));
      readback.unmap();

      inputBuf.destroy();
      gammaBuf.destroy();
      betaBuf.destroy();
      outputBuf.destroy();
      paramsBuf.destroy();
      readback.destroy();

      return out;
    },
  };
}