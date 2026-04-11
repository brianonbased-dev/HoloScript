/**
 * TerrainSystem.ts
 *
 * Heightmap-based terrain with procedural generation,
 * LOD meshing, and physics collision support.
 *
 * @module environment
 */

import { IVector3 } from '../physics/PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface TerrainConfig {
  id: string;
  width: number; // World units
  depth: number; // World units
  resolution: number; // Vertices per side (power of 2 + 1, e.g. 129, 257)
  maxHeight: number; // Maximum elevation
  position: IVector3; // World origin of terrain
}

export interface TerrainLayer {
  id: string;
  texture: string; // Texture asset name
  tiling: number; // UV tiling factor
  minHeight: number; // Blend start height (normalized 0-1)
  maxHeight: number; // Blend end height (normalized 0-1)
  minSlope: number; // Blend start slope (0-1, 0 = flat)
  maxSlope: number; // Blend end slope (0-1, 1 = vertical)
}

export interface TerrainVertex {
  position: IVector3;
  normal: IVector3;
  uv: { u: number; v: number };
  height: number; // Normalized 0-1
}

export interface TerrainChunk {
  x: number;
  z: number;
  lod: number;
  vertices: TerrainVertex[];
  indices: number[];
}

export interface TerrainCollider {
  getHeightAt(worldX: number, worldZ: number): number;
  getNormalAt(worldX: number, worldZ: number): IVector3;
}

// =============================================================================
// NOISE UTILITIES (Simplex-like for terrain generation)
// =============================================================================

