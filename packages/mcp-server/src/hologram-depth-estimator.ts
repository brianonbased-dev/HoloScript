/**
 * HoloGram depth estimation — optional DepthAnything v2 backend.
 *
 * Tries to load `@huggingface/transformers` at runtime (optional peer dep).
 * Falls back to returning `null` when:
 *   - The package is not installed
 *   - Model download / inference fails
 *   - HOLOGRAM_DEPTH_BACKEND=luminance-proxy env var is set
 *
 * Callers should use the luminance-proxy path in the render HTML when
 * `depthMap` is `null`.
 *
 * Output convention (matches the existing luminance-proxy):
 *   1.0 = close to camera  (large parallax shift)
 *   0.0 = far from camera
 *
 * DepthAnything outputs larger values for farther pixels, so we invert.
 */

export interface DepthEstimateResult {
  /** Flat Float32Array of length targetWidth × targetHeight, or null on failure. */
  depthMap: Float32Array | null;
  backend: 'depth-anything-v2' | 'luminance-proxy';
}

// Singleton pipeline — expensive to instantiate; reused across renders.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPipeline: any = null;
let pipelineLoadAttempted = false;

async function loadDepthPipeline(): Promise<unknown> {
  if (pipelineLoadAttempted) return cachedPipeline;
  pipelineLoadAttempted = true;

  try {
    // Dynamic import — @huggingface/transformers is an optional peer dep.
    const transformers = await import('@huggingface/transformers');
    // Disable browser cache and local model lookup (Railway/server environment).
    const envObj = (transformers as unknown as Record<string, unknown>).env as Record<string, unknown>;
    if (envObj) {
      envObj.useBrowserCache = false;
      envObj.allowLocalModels = false;
    }
    cachedPipeline = await (transformers as unknown as {
      pipeline(task: string, model: string, opts: Record<string, unknown>): Promise<unknown>;
    }).pipeline('depth-estimation', 'Xenova/depth-anything-v2-small-hf', { dtype: 'fp32' });
    return cachedPipeline;
  } catch {
    return null;
  }
}

/**
 * Bilinear resize for a flat Float32Array image of dimensions srcW × srcH
 * to dstW × dstH.  Both source and destination are row-major.
 */
export function bilinearResize(
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

/**
 * Estimate monocular depth from an image URL.
 *
 * Uses DepthAnything v2 Small (Xenova ONNX quantized) when available.
 * Falls back to `{ depthMap: null, backend: 'luminance-proxy' }` on any failure
 * so the caller can safely apply the luminance-proxy path.
 *
 * @param imageUrl  File path or HTTPS URL accepted by RawImage.fromURL.
 *                  `file://` URIs and `https://` URLs both work.
 * @param targetWidth  Width of the output depth map (render canvas width).
 * @param targetHeight Height of the output depth map (render canvas height).
 */
export async function estimateDepthFromUrl(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number,
): Promise<DepthEstimateResult> {
  const forceBackend = process.env.HOLOGRAM_DEPTH_BACKEND?.trim();
  if (forceBackend === 'luminance-proxy') {
    return { depthMap: null, backend: 'luminance-proxy' };
  }

  const pipe = await loadDepthPipeline();
  if (!pipe) return { depthMap: null, backend: 'luminance-proxy' };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (pipe as (url: string) => Promise<unknown>)(imageUrl);
    const tensor = (result as { predicted_depth: { data: Float32Array; dims: [number, number] } }).predicted_depth;
    const rawData = tensor.data;
    const [srcH, srcW] = tensor.dims;

    // Normalize raw depth values to [0, 1] and invert so 1 = close.
    let min = Infinity;
    let max = -Infinity;
    for (const v of rawData) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const normalized = new Float32Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      // Invert: DepthAnything larger = farther → our convention: larger = closer
      normalized[i] = 1 - (rawData[i] - min) / range;
    }

    // Bilinear-resize to render canvas dimensions.
    const resized =
      srcW === targetWidth && srcH === targetHeight
        ? normalized
        : bilinearResize(normalized, srcW, srcH, targetWidth, targetHeight);

    return { depthMap: resized, backend: 'depth-anything-v2' };
  } catch {
    return { depthMap: null, backend: 'luminance-proxy' };
  }
}

/** Reset the cached pipeline (for testing). */
export function _resetDepthPipelineCache(): void {
  cachedPipeline = null;
  pipelineLoadAttempted = false;
}
