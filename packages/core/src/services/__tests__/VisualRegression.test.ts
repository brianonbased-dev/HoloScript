import { describe, it, expect, beforeEach } from 'vitest';
import { VisualRegressionService } from '../VisualRegressionService';
import { PNG } from 'pngjs';

describe('VisualRegressionService', () => {
  let service: VisualRegressionService;

  beforeEach(() => {
    service = new VisualRegressionService();
  });

  const createTestPngBase64 = (
    color: { r: number; g: number; b: number },
    width = 10,
    height = 10
  ) => {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = color.r;
        png.data[idx + 1] = color.g;
        png.data[idx + 2] = color.b;
        png.data[idx + 3] = 255;
      }
    }
    const buffer = PNG.sync.write(png);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  };

  it('should return 100% similarity for identical images', async () => {
    const base64 = createTestPngBase64({ r: 255, g: 0, b: 0 }); // Red
    const result = await service.compareSnapshots(base64, base64);

    expect(result.similarity).toBe(1);
    expect(result.isMatch).toBe(true);
    expect(result.numDiffPixels).toBe(0);
  });

  it('should detect differences between different images', async () => {
    const red = createTestPngBase64({ r: 255, g: 0, b: 0 });
    const blue = createTestPngBase64({ r: 0, g: 0, b: 255 });

    const result = await service.compareSnapshots(red, blue);

    expect(result.similarity).toBe(0);
    expect(result.isMatch).toBe(false);
    expect(result.numDiffPixels).toBe(100); // 10x10
  });

  it('should throw error for dimension mismatch', async () => {
    const small = createTestPngBase64({ r: 255, g: 0, b: 0 }, 10, 10);
    const large = createTestPngBase64({ r: 255, g: 0, b: 0 }, 20, 20);

    await expect(service.compareSnapshots(small, large)).rejects.toThrow('Dimension mismatch');
  });

  it('should generate a diff image if requested', async () => {
    const red = createTestPngBase64({ r: 255, g: 0, b: 0 });
    const blue = createTestPngBase64({ r: 0, g: 0, b: 255 });

    const result = await service.compareSnapshots(red, blue, { includeDiffImage: true });

    expect(result.diffImage).toBeDefined();
    expect(result.diffImage).toContain('data:image/png;base64,');
  });
});
