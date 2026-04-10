import type { TraitVisualConfig } from '../types';
import type { AssetResolverPlugin, ResolvedAsset } from './types';

/**
 * Traits that map to procedural texture generation.
 * Keys are trait names, values are generation parameters.
 */
const PROCEDURAL_TRAITS: Record<string, { type: string; params: Record<string, number> }> = {
  wooden: { type: 'wood_grain', params: { rings: 8, turbulence: 0.3, scale: 4 } },
  marble_material: { type: 'marble_vein', params: { veins: 5, turbulence: 0.5, scale: 3 } },
  granite: { type: 'speckle', params: { density: 0.7, scale: 8, contrast: 0.6 } },
  sandstone: { type: 'layered_noise', params: { layers: 6, scale: 4, erosion: 0.3 } },
  brick: { type: 'brick_pattern', params: { rows: 8, cols: 4, mortar: 0.05 } },
  mossy: { type: 'organic_noise', params: { scale: 6, coverage: 0.4, falloff: 0.3 } },
  crystallized: { type: 'voronoi', params: { cells: 20, border: 0.02, jitter: 0.8 } },
  rusted: { type: 'rust_spots', params: { coverage: 0.4, scale: 5, roughness: 0.8 } },
  cracked: { type: 'crack_pattern', params: { density: 0.3, width: 0.01, depth: 0.5 } },
  woven: { type: 'weave_pattern', params: { threads: 16, gap: 0.02, scale: 4 } },
};

/**
 * Procedural texture resolver.
 *
 * Generates noise-based textures for traits that map to natural
 * patterns (wood grain, marble veins, rust spots, etc.).
 * Uses simple noise functions — no external dependencies.
 */
export class ProceduralResolver implements AssetResolverPlugin {
  readonly name = 'procedural';
  readonly priority = 10; // Mid-priority (after cache, before AI)

  canResolve(trait: string, _config: TraitVisualConfig): boolean {
    return trait in PROCEDURAL_TRAITS;
  }

  async resolve(trait: string, _config: TraitVisualConfig): Promise<ResolvedAsset> {
    const spec = PROCEDURAL_TRAITS[trait];
    if (!spec) {
      throw new Error(`ProceduralResolver: no spec for trait "${trait}"`);
    }

    // Generate a simple noise-based texture
    const size = 256;
    const data = this.generateTexture(spec.type, spec.params, size);

    return {
      type: 'texture',
      data,
      metadata: {
        generator: 'procedural',
        pattern: spec.type,
        width: size,
        height: size,
        format: 'rgba8',
      },
    };
  }

  /** Generate RGBA texture data from noise parameters. */
  private generateTexture(type: string, params: Record<string, number>, size: number): ArrayBuffer {
    const pixels = new Uint8Array(size * size * 4);
    const scale = params.scale ?? 4;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = (x / size) * scale;
        const ny = (y / size) * scale;

        let value: number;
        switch (type) {
          case 'wood_grain':
            value = this.woodGrain(nx, ny, params.rings ?? 8, params.turbulence ?? 0.3);
            break;
          case 'marble_vein':
            value = this.marbleVein(nx, ny, params.veins ?? 5, params.turbulence ?? 0.5);
            break;
          case 'voronoi':
            value = this.voronoi(nx, ny, params.cells ?? 20, params.jitter ?? 0.8);
            break;
          default:
            value = this.simpleNoise(nx, ny);
            break;
        }

        // Map value [0,1] to grayscale RGBA
        const byte = Math.max(0, Math.min(255, Math.floor(value * 255)));
        pixels[idx] = byte;
        pixels[idx + 1] = byte;
        pixels[idx + 2] = byte;
        pixels[idx + 3] = 255;
      }
    }

    return pixels.buffer;
  }

  /** Simple hash-based noise (deterministic, no dependencies). */
  private simpleNoise(x: number, y: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /** Wood grain ring pattern. */
  private woodGrain(x: number, y: number, rings: number, turbulence: number): number {
    const dist = Math.sqrt(x * x + y * y);
    const noise = this.simpleNoise(x * 2, y * 2) * turbulence;
    const ring = Math.sin((dist + noise) * rings * Math.PI);
    return ring * 0.5 + 0.5;
  }

  /** Marble vein pattern. */
  private marbleVein(x: number, y: number, veins: number, turbulence: number): number {
    const noise = this.simpleNoise(x * 3, y * 3) * turbulence;
    const vein = Math.sin((x + noise) * veins * Math.PI);
    return Math.abs(vein);
  }

  /** Voronoi cell pattern. */
  private voronoi(x: number, y: number, cells: number, jitter: number): number {
    let minDist = Infinity;
    const cellSize = 1 / Math.sqrt(cells);

    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cx + dx;
        const ny = cy + dy;
        const px = (nx + 0.5 + this.simpleNoise(nx, ny) * jitter) * cellSize;
        const py = (ny + 0.5 + this.simpleNoise(ny, nx) * jitter) * cellSize;
        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        minDist = Math.min(minDist, dist);
      }
    }

    return Math.min(1, minDist / cellSize);
  }
}
