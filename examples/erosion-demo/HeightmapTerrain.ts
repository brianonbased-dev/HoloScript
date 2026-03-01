/**
 * HeightmapTerrain.ts
 *
 * Editable heightmap terrain for erosion simulation.
 * Supports real-time height modifications, mesh regeneration, and undo/redo.
 *
 * Week 7: Water Erosion - Day 1
 */

export interface HeightmapConfig {
  /** Width of terrain in meters */
  width: number;
  /** Depth of terrain in meters */
  depth: number;
  /** Grid resolution (width×depth cells) */
  resolution: number;
  /** Initial height function */
  initialHeight?: (x: number, z: number) => number;
}

export interface TerrainSnapshot {
  /** Snapshot ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Heightmap data */
  heightmap: Float32Array;
  /** Description */
  description: string;
}

export interface TerrainMesh {
  /** Vertex positions [x, y, z, x, y, z, ...] */
  vertices: Float32Array;
  /** Vertex normals [nx, ny, nz, nx, ny, nz, ...] */
  normals: Float32Array;
  /** Triangle indices */
  indices: Uint32Array;
}

export interface TerrainStatistics {
  /** Minimum height */
  minHeight: number;
  /** Maximum height */
  maxHeight: number;
  /** Average height */
  avgHeight: number;
  /** Total volume above z=0 */
  volume: number;
  /** Average slope (radians) */
  avgSlope: number;
  /** Maximum slope (radians) */
  maxSlope: number;
}

/**
 * Editable heightmap terrain
 */
export class HeightmapTerrain {
  public readonly config: HeightmapConfig;
  public heightmap: Float32Array;
  private slopes: Float32Array;
  private normals: Float32Array;
  private mesh: TerrainMesh | null = null;
  private meshDirty = true;
  private snapshots: Map<string, TerrainSnapshot> = new Map();
  private snapshotCounter = 0;

  constructor(config: HeightmapConfig) {
    this.config = config;

    const size = config.resolution * config.resolution;
    this.heightmap = new Float32Array(size);
    this.slopes = new Float32Array(size);
    this.normals = new Float32Array(size * 3);

    // Initialize heightmap
    if (config.initialHeight) {
      this.initializeWithFunction(config.initialHeight);
    }

    // Calculate slopes and normals
    this.updateSlopesAndNormals();
  }

