/**
 * TerrainLOD.ts
 *
 * Quadtree-based terrain LOD: distance-based chunking,
 * seamless stitching, morph factors, and streaming.
 *
 * @module terrain
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TerrainChunk {
  id: string;
  level: number; // LOD level (0 = highest detail)
  x: number; // Grid position
  z: number;
  size: number; // World space size
  resolution: number; // Vertices per side at this LOD
  heightData: Float32Array;
  morphFactor: number; // 0-1, blending between LOD levels
  active: boolean;
  children: string[]; // Child chunk IDs (quadtree)
}

export interface TerrainLODConfig {
  totalSize: number;
  maxLOD: number; // Number of LOD levels
  baseResolution: number; // Vertices per side at LOD 0
  lodDistances: number[]; // Distance thresholds per level
  morphRange: number; // Transition zone as fraction of distance
}

// =============================================================================
// TERRAIN LOD
// =============================================================================

let _chunkId = 0;

export class TerrainLOD {
  private config: TerrainLODConfig;
  private chunks: Map<string, TerrainChunk> = new Map();
  private activeChunks: Set<string> = new Set();

  constructor(config?: Partial<TerrainLODConfig>) {
    this.config = {
      totalSize: 1024,
      maxLOD: 4,
      baseResolution: 64,
      lodDistances: [100, 250, 500, 1000],
      morphRange: 0.2,
      ...config,
    };
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generateQuadtree(heightSampler: (x: number, z: number) => number): void {
    this.chunks.clear();
    this.activeChunks.clear();
    this.subdivide(0, 0, this.config.totalSize, 0, heightSampler);
  }

  private subdivide(
    x: number,
    z: number,
    size: number,
    level: number,
    sampler: (x: number, z: number) => number
  ): string {
    const resolution = Math.max(4, this.config.baseResolution >> level);
    const heightData = new Float32Array(resolution * resolution);

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const wx = x + (col / (resolution - 1)) * size;
        const wz = z + (row / (resolution - 1)) * size;
        heightData[row * resolution + col] = sampler(wx, wz);
      }
    }

    const chunk: TerrainChunk = {
      id: `chunk_${_chunkId++}`,
      level,
      x,
      z,
      size,
      resolution,
      heightData,
      morphFactor: 0,
      active: true,
      children: [],
    };

    this.chunks.set(chunk.id, chunk);

    // Subdivide if not at max LOD
    if (level < this.config.maxLOD - 1) {
      const half = size / 2;
      chunk.children = [
        this.subdivide(x, z, half, level + 1, sampler),
        this.subdivide(x + half, z, half, level + 1, sampler),
        this.subdivide(x, z + half, half, level + 1, sampler),
        this.subdivide(x + half, z + half, half, level + 1, sampler),
      ];
    }

    return chunk.id;
  }

  // ---------------------------------------------------------------------------
  // LOD Selection
  // ---------------------------------------------------------------------------

  selectLOD(cameraX: number, cameraZ: number): void {
    this.activeChunks.clear();

    for (const chunk of this.chunks.values()) {
      const cx = chunk.x + chunk.size / 2;
      const cz = chunk.z + chunk.size / 2;
      const dx = cx - cameraX;
      const dz = cz - cameraZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      const threshold = this.config.lodDistances[chunk.level] ?? Infinity;
      const morphStart = threshold * (1 - this.config.morphRange);

      if (dist < threshold) {
        chunk.active = true;
        chunk.morphFactor = dist > morphStart ? (dist - morphStart) / (threshold - morphStart) : 0;
        this.activeChunks.add(chunk.id);
      } else {
        chunk.active = false;
        chunk.morphFactor = 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stitching
  // ---------------------------------------------------------------------------

  getStitchEdges(chunkId: string): {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  } {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) return { north: false, south: false, east: false, west: false };

    const result = { north: false, south: false, east: false, west: false };

    for (const other of this.chunks.values()) {
      if (other.id === chunkId || !other.active || other.level === chunk.level) continue;

      // Check adjacency
      if (Math.abs(other.z + other.size - chunk.z) < 0.1 && this.overlapsX(chunk, other))
        result.north = true;
      if (Math.abs(chunk.z + chunk.size - other.z) < 0.1 && this.overlapsX(chunk, other))
        result.south = true;
      if (Math.abs(other.x + other.size - chunk.x) < 0.1 && this.overlapsZ(chunk, other))
        result.west = true;
      if (Math.abs(chunk.x + chunk.size - other.x) < 0.1 && this.overlapsZ(chunk, other))
        result.east = true;
    }

    return result;
  }

  private overlapsX(a: TerrainChunk, b: TerrainChunk): boolean {
    return a.x < b.x + b.size && a.x + a.size > b.x;
  }

  private overlapsZ(a: TerrainChunk, b: TerrainChunk): boolean {
    return a.z < b.z + b.size && a.z + a.size > b.z;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getChunk(id: string): TerrainChunk | undefined {
    return this.chunks.get(id);
  }
  getActiveChunks(): TerrainChunk[] {
    return [...this.chunks.values()].filter((c) => c.active);
  }
  getActiveChunkCount(): number {
    return this.activeChunks.size;
  }
  getTotalChunkCount(): number {
    return this.chunks.size;
  }

  sampleHeight(x: number, z: number): number {
    for (const chunk of this.chunks.values()) {
      if (!chunk.active) continue;
      if (x >= chunk.x && x < chunk.x + chunk.size && z >= chunk.z && z < chunk.z + chunk.size) {
        const lx = (x - chunk.x) / chunk.size;
        const lz = (z - chunk.z) / chunk.size;
        const col = Math.min(chunk.resolution - 1, Math.floor(lx * (chunk.resolution - 1)));
        const row = Math.min(chunk.resolution - 1, Math.floor(lz * (chunk.resolution - 1)));
        return chunk.heightData[row * chunk.resolution + col];
      }
    }
    return 0;
  }
}

