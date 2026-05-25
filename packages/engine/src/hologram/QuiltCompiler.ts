/**
 * QuiltCompiler — Generates multi-view quilt images for Looking Glass displays.
 *
 * Compiles HoloScript scenes to quilt format: a tile grid of 45-100 views
 * stored in a single image. Each tile is rendered from a different camera
 * position along a horizontal baseline using view shearing (asymmetric frustum)
 * to prevent toe-in artifacts.
 *
 * @see W.151: Quilt format is the interchange standard for holographic images
 * @see P.151.01: Multi-View Camera Rig pattern
 * @see G.153.01: Inpainting Seams in Quilt Views
 */

export interface HoloObjectDecl {
  traits?: Array<{ name: string; config?: Record<string, unknown> }>;
  properties: Array<{ key: string; value: unknown }>;
}

export interface HoloComposition {
  name?: string;
  objects: HoloObjectDecl[];
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuiltConfig {
  /** Number of views in the quilt. Default: 48 */
  views: number;
  /** Number of columns in the tile grid. Default: 8 */
  columns: number;
  /** Number of rows in the tile grid. Default: 6 */
  rows: number;
  /** Resolution of the full quilt image [width, height]. Default: [3360, 3360] */
  resolution: [number, number];
  /** Total camera baseline in scene units (horizontal offset range). Default: 0.06 */
  baseline: number;
  /** Target Looking Glass device. Default: '16inch' */
  device: 'go' | '16inch' | '27inch' | '65inch';
  /** Focus distance from camera rig center. Default: 2.0 */
  focusDistance: number;
}

export interface QuiltTile {
  /** View index (0 = leftmost, N-1 = rightmost) */
  index: number;
  /** Column position in tile grid */
  column: number;
  /** Row position in tile grid */
  row: number;
  /** Camera offset from center along horizontal baseline */
  cameraOffset: number;
  /** View shear amount for asymmetric frustum */
  viewShear: number;
}

export interface QuiltCompilationResult {
  /** Quilt configuration used */
  config: QuiltConfig;
  /** Per-tile camera parameters for rendering */
  tiles: QuiltTile[];
  /** Browser delegate code for rendering the quilt through BrowserQuiltRenderer */
  rendererCode: string;
  /** Runtime that owns the actual per-tile render loop. */
  rendererRuntime: 'BrowserQuiltRenderer';
  /** Metadata for Looking Glass Bridge SDK */
  metadata: {
    quiltAspect: number;
    tileWidth: number;
    tileHeight: number;
    numViews: number;
  };
}

// ── Device Presets ───────────────────────────────────────────────────────────

const DEVICE_PRESETS: Record<string, Partial<QuiltConfig>> = {
  go: {
    views: 48,
    columns: 8,
    rows: 6,
    resolution: [3360, 3360],
    baseline: 0.04,
  },
  '16inch': {
    views: 48,
    columns: 8,
    rows: 6,
    resolution: [3360, 3360],
    baseline: 0.06,
  },
  '27inch': {
    views: 48,
    columns: 8,
    rows: 6,
    resolution: [4096, 4096],
    baseline: 0.08,
  },
  '65inch': {
    views: 100,
    columns: 10,
    rows: 10,
    resolution: [8192, 8192],
    baseline: 0.1,
  },
};

const DEFAULT_CONFIG: QuiltConfig = {
  views: 48,
  columns: 8,
  rows: 6,
  resolution: [3360, 3360],
  baseline: 0.06,
  device: '16inch',
  focusDistance: 2.0,
};

// ── Compiler ─────────────────────────────────────────────────────────────────

export class QuiltCompiler {
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    void agentToken;
    void outputPath;

    const quiltResult = this.compileQuilt(composition);
    return quiltResult.rendererCode;
  }

  /**
   * Compile a HoloComposition to full quilt output with tile parameters.
   */
  compileQuilt(
    composition: HoloComposition,
    overrides?: Partial<QuiltConfig>
  ): QuiltCompilationResult {
    // Extract quilt config from composition traits or use defaults
    const config = this.resolveConfig(composition, overrides);
    const tiles = this.generateTiles(config);
    const rendererCode = this.generateRendererCode(composition, config, tiles);
    const tileWidth = Math.floor(config.resolution[0] / config.columns);
    const tileHeight = Math.floor(config.resolution[1] / config.rows);

    return {
      config,
      tiles,
      rendererCode,
      rendererRuntime: 'BrowserQuiltRenderer',
      metadata: {
        quiltAspect: config.resolution[0] / config.resolution[1],
        tileWidth,
        tileHeight,
        numViews: config.views,
      },
    };
  }