  /**
   * Initialize heightmap with custom function
   */
  private initializeWithFunction(heightFunc: (x: number, z: number) => number): void {
    const { width, depth, resolution } = this.config;
    const cellSizeX = width / (resolution - 1);
    const cellSizeZ = depth / (resolution - 1);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const worldX = (x / (resolution - 1)) * width - width / 2;
        const worldZ = (z / (resolution - 1)) * depth - depth / 2;

        const height = heightFunc(worldX, worldZ);
        this.heightmap[z * resolution + x] = height;
      }
    }

    this.meshDirty = true;
  }

  /**
   * Get height at grid coordinates
   */
  public getHeightAtGrid(gridX: number, gridZ: number): number {
    const { resolution } = this.config;

    if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) {
      return 0;
    }

    return this.heightmap[gridZ * resolution + gridX];
  }

  /**
   * Get height at world coordinates (with bilinear interpolation)
   */
  public getHeightAt(x: number, z: number): number {
    const { width, depth, resolution } = this.config;

    // Convert world coords to grid coords
    const gridX = ((x + width / 2) / width) * (resolution - 1);
    const gridZ = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to valid range
    const clampedX = Math.max(0, Math.min(resolution - 2, gridX));
    const clampedZ = Math.max(0, Math.min(resolution - 2, gridZ));

    // Get integer and fractional parts
    const x0 = Math.floor(clampedX);
    const z0 = Math.floor(clampedZ);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const fx = clampedX - x0;
    const fz = clampedZ - z0;

    // Bilinear interpolation
    const h00 = this.getHeightAtGrid(x0, z0);
    const h10 = this.getHeightAtGrid(x1, z0);
    const h01 = this.getHeightAtGrid(x0, z1);
    const h11 = this.getHeightAtGrid(x1, z1);

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;

    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Set height at grid coordinates
   */
  public setHeightAtGrid(gridX: number, gridZ: number, height: number): void {
    const { resolution } = this.config;

    if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) {
      return;
    }

    this.heightmap[gridZ * resolution + gridX] = height;
    this.meshDirty = true;

    // Update affected slopes and normals
    this.updateSlopesAndNormalsLocal(gridX, gridZ);
  }

  /**
   * Modify height at grid coordinates (add delta)
   */
  public modifyHeightAtGrid(gridX: number, gridZ: number, delta: number): void {
    const currentHeight = this.getHeightAtGrid(gridX, gridZ);
    this.setHeightAtGrid(gridX, gridZ, currentHeight + delta);
  }

  /**
   * Set height at world coordinates (affects nearest grid cell)
   */
  public setHeightAt(x: number, z: number, height: number): void {
    const { width, depth, resolution } = this.config;

    const gridX = Math.round(((x + width / 2) / width) * (resolution - 1));
    const gridZ = Math.round(((z + depth / 2) / depth) * (resolution - 1));

    this.setHeightAtGrid(gridX, gridZ, height);
  }

  /**
   * Modify height at world coordinates
   */
  public modifyHeightAt(x: number, z: number, delta: number): void {
    const currentHeight = this.getHeightAt(x, z);
    this.setHeightAt(x, z, currentHeight + delta);
  }

  /**
   * Get slope at grid coordinates (radians)
   */
  public getSlopeAtGrid(gridX: number, gridZ: number): number {
    const { resolution } = this.config;

    if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) {
      return 0;
    }

    return this.slopes[gridZ * resolution + gridX];
  }

  /**
   * Get slope at world coordinates (radians)
   */
  public getSlopeAt(x: number, z: number): number {
    const { width, depth, resolution } = this.config;

    const gridX = Math.round(((x + width / 2) / width) * (resolution - 1));
    const gridZ = Math.round(((z + depth / 2) / depth) * (resolution - 1));

    return this.getSlopeAtGrid(gridX, gridZ);
  }

  /**
   * Get normal at grid coordinates
   */
  public getNormalAtGrid(gridX: number, gridZ: number): [number, number, number] {
    const { resolution } = this.config;

    if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) {
      return [0, 1, 0];
    }

    const idx = (gridZ * resolution + gridX) * 3;
    return [this.normals[idx], this.normals[idx + 1], this.normals[idx + 2]];
  }

  /**
   * Get normal at world coordinates
   */
  public getNormalAt(x: number, z: number): [number, number, number] {
    const { width, depth, resolution } = this.config;

    const gridX = Math.round(((x + width / 2) / width) * (resolution - 1));
    const gridZ = Math.round(((z + depth / 2) / depth) * (resolution - 1));

    return this.getNormalAtGrid(gridX, gridZ);
  }

  /**
   * Update slopes and normals for entire terrain
   */
  private updateSlopesAndNormals(): void {
    const { resolution } = this.config;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        this.updateSlopesAndNormalsLocal(x, z);
      }
    }
  }

  /**
   * Update slopes and normals around a specific grid cell
   */
  private updateSlopesAndNormalsLocal(gridX: number, gridZ: number): void {
    const { width, depth, resolution } = this.config;
    const cellSizeX = width / (resolution - 1);
    const cellSizeZ = depth / (resolution - 1);

    // Update 3x3 neighborhood
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = gridX + dx;
        const z = gridZ + dz;

        if (x < 0 || x >= resolution || z < 0 || z >= resolution) {
          continue;
        }

        // Calculate slope
        const h = this.getHeightAtGrid(x, z);
        const hx0 = this.getHeightAtGrid(Math.max(0, x - 1), z);
        const hx1 = this.getHeightAtGrid(Math.min(resolution - 1, x + 1), z);
        const hz0 = this.getHeightAtGrid(x, Math.max(0, z - 1));
        const hz1 = this.getHeightAtGrid(x, Math.min(resolution - 1, z + 1));

        const dx_slope = (hx1 - hx0) / (2 * cellSizeX);
        const dz_slope = (hz1 - hz0) / (2 * cellSizeZ);

        const slope = Math.atan(Math.sqrt(dx_slope * dx_slope + dz_slope * dz_slope));
        this.slopes[z * resolution + x] = slope;

        // Calculate normal
        const normalX = -dx_slope;
        const normalY = 1.0;
        const normalZ = -dz_slope;

        const length = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);

        const idx = (z * resolution + x) * 3;
        this.normals[idx + 0] = normalX / length;
        this.normals[idx + 1] = normalY / length;
        this.normals[idx + 2] = normalZ / length;
      }
    }
  }

  /**
   * Generate mesh for rendering
   */
  public generateMesh(): TerrainMesh {
    if (!this.meshDirty && this.mesh) {
      return this.mesh;
    }

    const { width, depth, resolution } = this.config;
    const cellSizeX = width / (resolution - 1);
    const cellSizeZ = depth / (resolution - 1);

    // Vertices and normals
    const vertexCount = resolution * resolution;
    const vertices = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (z * resolution + x) * 3;

        // Position
        vertices[idx + 0] = x * cellSizeX - width / 2;
        vertices[idx + 1] = this.heightmap[z * resolution + x];
        vertices[idx + 2] = z * cellSizeZ - depth / 2;

        // Normal
        const normal = this.getNormalAtGrid(x, z);
        normals[idx + 0] = normal[0];
        normals[idx + 1] = normal[1];
        normals[idx + 2] = normal[2];
      }
    }

    // Indices
    const triangleCount = (resolution - 1) * (resolution - 1) * 2;
    const indices = new Uint32Array(triangleCount * 3);
    let idx = 0;

    for (let z = 0; z < resolution - 1; z++) {
      for (let x = 0; x < resolution - 1; x++) {
        const topLeft = z * resolution + x;
        const topRight = topLeft + 1;
        const bottomLeft = (z + 1) * resolution + x;
        const bottomRight = bottomLeft + 1;

        // Triangle 1
        indices[idx++] = topLeft;
        indices[idx++] = bottomLeft;
        indices[idx++] = topRight;

        // Triangle 2
        indices[idx++] = topRight;
        indices[idx++] = bottomLeft;
        indices[idx++] = bottomRight;
      }
    }

    this.mesh = { vertices, normals, indices };
    this.meshDirty = false;

    return this.mesh;
  }

  /**
   * Regenerate mesh (force update)
   */
  public regenerateMesh(): TerrainMesh {
    this.meshDirty = true;
    return this.generateMesh();
  }

  /**
   * Save current terrain state as a snapshot
   */
  public saveSnapshot(description: string = ''): string {
    const id = `snapshot_${this.snapshotCounter++}`;

    const snapshot: TerrainSnapshot = {
      id,
      timestamp: Date.now(),
      heightmap: new Float32Array(this.heightmap),
      description,
    };

    this.snapshots.set(id, snapshot);

    return id;
  }

  /**
   * Restore terrain from snapshot
   */
  public restoreSnapshot(id: string): boolean {
    const snapshot = this.snapshots.get(id);

    if (!snapshot) {
      return false;
    }

    // Restore heightmap
    this.heightmap.set(snapshot.heightmap);

    // Update slopes and normals
    this.updateSlopesAndNormals();

    // Mark mesh dirty
    this.meshDirty = true;

    return true;
  }

  /**
   * Get all snapshots
   */
  public getSnapshots(): TerrainSnapshot[] {
    return Array.from(this.snapshots.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Delete snapshot
   */
  public deleteSnapshot(id: string): boolean {
    return this.snapshots.delete(id);
  }

  /**
   * Clear all snapshots
   */
  public clearSnapshots(): void {
    this.snapshots.clear();
    this.snapshotCounter = 0;
  }

  /**
   * Calculate terrain statistics
   */
  public getStatistics(): TerrainStatistics {
    const { width, depth, resolution } = this.config;
    const cellArea = (width / (resolution - 1)) * (depth / (resolution - 1));

    let minHeight = Infinity;
    let maxHeight = -Infinity;
    let sumHeight = 0;
    let volume = 0;
    let sumSlope = 0;
    let maxSlope = 0;

    for (let i = 0; i < this.heightmap.length; i++) {
      const h = this.heightmap[i];
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
      sumHeight += h;

      if (h > 0) {
        volume += h * cellArea;
      }

      const slope = this.slopes[i];
      sumSlope += slope;
      maxSlope = Math.max(maxSlope, slope);
    }

    return {
      minHeight,
      maxHeight,
      avgHeight: sumHeight / this.heightmap.length,
      volume,
      avgSlope: sumSlope / this.slopes.length,
      maxSlope,
    };
  }

  /**
   * Reset terrain to initial state
   */
  public reset(): void {
    if (this.config.initialHeight) {
      this.initializeWithFunction(this.config.initialHeight);
    } else {
      this.heightmap.fill(0);
    }

    this.updateSlopesAndNormals();
    this.meshDirty = true;
  }

  /**
   * Fill terrain with constant height
   */
  public fill(height: number): void {
    this.heightmap.fill(height);
    this.updateSlopesAndNormals();
    this.meshDirty = true;
  }

  /**
   * Smooth terrain (average with neighbors)
   */
  public smooth(iterations: number = 1): void {
    const { resolution } = this.config;
    const temp = new Float32Array(this.heightmap);

    for (let iter = 0; iter < iterations; iter++) {
      for (let z = 1; z < resolution - 1; z++) {
        for (let x = 1; x < resolution - 1; x++) {
          const idx = z * resolution + x;

          // Average with 8 neighbors
          let sum = 0;
          let count = 0;

          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += temp[(z + dz) * resolution + (x + dx)];
              count++;
            }
          }

          this.heightmap[idx] = sum / count;
        }
      }

      temp.set(this.heightmap);
    }

    this.updateSlopesAndNormals();
    this.meshDirty = true;
  }
}
