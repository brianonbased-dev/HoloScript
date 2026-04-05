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
  traits?: Array<{ name: string; config?: Record<string, any> }>;
  properties: Array<{ key: string; value: any }>;
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
  /** R3F/Three.js code for rendering the quilt */
  rendererCode: string;
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
        if (typeof p['views'] === 'number') config.views = p['views'];
        if (typeof p['columns'] === 'number') config.columns = p['columns'];
        if (typeof p['rows'] === 'number') config.rows = p['rows'];
        if (Array.isArray(p['resolution'])) config.resolution = p['resolution'] as [number, number];
        if (typeof p['baseline'] === 'number') config.baseline = p['baseline'];
        if (typeof p['device'] === 'string' && p['device'] in DEVICE_PRESETS) {
          config = {
            ...config,
            ...DEVICE_PRESETS[p['device']],
            device: p['device'] as QuiltConfig['device'],
          };
        }
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
   * Generate R3F/Three.js renderer code for the quilt camera rig.
   */
  private generateRendererCode(
    composition: HoloComposition,
    config: QuiltConfig,
    tiles: QuiltTile[]
  ): string {
    const tileW = Math.floor(config.resolution[0] / config.columns);
    const tileH = Math.floor(config.resolution[1] / config.rows);

    const sceneObjects = composition.objects.map((obj) => this.objectToJSX(obj)).join('\n      ');

    return `// QuiltCompiler output — ${config.views} views for ${config.device} Looking Glass
// Tile grid: ${config.columns}x${config.rows} @ ${tileW}x${tileH}px each
// Total resolution: ${config.resolution[0]}x${config.resolution[1]}

import { useRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const QUILT_CONFIG = ${JSON.stringify(config, null, 2)};

const TILES = ${JSON.stringify(
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

function QuiltCamera({ tileIndex, children }) {
  const { gl, size } = useThree();
  const cameraRef = useRef();
  const tile = TILES[tileIndex];

  useFrame(() => {
    if (!cameraRef.current) return;
    const cam = cameraRef.current;
    cam.position.x = tile.offset;
    cam.projectionMatrix.elements[8] = tile.shear;
    cam.updateProjectionMatrix();
  });

  return (
    <perspectiveCamera ref={cameraRef} fov={14} near={0.1} far={100}>
      {children}
    </perspectiveCamera>
  );
}

function QuiltScene() {
  return (
    <group>
      ${sceneObjects}
    </group>
  );
}

export function QuiltRenderer() {
  const tileW = ${tileW};
  const tileH = ${tileH};
  const renderTarget = useMemo(() =>
    new THREE.WebGLRenderTarget(${config.resolution[0]}, ${config.resolution[1]}),
    []
  );

  return (
    <Canvas gl={{ preserveDrawingBuffer: true }}>
      <QuiltScene />
    </Canvas>
  );
}
`;
  }

  /**
   * Convert a HoloScript object to JSX for the quilt scene.
   */
  private objectToJSX(obj: HoloObjectDecl): string {
    const getProp = (key: string) => obj.properties.find(p => p.key === key)?.value;
    const pos = getProp('position');
    const rot = getProp('rotation');
    const scale = getProp('scale');
    const color = getProp('color') ?? '#888888';
    const geo = getProp('geometry') ?? 'box';

    const posStr = Array.isArray(pos) ? `[${pos.join(', ')}]` : '[0, 0, 0]';
    const rotStr = Array.isArray(rot)
      ? `[${rot.map((r: any) => (Number(r) * Math.PI) / 180).join(', ')}]`
      : undefined;
    const scaleStr = Array.isArray(scale) ? `[${scale.join(', ')}]` : undefined;

    const geoMap: Record<string, string> = {
      box: 'boxGeometry',
      sphere: 'sphereGeometry',
      cylinder: 'cylinderGeometry',
      torus: 'torusGeometry',
      plane: 'planeGeometry',
    };

    const geoTag = geoMap[geo as string] ?? 'boxGeometry';

    return `<mesh position={${posStr}}${rotStr ? ` rotation={${rotStr}}` : ''}${scaleStr ? ` scale={${scaleStr}}` : ''}>
        <${geoTag} />
        <meshStandardMaterial color="${color}" />
      </mesh>`;
  }
}

