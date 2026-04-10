/**
 * TerrainGenerator.ts
 *
 * Procedural mountain terrain generation using multi-octave Perlin noise.
 * Generates heightmap, calculates slopes, computes surface normals, and creates mesh.
 *
 * Week 6: Avalanche Simulation - Terrain Foundation
 */

export interface TerrainConfig {
  /** Width of terrain in meters */
  width: number;
  /** Depth of terrain in meters */
  depth: number;
  /** Heightmap resolution (NxN grid) */
  resolution: number;
  /** Maximum height of peaks in meters */
  maxHeight: number;
  /** Steepness factor (0-1, controls slope angles) */
  steepness: number;
  /** Roughness factor (0-1, controls noise detail) */
  roughness: number;
  /** Random seed for reproducibility */
  seed?: number;
}

export interface TerrainData {
  /** Heightmap data (resolution × resolution) */
  heightmap: Float32Array;
  /** Slope angles in radians (resolution × resolution) */
  slopes: Float32Array;
  /** Surface normals (3 components per cell) */
  normals: Float32Array;
  /** Mesh vertices for rendering (x, y, z per vertex) */
  vertices: Float32Array;
  /** Mesh indices for triangle rendering */
  indices: Uint32Array;
  /** Terrain bounding box */
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Configuration used to generate terrain */
  config: TerrainConfig;
}

export interface TerrainCell {
  /** Grid coordinates */
  x: number;
  z: number;
  /** Height at this cell */
  height: number;
  /** Slope angle in radians */
  slope: number;
  /** Surface normal vector */
  normal: [number, number, number];
}

/**
 * Procedural terrain generator for avalanche simulation
 */
export class TerrainGenerator {
  private config: TerrainConfig;
  private permutation: number[] = [];

  constructor(config: TerrainConfig) {
    this.config = config;
    this.initializePerlin(config.seed ?? Date.now());
  }

  /**
   * Initialize Perlin noise permutation table
   */
  private initializePerlin(seed: number): void {
    // Seeded random number generator
    let random = this.seededRandom(seed);

    // Create permutation table (0-255)
    const p: number[] = [];
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Duplicate for overflow handling
    this.permutation = [...p, ...p];
  }

  /**
   * Seeded random number generator (simple LCG)
   */
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Fade function for Perlin noise (6t^5 - 15t^4 + 10t^3)
   */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * Gradient function for Perlin noise
   */
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * 2D Perlin noise
   */
  private perlin2D(x: number, y: number): number {
    const p = this.permutation;

    // Find unit grid cell
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    // Relative position within cell
    x -= Math.floor(x);
    y -= Math.floor(y);

    // Compute fade curves
    const u = this.fade(x);
    const v = this.fade(y);

    // Hash coordinates of 4 grid corners
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];

