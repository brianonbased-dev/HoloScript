/**
 * TextureProcessor — Resize, format conversion, mipmap, atlas packing
 *
 * @version 1.0.0
 */

export type TextureFormat = 'rgba8' | 'rgb8' | 'bc1' | 'bc3' | 'bc7' | 'astc' | 'etc2';

export interface TextureInput {
  id: string;
  name: string;
  width: number;
  height: number;
  format: TextureFormat;
  sizeBytes: number;
}

export interface ProcessedTexture {
  id: string;
  name: string;
  width: number;
  height: number;
  format: TextureFormat;
  mipmapLevels: number;
  sizeBytes: number;
  compressionRatio: number;
}

export interface AtlasResult {
  width: number;
  height: number;
  entries: { id: string; x: number; y: number; w: number; h: number }[];
  utilization: number;
}

export class TextureProcessor {
  private maxSize: number;
  private generateMipmaps: boolean;
  private targetFormat: TextureFormat;

  constructor(opts?: {
    maxSize?: number;
    generateMipmaps?: boolean;
    targetFormat?: TextureFormat;
  }) {
    this.maxSize = opts?.maxSize ?? 4096;
    this.generateMipmaps = opts?.generateMipmaps ?? true;
    this.targetFormat = opts?.targetFormat ?? 'rgba8';
  }

  /**
   * Process a texture (resize, compress, mipmaps)
   */
  process(input: TextureInput): ProcessedTexture {
    let w = Math.min(input.width, this.maxSize);
    let h = Math.min(input.height, this.maxSize);

    // Power-of-two resize
    w = this.nearestPow2(w);
    h = this.nearestPow2(h);

    const mipmapLevels = this.generateMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    const compressionRatio = this.getCompressionRatio(this.targetFormat);
    const baseSize = w * h * 4; // RGBA
    const mipmapMultiplier = this.generateMipmaps ? 1.333 : 1;
    const sizeBytes = Math.ceil(baseSize * compressionRatio * mipmapMultiplier);

    return {
      id: input.id,
      name: input.name,
      width: w,
      height: h,
      format: this.targetFormat,
      mipmapLevels,
      sizeBytes,
      compressionRatio,
    };
  }

  /**
   * Pack textures into an atlas
   */
  packAtlas(textures: TextureInput[], atlasSize: number = 2048): AtlasResult {
    const entries: AtlasResult['entries'] = [];
    let currentX = 0,
      currentY = 0,
      rowHeight = 0;
    let usedPixels = 0;

    for (const tex of textures) {
      const w = Math.min(tex.width, atlasSize);
      const h = Math.min(tex.height, atlasSize);

      if (currentX + w > atlasSize) {
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }
      if (currentY + h > atlasSize) break; // atlas full

      entries.push({ id: tex.id, x: currentX, y: currentY, w, h });
      currentX += w;
      rowHeight = Math.max(rowHeight, h);
      usedPixels += w * h;
    }

    return {
      width: atlasSize,
      height: atlasSize,
      entries,
      utilization: usedPixels / (atlasSize * atlasSize),
    };
  }

  private nearestPow2(n: number): number {
    return Math.pow(2, Math.round(Math.log2(n)));
  }

  private getCompressionRatio(format: TextureFormat): number {
    switch (format) {
      case 'bc1':
        return 0.125;
      case 'bc3':
      case 'bc7':
        return 0.25;
      case 'astc':
      case 'etc2':
        return 0.25;
      case 'rgb8':
        return 0.75;
      case 'rgba8':
      default:
        return 1;
    }
  }

  getMaxSize(): number {
    return this.maxSize;
  }
  getTargetFormat(): TextureFormat {
    return this.targetFormat;
  }
}
