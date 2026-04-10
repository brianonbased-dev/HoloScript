import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface VisualComparisonResult {
  similarity: number;
  isMatch: boolean;
  diffImage?: string; // base64
  numDiffPixels: number;
}

export class VisualRegressionService {
  /**
   * Compare two base64 encoded PNG snapshots
   */
  public async compareSnapshots(
    base: string,
    current: string,
    options: { threshold?: number; includeDiffImage?: boolean } = {}
  ): Promise<VisualComparisonResult> {
    const threshold = options.threshold ?? 0.1;

    const basePng = this.decodeBase64Png(base);
    const currentPng = this.decodeBase64Png(current);

    const { width, height } = basePng;

    if (width !== currentPng.width || height !== currentPng.height) {
      throw new Error(
        `Dimension mismatch: base is ${width}x${height}, current is ${currentPng.width}x${currentPng.height}`
      );
    }

    const diffPng = new PNG({ width, height });

    const numDiffPixels = pixelmatch(basePng.data, currentPng.data, diffPng.data, width, height, {
      threshold,
    });

    const totalPixels = width * height;
    const similarity = 1 - numDiffPixels / totalPixels;
    const isMatch = numDiffPixels === 0;

    let diffImage: string | undefined;
    if (options.includeDiffImage) {
      diffImage = this.encodePngToBase64(diffPng);
    }

    return {
      similarity,
      isMatch,
      diffImage,
      numDiffPixels,
    };
  }

  private decodeBase64Png(base64: string): PNG {
    const cleanBase64 = base64.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return PNG.sync.read(buffer);
  }

  private encodePngToBase64(png: PNG): string {
    const buffer = PNG.sync.write(png);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}

export function createVisualRegressionService(): VisualRegressionService {
  return new VisualRegressionService();
}
