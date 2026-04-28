const WGSL_GELU_SOURCE = `
struct Params {
  elements: u32,
}
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
fn gelu(x: f32) -> f32 {
  let k0 = 0.7978845608;
  let k1 = 0.044715;
  let x3 = x * x * x;
  let inner = k0 * (x + k1 * x3);
  return 0.5 * x * (1.0 + tanh(inner));
}
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  var idx = gid.x;
  let stride = 64u;
  while (idx < params.elements) {
    output[idx] = gelu(input[idx]);
    idx = idx + stride;
  }
}
`;

export interface GeluKernel {
  run(input: Float32Array): Promise<Float32Array>;
}

function createInputBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buf;
}

function createParamsBuffer(device: GPUDevice, elements: number): GPUBuffer {
  const paramsBytes = new ArrayBuffer(16);
  const view = new DataView(paramsBytes);
  view.setUint32(0, elements, true);

  const params = device.createBuffer({
    size: paramsBytes.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(params, 0, paramsBytes);
  return params;
}

export function createGeluKernel(device: GPUDevice): GeluKernel {
  const shader = device.createShaderModule({ code: WGSL_GELU_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main',
    },
  });

  return {
    async run(input: Float32Array): Promise<Float32Array> {
      if (input.length === 0) {
        throw new Error('GELU: input must be non-empty');
      }

      const inputBuf = createInputBuffer(device, input);
      const outputBuf = device.createBuffer({
        size: input.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const paramsBuf = createParamsBuffer(device, input.length);

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
        pass.dispatchWorkgroups(1, 1, 1);
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