    // Blend results from 4 corners
    return this.lerp(
      this.lerp(this.grad(aa, x, y), this.grad(ba, x - 1, y), u),
      this.lerp(this.grad(ab, x, y - 1), this.grad(bb, x - 1, y - 1), u),
      v
    );
  }

  /**
   * Multi-octave Perlin noise (fractal Brownian motion)
   */
  private fbm(x: number, y: number, octaves: number): number {
    let value = 0.0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0.0;

    for (let i = 0; i < octaves; i++) {
      value += this.perlin2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5; // Each octave contributes half as much
      frequency *= 2.0; // Each octave has twice the frequency
    }

    // Normalize to [-1, 1]
    return value / maxValue;
  }

  /**
   * Generate complete terrain data
   */
  public generateTerrain(): TerrainData {
    const { width, depth, resolution, maxHeight, steepness, roughness } = this.config;

    // Allocate arrays
    const heightmap = new Float32Array(resolution * resolution);
    const slopes = new Float32Array(resolution * resolution);
    const normals = new Float32Array(resolution * resolution * 3);

    // Calculate cell size
    const cellWidth = width / (resolution - 1);
    const cellDepth = depth / (resolution - 1);

    // Noise parameters
    const octaves = 4;
    const scale = 0.02 * (1 + roughness); // More roughness = more detail

    // Generate heightmap
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const index = z * resolution + x;

        // Normalized coordinates [0, 1]
        const nx = x / (resolution - 1);
        const nz = z / (resolution - 1);

        // Center coordinates [-0.5, 0.5]
        const cx = nx - 0.5;
        const cz = nz - 0.5;

        // Distance from center (for mountain shape)
        const distFromCenter = Math.sqrt(cx * cx + cz * cz);

        // Base mountain shape (cone falloff)
        const mountainShape = Math.max(0, 1 - distFromCenter * 2);

        // Multi-octave noise
        const noise = this.fbm(nx / scale, nz / scale, octaves);

        // Combine shape and noise
        // Apply steepness: higher steepness = sharper peaks
        const shapePower = 1 + steepness * 2;
        const height = maxHeight * Math.pow(mountainShape, shapePower) * (0.7 + noise * 0.3);

        heightmap[index] = height;
      }
    }

    // Calculate slopes and normals
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const index = z * resolution + x;

        // Get neighboring heights (handle boundaries)
        const hL = x > 0 ? heightmap[z * resolution + (x - 1)] : heightmap[index];
        const hR = x < resolution - 1 ? heightmap[z * resolution + (x + 1)] : heightmap[index];
        const hD = z > 0 ? heightmap[(z - 1) * resolution + x] : heightmap[index];
        const hU = z < resolution - 1 ? heightmap[(z + 1) * resolution + x] : heightmap[index];

        // Calculate derivatives
        const dx = (hR - hL) / (2 * cellWidth);
        const dz = (hU - hD) / (2 * cellDepth);

        // Slope angle (radians)
        const slope = Math.atan(Math.sqrt(dx * dx + dz * dz));
        slopes[index] = slope;

        // Surface normal (normalized)
        const nx = -dx;
        const ny = 1.0;
        const nz = -dz;
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);

        normals[index * 3 + 0] = nx / length;
        normals[index * 3 + 1] = ny / length;
        normals[index * 3 + 2] = nz / length;
      }
    }

    // Generate mesh vertices
    const vertexCount = resolution * resolution;
    const vertices = new Float32Array(vertexCount * 3);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const index = z * resolution + x;
        const vertexIndex = index * 3;

        // World position
        const worldX = (x / (resolution - 1)) * width - width / 2;
        const worldZ = (z / (resolution - 1)) * depth - depth / 2;
        const worldY = heightmap[index];

        vertices[vertexIndex + 0] = worldX;
        vertices[vertexIndex + 1] = worldY;
        vertices[vertexIndex + 2] = worldZ;
      }
    }

    // Generate mesh indices (triangles)
    const quadCount = (resolution - 1) * (resolution - 1);
    const indices = new Uint32Array(quadCount * 6); // 2 triangles per quad

    let indexOffset = 0;
    for (let z = 0; z < resolution - 1; z++) {
      for (let x = 0; x < resolution - 1; x++) {
        const topLeft = z * resolution + x;
        const topRight = topLeft + 1;
        const bottomLeft = (z + 1) * resolution + x;
        const bottomRight = bottomLeft + 1;

        // Triangle 1
        indices[indexOffset++] = topLeft;
        indices[indexOffset++] = bottomLeft;
        indices[indexOffset++] = topRight;

        // Triangle 2
        indices[indexOffset++] = topRight;
        indices[indexOffset++] = bottomLeft;
        indices[indexOffset++] = bottomRight;
      }
    }

    // Calculate bounds
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      const vx = vertices[i * 3 + 0];
      const vy = vertices[i * 3 + 1];
      const vz = vertices[i * 3 + 2];

      minX = Math.min(minX, vx);
      minY = Math.min(minY, vy);
      minZ = Math.min(minZ, vz);
      maxX = Math.max(maxX, vx);
      maxY = Math.max(maxY, vy);
      maxZ = Math.max(maxZ, vz);
    }

    return {
      heightmap,
      slopes,
      normals,
      vertices,
      indices,
      bounds: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      config: this.config,
    };
  }

  /**
   * Get height at world position (x, z) using bilinear interpolation
   */
  public getHeight(terrain: TerrainData, x: number, z: number): number {
    const { width, depth, resolution } = this.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get integer grid coordinates
    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const z1 = Math.min(z0 + 1, resolution - 1);

    // Fractional parts
    const fx = cx - x0;
    const fz = cz - z0;

    // Get heights at 4 corners
    const h00 = terrain.heightmap[z0 * resolution + x0];
    const h10 = terrain.heightmap[z0 * resolution + x1];
    const h01 = terrain.heightmap[z1 * resolution + x0];
    const h11 = terrain.heightmap[z1 * resolution + x1];

    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  /**
   * Get slope at world position (x, z)
   */
  public getSlope(terrain: TerrainData, x: number, z: number): number {
    const { width, depth, resolution } = this.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get nearest grid cell
    const gridX = Math.round(cx);
    const gridZ = Math.round(cz);
    const index = gridZ * resolution + gridX;

    return terrain.slopes[index];
  }

  /**
   * Get surface normal at world position (x, z)
   */
  public getNormal(terrain: TerrainData, x: number, z: number): [number, number, number] {
    const { width, depth, resolution } = this.config;

    // Convert world to grid coordinates
    const gx = ((x + width / 2) / width) * (resolution - 1);
    const gz = ((z + depth / 2) / depth) * (resolution - 1);

    // Clamp to terrain bounds
    const cx = Math.max(0, Math.min(resolution - 1, gx));
    const cz = Math.max(0, Math.min(resolution - 1, gz));

    // Get nearest grid cell
    const gridX = Math.round(cx);
    const gridZ = Math.round(cz);
    const index = (gridZ * resolution + gridX) * 3;

    return [terrain.normals[index], terrain.normals[index + 1], terrain.normals[index + 2]];
  }

  /**
   * Get terrain cell data at grid coordinates
   */
  public getCell(terrain: TerrainData, gridX: number, gridZ: number): TerrainCell | null {
    const { resolution } = this.config;

    if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) {
      return null;
    }

    const index = gridZ * resolution + gridX;
    const normalIndex = index * 3;

    return {
      x: gridX,
      z: gridZ,
      height: terrain.heightmap[index],
      slope: terrain.slopes[index],
      normal: [
        terrain.normals[normalIndex],
        terrain.normals[normalIndex + 1],
        terrain.normals[normalIndex + 2],
      ],
    };
  }

  /**
   * Get terrain statistics
   */
  public getStatistics(terrain: TerrainData): {
    minHeight: number;
    maxHeight: number;
    avgHeight: number;
    minSlope: number;
    maxSlope: number;
    avgSlope: number;
    steepCells: number; // Cells with slope > 35° (avalanche threshold)
  } {
    const { resolution } = this.config;
    const cellCount = resolution * resolution;

    let minHeight = Infinity;
    let maxHeight = -Infinity;
    let sumHeight = 0;

    let minSlope = Infinity;
    let maxSlope = -Infinity;
    let sumSlope = 0;

    let steepCells = 0;
    const avalancheThreshold = (35 * Math.PI) / 180; // 35° in radians

    for (let i = 0; i < cellCount; i++) {
      const height = terrain.heightmap[i];
      const slope = terrain.slopes[i];

      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      sumHeight += height;

      minSlope = Math.min(minSlope, slope);
      maxSlope = Math.max(maxSlope, slope);
      sumSlope += slope;

      if (slope > avalancheThreshold) {
        steepCells++;
      }
    }

    return {
      minHeight,
      maxHeight,
      avgHeight: sumHeight / cellCount,
      minSlope,
      maxSlope,
      avgSlope: sumSlope / cellCount,
      steepCells,
    };
  }

  /**
   * Export terrain as GPU-compatible buffer data
   */
  public toGPUBuffer(terrain: TerrainData): {
    heightmap: Float32Array;
    metadata: Float32Array; // [width, depth, resolution, maxHeight]
  } {
    const { width, depth, resolution, maxHeight } = this.config;

    return {
      heightmap: terrain.heightmap,
      metadata: new Float32Array([width, depth, resolution, maxHeight]),
    };
  }
}
