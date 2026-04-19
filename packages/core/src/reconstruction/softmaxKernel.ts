const WGSL_SOFTMAX_SOURCE = `
struct Params {
  rows: u32,
  cols: u32,
}
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
var<workgroup> reduceScratch: array<f32, 64>;
fn inputIndex(row: u32, col: u32) -> u32 {
  return row * params.cols + col;
}
@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id) workgroupId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
) {
  let row = workgroupId.x;
  let lane = localId.x;
  if (row >= params.rows || params.cols == 0u) {
    return;
  }
  var localMax = -1e30;
  for (var c: u32 = lane; c < params.cols; c = c + 64u) {
    localMax = max(localMax, input[inputIndex(row, c)]);
  }
  reduceScratch[lane] = localMax;
  workgroupBarrier();
  var stride: u32 = 32u;
  loop {
    if (lane < stride) {
      reduceScratch[lane] = max(reduceScratch[lane], reduceScratch[lane + stride]);
    }
    workgroupBarrier();
    if (stride == 1u) {
      break;
    }
    stride = stride >> 1u;
  }
  let rowMax = reduceScratch[0];
  var localSum = 0.0;
  for (var c: u32 = lane; c < params.cols; c = c + 64u) {
    let ex = exp(input[inputIndex(row, c)] - rowMax);
    output[inputIndex(row, c)] = ex;
    localSum = localSum + ex;
  }
  reduceScratch[lane] = localSum;
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
  let denom = max(reduceScratch[0], 1e-30);
  for (var c: u32 = lane; c < params.cols; c = c + 64u) {
    let idx = inputIndex(row, c);
    output[idx] = output[idx] / denom;
  }
}
`;

export interface SoftmaxKernel {
  run(input: Float32Array, rows: number, cols: number): Promise<Float32Array>;
}

function createInputBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

function createParamsBuffer(device: GPUDevice, rows: number, cols: number): GPUBuffer {
  const paramsBytes = new ArrayBuffer(16);
  const view = new DataView(paramsBytes);
  view.setUint32(0, rows, true);
  view.setUint32(4, cols, true);

  const params = device.createBuffer({
    size: paramsBytes.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(params, 0, paramsBytes);
  return params;
}

export function createSoftmaxKernel(device: GPUDevice): SoftmaxKernel {
  const shader = device.createShaderModule({ code: WGSL_SOFTMAX_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main',
    },
  });

  return {
    async run(input: Float32Array, rows: number, cols: number): Promise<Float32Array> {
      if (!Number.isInteger(rows) || rows <= 0) {
        throw new Error('Softmax: rows must be a positive integer');
      }
      if (!Number.isInteger(cols) || cols <= 0) {
        throw new Error('Softmax: cols must be a positive integer');
      }
      if (cols > 4096) {
        throw new Error('Softmax: cols must be <= 4096 for Sprint 2 MVP');
      }
      if (input.length !== rows * cols) {
        throw new Error('Softmax: input length must equal rows * cols');
      }

      const inputBuf = createInputBuffer(device, input);
      const outputBuf = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const paramsBuf = createParamsBuffer(device, rows, cols);

      const readback = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuf } },
          { binding: 1, resource: { buffer: outputBuf } },
          { binding: 2, resource: { buffer: paramsBuf } },
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
      outputBuf.destroy();
      paramsBuf.destroy();
      readback.destroy();

      return out;
    },
  };
}