  /**
   * Resolve quilt configuration from composition @quilt trait and device presets.
   */
  private resolveConfig(
    composition: HoloComposition,
    overrides?: Partial<QuiltConfig>
  ): QuiltConfig {
    let config = { ...DEFAULT_CONFIG };

    // Look for @quilt trait in composition objects
    for (const obj of composition.objects) {
      const quiltTrait = obj.traits?.find((t) => t.name === 'quilt');
      if (quiltTrait?.config) {
        const p = quiltTrait.config;
        const explicit: Partial<QuiltConfig> = {};
        if (typeof p['views'] === 'number') explicit.views = p['views'];
        if (typeof p['columns'] === 'number') explicit.columns = p['columns'];
        if (typeof p['rows'] === 'number') explicit.rows = p['rows'];
        if (Array.isArray(p['resolution']))
          explicit.resolution = p['resolution'] as [number, number];
        if (typeof p['baseline'] === 'number') explicit.baseline = p['baseline'];
        if (typeof p['device'] === 'string' && p['device'] in DEVICE_PRESETS) {
          config = {
            ...config,
            ...DEVICE_PRESETS[p['device']],
            device: p['device'] as QuiltConfig['device'],
          };
        }
        Object.assign(config, explicit);
      }

      const lgTrait = obj.traits?.find((t) => t.name === 'looking_glass');
      if (lgTrait?.config) {
        const device = lgTrait.config['device'] as string;
        if (device && device in DEVICE_PRESETS) {
          config = {
            ...config,
            ...DEVICE_PRESETS[device],
            device: device as QuiltConfig['device'],
          };
        }
      }
    }

    if (overrides) {
      Object.assign(config, overrides);
    }

    return config;
  }

  /**
   * Generate tile parameters for the camera rig.
   * Uses view shearing (asymmetric frustum) instead of camera rotation
   * to prevent toe-in artifacts.
   *
   * @see P.151.01: Multi-View Camera Rig pattern
   */
  generateTiles(config: QuiltConfig): QuiltTile[] {
    const tiles: QuiltTile[] = [];
    const halfBaseline = config.baseline / 2;

    for (let i = 0; i < config.views; i++) {
      // Linear interpolation: leftmost view (i=0) to rightmost (i=N-1)
      const t = config.views > 1 ? i / (config.views - 1) : 0.5;
      const cameraOffset = -halfBaseline + t * config.baseline;

      // View shearing: shift the frustum to converge at focus distance
      const viewShear = -cameraOffset / config.focusDistance;

      tiles.push({
        index: i,
        column: i % config.columns,
        row: Math.floor(i / config.columns),
        cameraOffset,
        viewShear,
      });
    }

    return tiles;
  }

  /**
   * Generate browser delegate code for the real quilt renderer.
   */
  private generateRendererCode(
    composition: HoloComposition,
    config: QuiltConfig,
    tiles: QuiltTile[]
  ): string {
    const tileW = Math.floor(config.resolution[0] / config.columns);
    const tileH = Math.floor(config.resolution[1] / config.rows);

    return `// QuiltCompiler output — ${config.views} views for ${config.device} Looking Glass
// Renderer delegate: BrowserQuiltRenderer owns the real per-tile camera/render loop.
// Tile grid: ${config.columns}x${config.rows} @ ${tileW}x${tileH}px each
// Total resolution: ${config.resolution[0]}x${config.resolution[1]}

import {
  BrowserQuiltRenderer,
  type HologramSourceKind,
  type QuiltConfig,
} from '@holoscript/engine/hologram';

export const QUILT_CONFIG = ${JSON.stringify(config, null, 2)} satisfies QuiltConfig;

export const TILES = ${JSON.stringify(
      tiles.map((t) => ({
        index: t.index,
        col: t.column,
        row: t.row,
        offset: Math.round(t.cameraOffset * 10000) / 10000,
        shear: Math.round(t.viewShear * 10000) / 10000,
      })),
      null,
      2
    )};

export const HOLOGRAM_COMPOSITION = ${JSON.stringify(composition, null, 2)};

export async function renderQuiltBytes(input: {
  depthMap: Float32Array;
  normalMap: Float32Array;
  width: number;
  height: number;
  media: Uint8Array;
  sourceKind: HologramSourceKind;
  frames?: number;
}): Promise<Uint8Array> {
  const renderer = new BrowserQuiltRenderer({
    composition: HOLOGRAM_COMPOSITION,
    overrides: QUILT_CONFIG,
    path: 'auto',
  });

  return renderer.render({
    ...input,
    frames: input.frames ?? 1,
  });
}
`;
  }
}
