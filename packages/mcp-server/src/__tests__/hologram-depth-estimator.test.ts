import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bilinearResize, estimateDepthFromUrl, _resetDepthPipelineCache } from '../hologram-depth-estimator';

// ---------------------------------------------------------------------------
// bilinearResize — pure function tests (no mocking needed)
// ---------------------------------------------------------------------------
describe('bilinearResize', () => {
  it('returns same-size array when dimensions match', () => {
    const src = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const result = bilinearResize(src, 2, 2, 2, 2);
    expect(result).toHaveLength(4);
    // Should be equal (no resize needed — but bilinear still runs)
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[3]).toBeCloseTo(0.4);
  });

  it('downsamples 4×4 → 2×2', () => {
    // Uniform source: all 0.5 → all 0.5
    const src = new Float32Array(16).fill(0.5);
    const result = bilinearResize(src, 4, 4, 2, 2);
    expect(result).toHaveLength(4);
    for (const v of result) expect(v).toBeCloseTo(0.5);
  });

  it('upsamples 2×2 → 4×4', () => {
    // All-1 source → all-1 result
    const src = new Float32Array(4).fill(1.0);
    const result = bilinearResize(src, 2, 2, 4, 4);
    expect(result).toHaveLength(16);
    for (const v of result) expect(v).toBeCloseTo(1.0);
  });

  it('clamps coordinates at borders', () => {
    // 1×1 source → any target size; only one value to interpolate
    const src = new Float32Array([0.75]);
    const result = bilinearResize(src, 1, 1, 3, 3);
    expect(result).toHaveLength(9);
    for (const v of result) expect(v).toBeCloseTo(0.75);
  });

  it('produces values within [0, 1] for valid input', () => {
    const src = Float32Array.from({ length: 6 * 4 }, (_, i) => (i % 7) / 10);
    const result = bilinearResize(src, 6, 4, 3, 2);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// estimateDepthFromUrl — mocking @huggingface/transformers
// ---------------------------------------------------------------------------

// We hoist the mock factory so it can be mutated per-test.
const { mockPipeline } = vi.hoisted(() => ({ mockPipeline: vi.fn() }));

vi.mock('@huggingface/transformers', async () => ({
  pipeline: mockPipeline,
  env: { useBrowserCache: true, allowLocalModels: true },
}));

describe('estimateDepthFromUrl', () => {
  beforeEach(() => {
    _resetDepthPipelineCache();
    delete process.env.HOLOGRAM_DEPTH_BACKEND;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.HOLOGRAM_DEPTH_BACKEND;
  });

  it('returns luminance-proxy when HOLOGRAM_DEPTH_BACKEND=luminance-proxy', async () => {
    process.env.HOLOGRAM_DEPTH_BACKEND = 'luminance-proxy';
    const result = await estimateDepthFromUrl('https://example.com/img.jpg', 420, 560);
    expect(result.backend).toBe('luminance-proxy');
    expect(result.depthMap).toBeNull();
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('returns depth-anything-v2 backend when pipeline succeeds', async () => {
    const W = 10;
    const H = 8;
    const rawDepth = new Float32Array(W * H);
    for (let i = 0; i < rawDepth.length; i++) rawDepth[i] = i / rawDepth.length;

    const mockInfer = vi.fn().mockResolvedValue({
      predicted_depth: { data: rawDepth, dims: [H, W] },
    });
    mockPipeline.mockResolvedValue(mockInfer);

    const result = await estimateDepthFromUrl('https://example.com/img.jpg', W, H);

    expect(result.backend).toBe('depth-anything-v2');
    expect(result.depthMap).not.toBeNull();
    expect(result.depthMap).toHaveLength(W * H);
  });

  it('normalizes output values to [0, 1]', async () => {
    const W = 4;
    const H = 4;
    // DepthAnything outputs arbitrary scale (e.g. 0–10)
    const rawDepth = new Float32Array(W * H);
    for (let i = 0; i < rawDepth.length; i++) rawDepth[i] = i * 10;

    const mockInfer = vi.fn().mockResolvedValue({
      predicted_depth: { data: rawDepth, dims: [H, W] },
    });
    mockPipeline.mockResolvedValue(mockInfer);

    const result = await estimateDepthFromUrl('https://example.com/img.jpg', W, H);

    expect(result.depthMap).not.toBeNull();
    const map = result.depthMap!;
    for (const v of map) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('inverts depth: far pixels (high raw) → low output value', async () => {
    const W = 2;
    const H = 1;
    // pixel 0 = 0 (close), pixel 1 = 1 (far)
    const rawDepth = new Float32Array([0, 1]);

    const mockInfer = vi.fn().mockResolvedValue({
      predicted_depth: { data: rawDepth, dims: [H, W] },
    });
    mockPipeline.mockResolvedValue(mockInfer);

    const result = await estimateDepthFromUrl('https://example.com/img.jpg', W, H);

    expect(result.depthMap).not.toBeNull();
    const [close, far] = result.depthMap!;
    // close pixel should have higher depth value (≈1), far pixel lower (≈0)
    expect(close).toBeGreaterThan(far);
  });

  it('bilinear-resizes when source dims differ from target', async () => {
    const srcW = 5;
    const srcH = 4;
    const tgtW = 10;
    const tgtH = 8;
    const rawDepth = new Float32Array(srcW * srcH).fill(0.5);

    const mockInfer = vi.fn().mockResolvedValue({
      predicted_depth: { data: rawDepth, dims: [srcH, srcW] },
    });
    mockPipeline.mockResolvedValue(mockInfer);

    const result = await estimateDepthFromUrl('https://example.com/img.jpg', tgtW, tgtH);

    expect(result.depthMap).not.toBeNull();
    expect(result.depthMap!.length).toBe(tgtW * tgtH);
  });

  it('returns luminance-proxy when @huggingface/transformers throws on load', async () => {
    mockPipeline.mockRejectedValue(new Error('Module not found'));

    const result = await estimateDepthFromUrl('https://example.com/img.jpg', 420, 560);

    expect(result.backend).toBe('luminance-proxy');
    expect(result.depthMap).toBeNull();
  });

  it('returns luminance-proxy when inference throws', async () => {
    const mockInfer = vi.fn().mockRejectedValue(new Error('ONNX inference failed'));
    mockPipeline.mockResolvedValue(mockInfer);

    const result = await estimateDepthFromUrl('https://example.com/img.jpg', 420, 560);

    expect(result.backend).toBe('luminance-proxy');
    expect(result.depthMap).toBeNull();
  });

  it('reuses the pipeline singleton across calls (loads only once)', async () => {
    const W = 3;
    const H = 3;
    const rawDepth = new Float32Array(W * H).fill(0.5);
    const mockInfer = vi.fn().mockResolvedValue({
      predicted_depth: { data: rawDepth, dims: [H, W] },
    });
    mockPipeline.mockResolvedValue(mockInfer);

    await estimateDepthFromUrl('https://example.com/img1.jpg', W, H);
    await estimateDepthFromUrl('https://example.com/img2.jpg', W, H);

    // pipeline() factory should have been called exactly once
    expect(mockPipeline).toHaveBeenCalledTimes(1);
    // The actual inference fn should have been called twice
    expect(mockInfer).toHaveBeenCalledTimes(2);
  });
});
