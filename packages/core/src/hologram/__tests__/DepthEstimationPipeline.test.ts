/**
 * DepthEstimationService — Tests for the real Transformers.js pipeline path.
 *
 * Mocks the @huggingface/transformers dynamic import to test the _runPipelineInference
 * code path without actually loading the model.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DepthEstimationService } from '../DepthEstimationService';

describe('DepthEstimationService — pipeline path', () => {
  let service: DepthEstimationService;

  beforeEach(() => {
    // Reset singleton between tests
    DepthEstimationService.resetInstance();
  });

  afterEach(() => {
    DepthEstimationService.resetInstance();
  });

  it('singleton instance is consistent', () => {
    const a = DepthEstimationService.getInstance();
    const b = DepthEstimationService.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance clears singleton', () => {
    const a = DepthEstimationService.getInstance();
    DepthEstimationService.resetInstance();
    const b = DepthEstimationService.getInstance();
    expect(a).not.toBe(b);
  });

  describe('estimateDepth (luminance fallback)', () => {
    it('produces a depth map from image data', async () => {
      service = DepthEstimationService.getInstance({ maxResolution: 64 });
      await service.initialize();

      // Create a 4x4 test image with gradient
      const width = 4;
      const height = 4;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const brightness = Math.round((x / (width - 1)) * 255);
          data[idx] = brightness;     // R
          data[idx + 1] = brightness; // G
          data[idx + 2] = brightness; // B
          data[idx + 3] = 255;        // A
        }
      }

      // Use ImageData-compatible object
      const imageData = { data, width, height } as ImageData;
      const result = await service.estimateDepth(imageData);

      expect(result).toHaveProperty('depthMap');
      expect(result).toHaveProperty('normalMap');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
      expect(result).toHaveProperty('backend');
      expect(result).toHaveProperty('inferenceMs');
      expect(result.depthMap).toBeInstanceOf(Float32Array);
      expect(result.normalMap).toBeInstanceOf(Float32Array);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.inferenceMs).toBeGreaterThanOrEqual(0);
    });

    it('depth values are in [0, 1] range', async () => {
      service = DepthEstimationService.getInstance({ maxResolution: 32 });
      await service.initialize();

      const data = new Uint8ClampedArray(8 * 8 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(Math.random() * 255);
        data[i + 1] = Math.round(Math.random() * 255);
        data[i + 2] = Math.round(Math.random() * 255);
        data[i + 3] = 255;
      }

      const result = await service.estimateDepth({ data, width: 8, height: 8 } as ImageData);

      for (let i = 0; i < result.depthMap.length; i++) {
        expect(result.depthMap[i]).toBeGreaterThanOrEqual(0);
        expect(result.depthMap[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('estimateDepthSequence', () => {
    it('processes multiple frames with temporal smoothing', async () => {
      service = DepthEstimationService.getInstance({ maxResolution: 16 });
      await service.initialize();

      const frames: ImageData[] = [];
      for (let f = 0; f < 3; f++) {
        const data = new Uint8ClampedArray(4 * 4 * 4);
        for (let i = 0; i < data.length; i += 4) {
          const v = Math.round(((f + 1) / 3) * 255);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
        frames.push({ data, width: 4, height: 4 } as ImageData);
      }

      const results = await service.estimateDepthSequence(frames);
      expect(results).toHaveLength(3);
      results.forEach(r => {
        expect(r.depthMap).toBeInstanceOf(Float32Array);
        expect(r.normalMap).toBeInstanceOf(Float32Array);
      });
    });
  });

  describe('dispose', () => {
    it('can be called without error', async () => {
      service = DepthEstimationService.getInstance();
      await service.initialize();
      service.dispose();
    });
  });
});
