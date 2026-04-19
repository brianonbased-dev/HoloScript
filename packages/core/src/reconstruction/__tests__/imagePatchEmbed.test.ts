import { describe, expect, it } from 'vitest';
import { createImagePatchEmbedKernel } from '../imagePatchEmbedKernel';
import { isWebGpuEnvironmentPresent } from '../webgpuGate';

// ---------------------------------------------------------------------------
// CPU reference
// ---------------------------------------------------------------------------
function imagePatchEmbedCpu(
  image: Float32Array,
  proj: Float32Array,
  imgH: number,
  imgW: number,
  patchH: number,
  patchW: number,
  numChannels: number,
  embedDim: number,
): Float32Array {
  const patchLen = patchH * patchW * numChannels;
  const numPatchesY = imgH / patchH;
  const numPatchesX = imgW / patchW;
  const numPatches = numPatchesY * numPatchesX;
  const out = new Float32Array(numPatches * embedDim);

  for (let gy = 0; gy < numPatchesY; gy++) {
    for (let gx = 0; gx < numPatchesX; gx++) {
      const patchIdx = gy * numPatchesX + gx;
      // Extract patch
      const patch = new Float32Array(patchLen);
      for (let pr = 0; pr < patchH; pr++) {
        for (let pc = 0; pc < patchW; pc++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const row = gy * patchH + pr;
            const col = gx * patchW + pc;
            patch[(pr * patchW + pc) * numChannels + ch] =
              image[(row * imgW + col) * numChannels + ch];
          }
        }
      }
      // Project
      for (let d = 0; d < embedDim; d++) {
        let dot = 0;
        for (let i = 0; i < patchLen; i++) dot += proj[d * patchLen + i] * patch[i];
        out[patchIdx * embedDim + d] = dot;
      }
    }
  }
  return out;
}

function allClose(a: Float32Array, b: Float32Array, atol = 1e-4): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > atol) return false;
  return true;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// CPU tests
// ---------------------------------------------------------------------------
describe('ImagePatchEmbed — CPU reference', () => {
  it('1 patch (4x4 image, 4x4 patch, 1 channel): just a dot product', () => {
    const image = new Float32Array([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]);
    const proj = new Float32Array(16).fill(1); // single output dim = sum of all pixels
    const out = imagePatchEmbedCpu(image, proj, 4, 4, 4, 4, 1, 1);
    expect(out.length).toBe(1);
    // sum 1..16 = 136
    expect(out[0]).toBeCloseTo(136, 4);
  });

  it('4 patches (4x4 image, 2x2 patch, 1 channel), identity proj', () => {
    // Image: each 2x2 block has unique values
    const image = new Float32Array([
      1,2, 3,4,
      5,6, 7,8,
      9,10, 11,12,
      13,14, 15,16,
    ]);
    // patchLen = 4, embedDim = 4 → projection = identity 4x4
    const proj = new Float32Array(16);
    for (let i = 0; i < 4; i++) proj[i * 4 + i] = 1; // identity
    const out = imagePatchEmbedCpu(image, proj, 4, 4, 2, 2, 1, 4);
    // Patch 0 (top-left): [1,2,5,6]
    expect(out[0]).toBeCloseTo(1, 4);
    expect(out[1]).toBeCloseTo(2, 4);
    expect(out[2]).toBeCloseTo(5, 4);
    expect(out[3]).toBeCloseTo(6, 4);
    // Patch 1 (top-right): [3,4,7,8]
    expect(out[4]).toBeCloseTo(3, 4);
    expect(out[5]).toBeCloseTo(4, 4);
  });

  it('random 6x8 image, 2x4 patch, 3 channels, 8 embedDim', () => {
    const rng = mulberry32(31);
    const imgH = 6, imgW = 8, patchH = 2, patchW = 4, numChannels = 3, embedDim = 8;
    const patchLen = patchH * patchW * numChannels;
    const image = new Float32Array(imgH * imgW * numChannels).map(() => rng() - 0.5);
    const proj = new Float32Array(embedDim * patchLen).map(() => rng() - 0.5);
    const out = imagePatchEmbedCpu(image, proj, imgH, imgW, patchH, patchW, numChannels, embedDim);
    const numPatches = (imgH / patchH) * (imgW / patchW); // 3*2=6
    expect(out.length).toBe(numPatches * embedDim);
    // Values are just numbers — verify no NaN
    for (let i = 0; i < out.length; i++) expect(isNaN(out[i])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WebGPU tests
// ---------------------------------------------------------------------------
describe('ImagePatchEmbed — WebGPU', () => {
  it('4x4 image, 2x2 patch, 1 channel, embedDim=4 (identity proj)', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping ImagePatchEmbed GPU test');
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const imgH = 4, imgW = 4, patchH = 2, patchW = 2, numChannels = 1, embedDim = 4;
    const image = new Float32Array([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]);
    // Identity projection
    const proj = new Float32Array(embedDim * 4);
    for (let i = 0; i < 4; i++) proj[i * 4 + i] = 1;

    const cpu = imagePatchEmbedCpu(image, proj, imgH, imgW, patchH, patchW, numChannels, embedDim);
    const kernel = createImagePatchEmbedKernel(device);
    const gpu = await kernel.run(image, proj, { imgH, imgW, patchH, patchW, numChannels, embedDim });

    expect(allClose(gpu, cpu, 1e-4)).toBe(true);
    device.destroy();
  });

  it('random 8x8 image, 2x2 patch, 3 channels, embedDim=16', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const rng = mulberry32(77);
    const imgH = 8, imgW = 8, patchH = 2, patchW = 2, numChannels = 3, embedDim = 16;
    const patchLen = patchH * patchW * numChannels;
    const image = new Float32Array(imgH * imgW * numChannels).map(() => rng() - 0.5);
    const proj = new Float32Array(embedDim * patchLen).map(() => rng() - 0.5);

    const cpu = imagePatchEmbedCpu(image, proj, imgH, imgW, patchH, patchW, numChannels, embedDim);
    const kernel = createImagePatchEmbedKernel(device);
    const gpu = await kernel.run(image, proj, { imgH, imgW, patchH, patchW, numChannels, embedDim });

    expect(allClose(gpu, cpu, 1e-3)).toBe(true);
    device.destroy();
  });

  it('throws when imgH not divisible by patchH', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const kernel = createImagePatchEmbedKernel(device);
    await expect(
      kernel.run(
        new Float32Array(15),
        new Float32Array(4),
        { imgH: 5, imgW: 3, patchH: 2, patchW: 3, numChannels: 1, embedDim: 1 },
      ),
    ).rejects.toThrow('imgH');
    device.destroy();
  });
});
