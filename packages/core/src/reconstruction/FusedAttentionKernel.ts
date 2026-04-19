export interface FusedAttentionInput {
  q: Float32Array;
  k: Float32Array;
  v: Float32Array;
  qRows: number;
  kRows: number;
  dModel: number;
  vCols: number;
}

export interface FusedAttentionBackend {
  name: 'webgpu' | 'cpu';
  compute(input: FusedAttentionInput): Promise<Float32Array>;
}

/** Mirrors `shaders/fusedAttention.wgsl` for bundler-less WebGPU.createShaderModule. */
const FUSED_ATTENTION_WGSL = `
struct Params {
  qRows: u32,
  kRows: u32,
  dModel: u32,
  vCols: u32,
  scale: f32,
}

@group(0) @binding(0) var<storage, read> q: array<f32>;
@group(0) @binding(1) var<storage, read> k: array<f32>;
@group(0) @binding(2) var<storage, read> v: array<f32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

fn qIndex(row: u32, col: u32) -> u32 {
  return row * params.dModel + col;
}

fn kIndex(row: u32, col: u32) -> u32 {
  return row * params.dModel + col;
}

fn vIndex(row: u32, col: u32) -> u32 {
  return row * params.vCols + col;
}

fn oIndex(row: u32, col: u32) -> u32 {
  return row * params.vCols + col;
}

@compute @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let qRow = gid.x;
  if (qRow >= params.qRows) {
    return;
  }

  var maxScore = -1e30;
  for (var kRow: u32 = 0u; kRow < params.kRows; kRow = kRow + 1u) {
    var dot = 0.0;
    for (var d: u32 = 0u; d < params.dModel; d = d + 1u) {
      dot = dot + q[qIndex(qRow, d)] * k[kIndex(kRow, d)];
    }
    let score = dot * params.scale;
    if (score > maxScore) {
      maxScore = score;
    }
  }

  var denom = 0.0;
  for (var kRow: u32 = 0u; kRow < params.kRows; kRow = kRow + 1u) {
    var dot = 0.0;
    for (var d: u32 = 0u; d < params.dModel; d = d + 1u) {
      dot = dot + q[qIndex(qRow, d)] * k[kIndex(kRow, d)];
    }
    denom = denom + exp(dot * params.scale - maxScore);
  }

  for (var c: u32 = 0u; c < params.vCols; c = c + 1u) {
    var acc = 0.0;
    for (var kRow: u32 = 0u; kRow < params.kRows; kRow = kRow + 1u) {
      var dot = 0.0;
      for (var d: u32 = 0u; d < params.dModel; d = d + 1u) {
        dot = dot + q[qIndex(qRow, d)] * k[kIndex(kRow, d)];
      }
      let w = exp(dot * params.scale - maxScore) / max(denom, 1e-9);
      acc = acc + w * v[vIndex(kRow, c)];
    }
    out[oIndex(qRow, c)] = acc;
  }
}
`;

function cpuFusedAttention(input: FusedAttentionInput): Float32Array {
  const { q, k, v, qRows, kRows, dModel, vCols } = input;
  const out = new Float32Array(qRows * vCols);
  const scale = 1 / Math.sqrt(Math.max(dModel, 1));

  for (let qr = 0; qr < qRows; qr += 1) {
    let maxScore = -Number.MAX_VALUE;
    const scores = new Float32Array(kRows);

    for (let kr = 0; kr < kRows; kr += 1) {
      let dot = 0;
      for (let d = 0; d < dModel; d += 1) {
        dot += q[qr * dModel + d] * k[kr * dModel + d];
      }
      const s = dot * scale;
      scores[kr] = s;
      if (s > maxScore) maxScore = s;
    }

    let denom = 0;
    for (let kr = 0; kr < kRows; kr += 1) {
      const ex = Math.exp(scores[kr] - maxScore);
      scores[kr] = ex;
      denom += ex;
    }

    for (let c = 0; c < vCols; c += 1) {
      let acc = 0;
      for (let kr = 0; kr < kRows; kr += 1) {
        const w = scores[kr] / Math.max(denom, 1e-9);
        acc += w * v[kr * vCols + c];
      }
      out[qr * vCols + c] = acc;
    }
  }

  return out;
}

