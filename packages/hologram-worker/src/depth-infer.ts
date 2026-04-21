import { promises as fs } from 'node:fs';

import sharp from 'sharp';

import type { DepthInferenceResult } from '@holoscript/engine/hologram';
import type { HologramSourceKind } from '@holoscript/engine/hologram';

const MODEL_ID = 'depth-anything/Depth-Anything-V2-Small-hf';

async function luminanceDepthFromPng(
  pngPath: string,
  width: number,
  height: number,
): Promise<Float32Array> {
  const { data } = await sharp(await fs.readFile(pngPath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const depthMap = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const px = i * 4;
    const r = data[px] / 255;
    const g = data[px + 1] / 255;
    const b = data[px + 2] / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    depthMap[i] = 1.0 - luminance;
  }
  return depthMap;
}

function bilinearResize(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const srcY = (y + 0.5) * yScale - 0.5;
    const y0 = Math.max(0, Math.floor(srcY));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const yFrac = srcY - y0;
    for (let x = 0; x < dstW; x++) {
      const srcX = (x + 0.5) * xScale - 0.5;
      const x0 = Math.max(0, Math.floor(srcX));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const xFrac = srcX - x0;
      const v00 = src[y0 * srcW + x0];
      const v01 = src[y0 * srcW + x1];
      const v10 = src[y1 * srcW + x0];
      const v11 = src[y1 * srcW + x1];
      dst[y * dstW + x] =
        v00 * (1 - xFrac) * (1 - yFrac) +
        v01 * xFrac * (1 - yFrac) +
        v10 * (1 - xFrac) * yFrac +
        v11 * xFrac * yFrac;
    }
  }
  return dst;
}

async function runOnnxDepth(
  modelPath: string,
  pngPath: string,
  outW: number,
  outH: number,
): Promise<DepthInferenceResult> {
  const ort = await import('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath);
  const target = 518;
  const { data: rgb } = await sharp(await fs.readFile(pngPath))
    .resize(target, target, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const chw = new Float32Array(3 * target * target);
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      const i = (y * target + x) * 3;
      const r = rgb[i] / 255;
      const g = rgb[i + 1] / 255;
      const b = rgb[i + 2] / 255;
      chw[0 * target * target + y * target + x] = (r - mean[0]) / std[0];
      chw[1 * target * target + y * target + x] = (g - mean[1]) / std[1];
      chw[2 * target * target + y * target + x] = (b - mean[2]) / std[2];
    }
  }

  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', chw, [1, 3, target, target]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await session.run({ [inputName]: tensor } as any);
  const outName = session.outputNames[0];
  const output = results[outName] as ort.Tensor;
  const outData = output.data as Float32Array;
  const dims = output.dims;
  let oh = target;
  let ow = target;
  if (dims.length === 4) {
    oh = Number(dims[2]);
    ow = Number(dims[3]);
  } else if (dims.length === 3) {
    oh = Number(dims[1]);
    ow = Number(dims[2]);
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < outData.length; i++) {
    const v = outData[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const norm = new Float32Array(outData.length);
  for (let i = 0; i < outData.length; i++) {
    norm[i] = 1 - (outData[i] - min) / range;
  }

  const resized = bilinearResize(norm, ow, oh, outW, outH);

  return {
    depthMap: resized,
    width: outW,
    height: outH,
    frames: 1,
    backend: 'onnxruntime-node',
    modelId: MODEL_ID,
  };
}

export async function inferDepthForRaster(
  pngPath: string,
  width: number,
  height: number,
  _sourceKind: HologramSourceKind,
): Promise<DepthInferenceResult> {
  void _sourceKind;
  const onnxPath = process.env.HOLOGRAM_ONNX_MODEL_PATH?.trim();
  if (onnxPath && process.env.HOLOGRAM_WORKER_DEPTH_BACKEND !== 'luminance') {
    try {
      return await runOnnxDepth(onnxPath, pngPath, width, height);
    } catch {
      /* fall through to luminance */
    }
  }

  const depthMap = await luminanceDepthFromPng(pngPath, width, height);
  return {
    depthMap,
    width,
    height,
    frames: 1,
    backend: 'cpu',
    modelId: MODEL_ID,
  };
}