function hash2D(x: number, y: number): number {
  let n = (x * 73856093) ^ (y * 19349663);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const sx = smoothstep(fx);
  const sy = smoothstep(fy);

  const n00 = hash2D(ix, iy);
  const n10 = hash2D(ix + 1, iy);
  const n01 = hash2D(ix, iy + 1);
  const n11 = hash2D(ix + 1, iy + 1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// =============================================================================
// TERRAIN SYSTEM
// =============================================================================

export class TerrainSystem {
  private terrains: Map<
    string,
    {
      config: TerrainConfig;
      heightmap: Float32Array;
      layers: TerrainLayer[];
      chunks: TerrainChunk[];
    }
  > = new Map();

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  /**
   * Create a terrain with a procedurally generated heightmap.
   */
  createTerrain(
    config: TerrainConfig,
    options: {
      octaves?: number;
      lacunarity?: number;
      gain?: number;
      seed?: number;
      scale?: number;
    } = {}
  ): string {
    const { octaves = 6, lacunarity = 2.0, gain = 0.5, seed = 42, scale = 0.02 } = options;

    const res = config.resolution;
    const heightmap = new Float32Array(res * res);

    // Generate heightmap using FBM
    for (let z = 0; z < res; z++) {
      for (let x = 0; x < res; x++) {
        const nx = (x + seed) * scale;
        const nz = (z + seed * 0.7) * scale;
        heightmap[z * res + x] = fbm(nx, nz, octaves, lacunarity, gain);
      }
    }

    // Generate chunks
    const chunks = this.generateChunks(config, heightmap, 0);

    this.terrains.set(config.id, {
      config,
      heightmap,
      layers: this.getDefaultLayers(),
      chunks,
    });

    return config.id;
  }

  /**
   * Create terrain from an existing heightmap array.
   */
  createFromHeightmap(config: TerrainConfig, heightmap: Float32Array): string {
    const chunks = this.generateChunks(config, heightmap, 0);
    this.terrains.set(config.id, {
      config,
      heightmap,
      layers: this.getDefaultLayers(),
      chunks,
    });
    return config.id;
  }

  // ---------------------------------------------------------------------------
  // Heightmap Access
  // ---------------------------------------------------------------------------

  /**
   * Get height at a world position (bilinear interpolation).
   */
  getHeightAt(terrainId: string, worldX: number, worldZ: number): number {
    const terrain = this.terrains.get(terrainId);
    if (!terrain) return 0;

    const { config, heightmap } = terrain;
    const res = config.resolution;

    // World to heightmap coords
    const localX = (worldX - config.position.x) / config.width;
    const localZ = (worldZ - config.position.z) / config.depth;

    if (localX < 0 || localX > 1 || localZ < 0 || localZ > 1) return 0;

    const gx = localX * (res - 1);
    const gz = localZ * (res - 1);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;

    const ix1 = Math.min(ix + 1, res - 1);
    const iz1 = Math.min(iz + 1, res - 1);

    // Bilinear interpolation
    const h00 = heightmap[iz * res + ix];
    const h10 = heightmap[iz * res + ix1];
    const h01 = heightmap[iz1 * res + ix];
    const h11 = heightmap[iz1 * res + ix1];

    const h = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;

    return config.position.y + h * config.maxHeight;
  }

  /**
   * Get surface normal at a world position (finite differences).
   */
  getNormalAt(terrainId: string, worldX: number, worldZ: number): IVector3 {
    const epsilon = 0.5;
    const hL = this.getHeightAt(terrainId, worldX - epsilon, worldZ);
    const hR = this.getHeightAt(terrainId, worldX + epsilon, worldZ);
    const hD = this.getHeightAt(terrainId, worldX, worldZ - epsilon);
    const hU = this.getHeightAt(terrainId, worldX, worldZ + epsilon);

    const nx = hL - hR;
    const nz = hD - hU;
    const ny = 2 * epsilon;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /**
   * Set height at a specific grid position.
   */
  setHeightAt(terrainId: string, gridX: number, gridZ: number, height: number): void {
    const terrain = this.terrains.get(terrainId);
    if (!terrain) return;
    const res = terrain.config.resolution;
    if (gridX < 0 || gridX >= res || gridZ < 0 || gridZ >= res) return;
    terrain.heightmap[gridZ * res + gridX] = Math.max(0, Math.min(1, height));
  }

  /**
   * Get the collider interface for a terrain.
   */
  getCollider(terrainId: string): TerrainCollider | null {
    if (!this.terrains.has(terrainId)) return null;
    return {
      getHeightAt: (x, z) => this.getHeightAt(terrainId, x, z),
      getNormalAt: (x, z) => this.getNormalAt(terrainId, x, z),
    };
  }

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  setLayers(terrainId: string, layers: TerrainLayer[]): void {
    const terrain = this.terrains.get(terrainId);
    if (terrain) terrain.layers = layers;
  }

  getLayers(terrainId: string): TerrainLayer[] {
    return this.terrains.get(terrainId)?.layers || [];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTerrain(id: string) {
    return this.terrains.get(id);
  }
  getTerrainIds(): string[] {
    return [...this.terrains.keys()];
  }
  removeTerrain(id: string): boolean {
    return this.terrains.delete(id);
  }

  getChunks(terrainId: string): TerrainChunk[] {
    return this.terrains.get(terrainId)?.chunks || [];
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private generateChunks(
    config: TerrainConfig,
    heightmap: Float32Array,
    lod: number
  ): TerrainChunk[] {
    const res = config.resolution;
    const chunkSize = 32;
    const step = 1 << lod; // LOD step size
    const chunks: TerrainChunk[] = [];

    for (let cz = 0; cz < res - 1; cz += chunkSize) {
      for (let cx = 0; cx < res - 1; cx += chunkSize) {
        const vertices: TerrainVertex[] = [];
        const indices: number[] = [];
        const _vertexIndex = 0;

        const endX = Math.min(cx + chunkSize, res - 1);
        const endZ = Math.min(cz + chunkSize, res - 1);

        for (let z = cz; z <= endZ; z += step) {
          for (let x = cx; x <= endX; x += step) {
            const h = heightmap[z * res + x];
            const worldX = config.position.x + (x / (res - 1)) * config.width;
            const worldZ = config.position.z + (z / (res - 1)) * config.depth;
            const worldY = config.position.y + h * config.maxHeight;

            vertices.push({
              position: { x: worldX, y: worldY, z: worldZ },
              normal: { x: 0, y: 1, z: 0 }, // Simplified; real normals computed post-pass
              uv: { u: x / (res - 1), v: z / (res - 1) },
              height: h,
            });
          }
        }

        // Generate triangle indices
        const rowVerts = Math.ceil((endX - cx) / step) + 1;
        const colVerts = Math.ceil((endZ - cz) / step) + 1;

        for (let row = 0; row < colVerts - 1; row++) {
          for (let col = 0; col < rowVerts - 1; col++) {
            const tl = row * rowVerts + col;
            const tr = tl + 1;
            const bl = (row + 1) * rowVerts + col;
            const br = bl + 1;

            indices.push(tl, bl, tr);
            indices.push(tr, bl, br);
          }
        }

        chunks.push({
          x: cx,
          z: cz,
          lod,
          vertices,
          indices,
        });
      }
    }

    return chunks;
  }

  private getDefaultLayers(): TerrainLayer[] {
    return [
      {
        id: 'sand',
        texture: 'terrain_sand',
        tiling: 20,
        minHeight: 0,
        maxHeight: 0.15,
        minSlope: 0,
        maxSlope: 0.3,
      },
      {
        id: 'grass',
        texture: 'terrain_grass',
        tiling: 15,
        minHeight: 0.1,
        maxHeight: 0.6,
        minSlope: 0,
        maxSlope: 0.6,
      },
      {
        id: 'rock',
        texture: 'terrain_rock',
        tiling: 10,
        minHeight: 0.4,
        maxHeight: 0.9,
        minSlope: 0.5,
        maxSlope: 1.0,
      },
      {
        id: 'snow',
        texture: 'terrain_snow',
        tiling: 12,
        minHeight: 0.8,
        maxHeight: 1.0,
        minSlope: 0,
        maxSlope: 0.4,
      },
    ];
  }
}
