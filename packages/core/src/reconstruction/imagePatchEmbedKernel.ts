/**
 * imagePatchEmbedKernel.ts — ViT-style image patch embedding via WebGPU
 *
 * Extracts non-overlapping patches of size (patchH × patchW × numChannels)
 * from an input image [imgH, imgW, numChannels] and projects each patch
 * to an embedDim-dimensional vector using a learned projection matrix.
 *
 * numPatches = (imgH / patchH) × (imgW / patchW)   (integer division, no padding)
 * patchLen   = patchH × patchW × numChannels
 * Output:     [numPatches, embedDim]
 *
 * Dispatch:   one workgroup per patch
 * workgroup_size(64, 1, 1): threads fan out over embedDim
 * Each thread processes one output dimension by dot-product with the
 * flat projection row (proj[d, :] has patchLen elements).
 */

const WGSL_IMAGE_PATCH_EMBED = `
struct Params {
  imgH:       u32,
  imgW:       u32,
  patchH:     u32,
  patchW:     u32,
  numChannels:u32,
  embedDim:   u32,
  patchLen:   u32,  // = patchH * patchW * numChannels
  numPatchesX:u32,  // = imgW / patchW
}

@group(0) @binding(0) var<storage, read>       img:  array<f32>; // [imgH, imgW, numChannels]
@group(0) @binding(1) var<storage, read>       proj: array<f32>; // [embedDim, patchLen]
@group(0) @binding(2) var<storage, read_write> out:  array<f32>; // [numPatches, embedDim]
@group(0) @binding(3) var<uniform>             p:    Params;

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id)        wg:  vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let patchIdx = wg.x;
  let patchRow = patchIdx / p.numPatchesX;
  let patchCol = patchIdx % p.numPatchesX;

  // Top-left corner of patch in the image
  let startRow = patchRow * p.patchH;
  let startCol = patchCol * p.patchW;

  // Fan out over embedDim
  var d = lid.x;
  while (d < p.embedDim) {
    let projRow = d * p.patchLen;
    var dot: f32 = 0.0;

    for (var pr = 0u; pr < p.patchH; pr++) {
      for (var pc2 = 0u; pc2 < p.patchW; pc2++) {
        for (var ch = 0u; ch < p.numChannels; ch++) {
          let imgRow = startRow + pr;
          let imgCol = startCol + pc2;
          let imgIdx = (imgRow * p.imgW + imgCol) * p.numChannels + ch;
          let projIdx = projRow + (pr * p.patchW + pc2) * p.numChannels + ch;
          dot = dot + img[imgIdx] * proj[projIdx];
        }
      }
    }
    out[patchIdx * p.embedDim + d] = dot;
    d = d + 64u;
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
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ImagePatchEmbedParams {
  imgH:        number;
  imgW:        number;
  patchH:      number;
  patchW:      number;
  numChannels: number;
  embedDim:    number;
}

export interface ImagePatchEmbedKernel {
  /**
   * @param image  Flat [imgH, imgW, numChannels] row-major image tensor
   * @param proj   Projection matrix [embedDim, patchLen], patchLen = patchH*patchW*numChannels
   * @returns      [numPatches, embedDim] where numPatches = (imgH/patchH)*(imgW/patchW)
   */
  run(image: Float32Array, proj: Float32Array, params: ImagePatchEmbedParams): Promise<Float32Array>;
}

export function createImagePatchEmbedKernel(device: GPUDevice): ImagePatchEmbedKernel {
  const shader = device.createShaderModule({ code: WGSL_IMAGE_PATCH_EMBED });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' },
  });

  return {
    async run(
      image: Float32Array,
      proj: Float32Array,
      params: ImagePatchEmbedParams,
    ): Promise<Float32Array> {
      const { imgH, imgW, patchH, patchW, numChannels, embedDim } = params;

      if (imgH % patchH !== 0) throw new Error(`imagePatchEmbed: imgH=${imgH} not divisible by patchH=${patchH}`);
      if (imgW % patchW !== 0) throw new Error(`imagePatchEmbed: imgW=${imgW} not divisible by patchW=${patchW}`);

      const patchLen = patchH * patchW * numChannels;
      const numPatchesY = imgH / patchH;
      const numPatchesX = imgW / patchW;
      const numPatches = numPatchesY * numPatchesX;

      if (image.length !== imgH * imgW * numChannels) throw new Error(`imagePatchEmbed: image size mismatch`);
      if (proj.length !== embedDim * patchLen) throw new Error(`imagePatchEmbed: proj size mismatch`);

      const outBytes = numPatches * embedDim * 4;

      const imgBuf = storageBuffer(device, image);
      const projBuf = storageBuffer(device, proj);
      const outBuf = device.createBuffer({
        size: outBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      const paramAB = new ArrayBuffer(32);
      const pu = new Uint32Array(paramAB);
      pu[0] = imgH; pu[1] = imgW; pu[2] = patchH; pu[3] = patchW;
      pu[4] = numChannels; pu[5] = embedDim; pu[6] = patchLen; pu[7] = numPatchesX;
      const paramsBuf = device.createBuffer({
        size: paramAB.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(paramsBuf, 0, paramAB);

      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: imgBuf } },
          { binding: 1, resource: { buffer: projBuf } },
          { binding: 2, resource: { buffer: outBuf } },
          { binding: 3, resource: { buffer: paramsBuf } },
        ],
      });

      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(numPatches);
      pass.end();

      const staging = device.createBuffer({
        size: outBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      enc.copyBufferToBuffer(outBuf, 0, staging, 0, outBytes);
      device.queue.submit([enc.finish()]);

      await staging.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(staging.getMappedRange().slice(0));
      staging.unmap();

      imgBuf.destroy(); projBuf.destroy(); outBuf.destroy();
      paramsBuf.destroy(); staging.destroy();

      return result;
    },
  };
}
