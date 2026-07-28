/**
 * embeddingGatherKernel.ts — token + learned-positional embedding gather on WebGPU.
 *
 * Computes: out[t, d] = wte[ids[t], d] + wpe[t, d]
 *   ids: [seqLen]           token ids (u32)
 *   wte: [vocab, dModel]    token embedding table
 *   wpe: [seqLen, dModel]   learned absolute-position embedding, sliced to the
 *                           first seqLen positions by the host
 *   out: [seqLen, dModel]
 *
 * HoloTorch decoder piece (net-new): the GPT-2-family holo arch uses learned
 * absolute position embeddings (not RoPE), so the existing ropeKernel does not
 * cover this. One thread per output element.
 */

const WGSL_EMBED_GATHER_SOURCE = `
struct Params {
  seqLen: u32,
  dModel: u32,
  vocab:  u32,
}
@group(0) @binding(0) var<storage, read>       ids:    array<u32>;  // [seqLen]
@group(0) @binding(1) var<storage, read>       wte:    array<f32>;  // [vocab * dModel]
@group(0) @binding(2) var<storage, read>       wpe:    array<f32>;  // [seqLen * dModel]
@group(0) @binding(3) var<storage, read_write> output: array<f32>;  // [seqLen * dModel]
@group(0) @binding(4) var<uniform>             p:      Params;
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = p.seqLen * p.dModel;
  if (idx >= total) { return; }
  let t = idx / p.dModel;
  let d = idx % p.dModel;
  var tok = ids[t];
  if (tok >= p.vocab) { tok = 0u; } // clamp OOV defensively
  output[idx] = wte[tok * p.dModel + d] + wpe[t * p.dModel + d];
}
`;

export interface EmbeddingGatherKernel {
  /**
   * out[t,d] = wte[ids[t], d] + wpe[t, d].
   * @param ids [seqLen] token ids
   * @param wte [vocab*dModel] token embedding table
   * @param wpe [seqLen*dModel] positional embedding (host-sliced to seqLen rows)
   */
  run(
    ids: Uint32Array,
    wte: Float32Array,
    wpe: Float32Array,
    seqLen: number,
    dModel: number,
    vocab: number
  ): Promise<Float32Array>;
}

function f32StorageBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buf;
}

export function createEmbeddingGatherKernel(device: GPUDevice): EmbeddingGatherKernel {
  const shader = device.createShaderModule({ code: WGSL_EMBED_GATHER_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(
      ids: Uint32Array,
      wte: Float32Array,
      wpe: Float32Array,
      seqLen: number,
      dModel: number,
      vocab: number
    ): Promise<Float32Array> {
      if (ids.length !== seqLen)
        throw new Error(`embedGather: ids.length=${ids.length} != seqLen=${seqLen}`);
      if (wte.length !== vocab * dModel)
        throw new Error(`embedGather: wte.length=${wte.length} != vocab*dModel=${vocab * dModel}`);
      if (wpe.length !== seqLen * dModel)
        throw new Error(
          `embedGather: wpe.length=${wpe.length} != seqLen*dModel=${seqLen * dModel}`
        );

      const idsBuf = device.createBuffer({
        size: ids.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        idsBuf,
        0,
        ids.buffer as ArrayBuffer,
        ids.byteOffset,
        ids.byteLength
      );
      const wteBuf = f32StorageBuffer(device, wte);
      const wpeBuf = f32StorageBuffer(device, wpe);
      const outBytes = seqLen * dModel * 4;
      const outputBuf = device.createBuffer({
        size: outBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      const paramAB = new ArrayBuffer(16);
      const pu = new Uint32Array(paramAB);
      pu[0] = seqLen;
      pu[1] = dModel;
      pu[2] = vocab;
      const paramsBuf = device.createBuffer({
        size: paramAB.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(paramsBuf, 0, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: idsBuf } },
          { binding: 1, resource: { buffer: wteBuf } },
          { binding: 2, resource: { buffer: wpeBuf } },
          { binding: 3, resource: { buffer: outputBuf } },
          { binding: 4, resource: { buffer: paramsBuf } },
        ],
      });

      const total = seqLen * dModel;
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(total / 64));
      pass.end();

      const staging = device.createBuffer({
        size: outBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      enc.copyBufferToBuffer(outputBuf, 0, staging, 0, outBytes);
      device.queue.submit([enc.finish()]);

      await staging.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(staging.getMappedRange().slice(0));
      staging.unmap();

      idsBuf.destroy();
      wteBuf.destroy();
      wpeBuf.destroy();
      outputBuf.destroy();
      paramsBuf.destroy();
      staging.destroy();

      return result;
    },
  };
}