async function webGpuFusedAttention(input: FusedAttentionInput): Promise<Float32Array> {
  const nav = globalThis.navigator as Navigator & { gpu?: GPU };
  const gpu = nav.gpu;
  if (!gpu) {
    throw new Error('WebGPU not available');
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No WebGPU adapter');
  }

  const device = await adapter.requestDevice();
  const { q, k, v, qRows, kRows, dModel, vCols } = input;

  const qBytes = q.byteLength;
  const kBytes = k.byteLength;
  const vBytes = v.byteLength;
  const outElems = qRows * vCols;
  const outBytes = outElems * 4;

  const qBuf = device.createBuffer({
    size: Math.max(4, qBytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const kBuf = device.createBuffer({
    size: Math.max(4, kBytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const vBuf = device.createBuffer({
    size: Math.max(4, vBytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const outBuf = device.createBuffer({
    size: Math.max(4, outBytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const uniBuf = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformData = new ArrayBuffer(256);
  const u32 = new Uint32Array(uniformData, 0, 4);
  const f32 = new Float32Array(uniformData, 16, 1);
  u32[0] = qRows;
  u32[1] = kRows;
  u32[2] = dModel;
  u32[3] = vCols;
  f32[0] = 1 / Math.sqrt(Math.max(dModel, 1));

  device.queue.writeBuffer(qBuf, 0, q);
  device.queue.writeBuffer(kBuf, 0, k);
  device.queue.writeBuffer(vBuf, 0, v);
  device.queue.writeBuffer(uniBuf, 0, uniformData);

  const module = device.createShaderModule({ code: FUSED_ATTENTION_WGSL });
  const bindLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindLayout] });
  const pipeline = await device.createComputePipelineAsync({
    layout: pipelineLayout,
    compute: { module, entryPoint: 'main' },
  });

  const bindGroup = device.createBindGroup({
    layout: bindLayout,
    entries: [
      { binding: 0, resource: { buffer: qBuf } },
      { binding: 1, resource: { buffer: kBuf } },
      { binding: 2, resource: { buffer: vBuf } },
      { binding: 3, resource: { buffer: outBuf } },
      { binding: 4, resource: { buffer: uniBuf } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(qRows, 1, 1);
  pass.end();

  const readBuf = device.createBuffer({
    size: Math.max(4, outBytes),
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyBufferToBuffer(outBuf, 0, readBuf, 0, outBytes);
  device.queue.submit([encoder.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const mapped = new Float32Array(readBuf.getMappedRange());
  const copy = new Float32Array(outElems);
  copy.set(mapped);
  readBuf.unmap();

  qBuf.destroy();
  kBuf.destroy();
  vBuf.destroy();
  outBuf.destroy();
  uniBuf.destroy();
  readBuf.destroy();

  return copy;
}

class CpuFusedAttentionBackend implements FusedAttentionBackend {
  public readonly name = 'cpu' as const;

  async compute(input: FusedAttentionInput): Promise<Float32Array> {
    return cpuFusedAttention(input);
  }
}

class WebGpuFusedAttentionBackend implements FusedAttentionBackend {
  public readonly name = 'webgpu' as const;

  async compute(input: FusedAttentionInput): Promise<Float32Array> {
    try {
      return await webGpuFusedAttention(input);
    } catch {
      return cpuFusedAttention(input);
    }
  }
}

export async function createFusedAttentionBackend(): Promise<FusedAttentionBackend> {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return new WebGpuFusedAttentionBackend();
  }
  return new CpuFusedAttentionBackend();
}
