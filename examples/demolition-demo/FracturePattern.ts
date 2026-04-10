/**
 * FracturePattern.ts
 *
 * Defines different fracture patterns for breaking objects.
 * Supports Voronoi, radial, and grid-based patterns.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import type { Vector3, FragmentGeometry } from './Fragment';

export type FractureType = 'voronoi' | 'radial' | 'grid' | 'custom';

export interface FracturePatternConfig {
  /** Type of fracture pattern */
  type: FractureType;
  /** Number of fragments to create */
  fragmentCount?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Custom pattern generator */
  customGenerator?: (bounds: BoundingVolume) => Vector3[];
}

export interface BoundingVolume {
  min: Vector3;
  max: Vector3;
}

/**
 * Fracture pattern generator
 */
export class FracturePattern {
  private readonly config: Required<FracturePatternConfig>;
  private rng: () => number;

  constructor(config: FracturePatternConfig) {
    this.config = {
      type: config.type,
      fragmentCount: config.fragmentCount ?? 10,
      seed: config.seed ?? Date.now(),
      customGenerator: config.customGenerator ?? (() => []),
    };

    this.rng = this.seededRandom(this.config.seed);
  }

  /**
   * Generate fracture points within bounds
   */
  public generatePoints(bounds: BoundingVolume): Vector3[] {
    switch (this.config.type) {
      case 'voronoi':
        return this.generateVoronoiPoints(bounds);
      case 'radial':
        return this.generateRadialPoints(bounds);
      case 'grid':
        return this.generateGridPoints(bounds);
      case 'custom':
        return this.config.customGenerator(bounds);
      default:
        return this.generateVoronoiPoints(bounds);
    }
  }

  /**
   * Generate Voronoi cell points (random distribution)
   */
  private generateVoronoiPoints(bounds: BoundingVolume): Vector3[] {
    const points: Vector3[] = [];
    const { min, max } = bounds;

    for (let i = 0; i < this.config.fragmentCount; i++) {
      points.push({
        x: min.x + this.rng() * (max.x - min.x),
        y: min.y + this.rng() * (max.y - min.y),
        z: min.z + this.rng() * (max.z - min.z),
      });
    }

    return points;
  }

  /**
   * Generate radial fracture points (emanating from center)
   */
  private generateRadialPoints(bounds: BoundingVolume): Vector3[] {
    const points: Vector3[] = [];
    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };

    const maxRadius = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    // Create rings of points
    const rings = Math.ceil(Math.sqrt(this.config.fragmentCount));
    const pointsPerRing = Math.ceil(this.config.fragmentCount / rings);

    for (let ring = 0; ring < rings; ring++) {
      const radius = ((ring + 1) / rings) * (maxRadius / 2);
      const angleStep = (Math.PI * 2) / pointsPerRing;

      for (let i = 0; i < pointsPerRing; i++) {
        if (points.length >= this.config.fragmentCount) break;

        const angle = i * angleStep + this.rng() * angleStep * 0.2; // Add jitter
        const elevation = (this.rng() - 0.5) * Math.PI; // Random elevation

        points.push({
          x: center.x + radius * Math.cos(angle) * Math.cos(elevation),
          y: center.y + radius * Math.sin(elevation),
          z: center.z + radius * Math.sin(angle) * Math.cos(elevation),
        });
      }
    }

    return points.slice(0, this.config.fragmentCount);
  }

  /**
   * Generate grid-based fracture points (uniform distribution)
   */
  private generateGridPoints(bounds: BoundingVolume): Vector3[] {
    const points: Vector3[] = [];
    const gridSize = Math.ceil(Math.cbrt(this.config.fragmentCount));

    const { min, max } = bounds;
    const stepX = (max.x - min.x) / gridSize;
    const stepY = (max.y - min.y) / gridSize;
    const stepZ = (max.z - min.z) / gridSize;

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          if (points.length >= this.config.fragmentCount) break;

          // Add jitter to avoid perfect grid
          const jitterX = (this.rng() - 0.5) * stepX * 0.3;
          const jitterY = (this.rng() - 0.5) * stepY * 0.3;
          const jitterZ = (this.rng() - 0.5) * stepZ * 0.3;

          points.push({
            x: min.x + (x + 0.5) * stepX + jitterX,
            y: min.y + (y + 0.5) * stepY + jitterY,
            z: min.z + (z + 0.5) * stepZ + jitterZ,
          });
        }
      }
    }

    return points.slice(0, this.config.fragmentCount);
  }

  /**
   * Generate Voronoi cells from points
   * (Simplified 3D Voronoi - assigns each voxel to nearest point)
   */
  public generateVoronoiCells(
    points: Vector3[],
    bounds: BoundingVolume,
    resolution: number = 10
  ): Map<number, Vector3[]> {
    const cells = new Map<number, Vector3[]>();

    // Initialize cells
    for (let i = 0; i < points.length; i++) {
      cells.set(i, []);
    }

    const { min, max } = bounds;
    const stepX = (max.x - min.x) / resolution;
    const stepY = (max.y - min.y) / resolution;
    const stepZ = (max.z - min.z) / resolution;

    // Assign each voxel to nearest point
    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        for (let z = 0; z < resolution; z++) {
          const voxel = {
            x: min.x + (x + 0.5) * stepX,
            y: min.y + (y + 0.5) * stepY,
            z: min.z + (z + 0.5) * stepZ,
          };

          let nearestIdx = 0;
          let nearestDistSq = Infinity;

          for (let i = 0; i < points.length; i++) {
            const distSq = this.distanceSquared(voxel, points[i]);
            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              nearestIdx = i;
            }
          }

          cells.get(nearestIdx)!.push(voxel);
        }
      }
    }

    return cells;
  }

  /**
   * Convert Voronoi cells to fragment geometry
   */
  public cellsToGeometry(cells: Map<number, Vector3[]>): FragmentGeometry[] {
    const geometries: FragmentGeometry[] = [];

    cells.forEach((voxels, _cellIdx) => {
      if (voxels.length === 0) return;

      // Calculate centroid
      let cx = 0,
        cy = 0,
        cz = 0;
      for (const v of voxels) {
        cx += v.x;
        cy += v.y;
        cz += v.z;
      }
      cx /= voxels.length;
      cy /= voxels.length;
      cz /= voxels.length;

      const centroid = { x: cx, y: cy, z: cz };

      // Create convex hull (simplified: use voxel centers as vertices)
      const vertices = new Float32Array(voxels.length * 3);
      for (let i = 0; i < voxels.length; i++) {
        vertices[i * 3 + 0] = voxels[i].x - centroid.x;
        vertices[i * 3 + 1] = voxels[i].y - centroid.y;
        vertices[i * 3 + 2] = voxels[i].z - centroid.z;
      }

      // Simple triangulation (for now, just create a tetrahedron per voxel)
      const indices: number[] = [];
      const normals: number[] = [];

      for (let i = 0; i < voxels.length; i++) {
        // Each voxel contributes 4 triangles (tetrahedron from centroid)
        const base = i;

        // Create triangles to neighbors (simplified)
        if (i < voxels.length - 2) {
          indices.push(base, base + 1, base + 2);

          // Calculate normal
          const v0 = {
            x: vertices[base * 3],
            y: vertices[base * 3 + 1],
            z: vertices[base * 3 + 2],
          };
          const v1 = {
            x: vertices[(base + 1) * 3],
            y: vertices[(base + 1) * 3 + 1],
            z: vertices[(base + 1) * 3 + 2],
          };
          const v2 = {
            x: vertices[(base + 2) * 3],
            y: vertices[(base + 2) * 3 + 1],
            z: vertices[(base + 2) * 3 + 2],
          };

          const normal = this.calculateNormal(v0, v1, v2);
          normals.push(normal.x, normal.y, normal.z);
        }
      }

      // Estimate volume (sum of voxel volumes)
      const voxelVolume = 1.0; // Placeholder
      const volume = voxels.length * voxelVolume;

      geometries.push({
        vertices,
        indices: new Uint32Array(indices),
        normals: new Float32Array(normals),
        centroid,
        volume,
      });
    });

    return geometries;
  }

  /**
   * Calculate triangle normal
   */
  private calculateNormal(v0: Vector3, v1: Vector3, v2: Vector3): Vector3 {
    const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

    const normal = {
      x: edge1.y * edge2.z - edge1.z * edge2.y,
      y: edge1.z * edge2.x - edge1.x * edge2.z,
      z: edge1.x * edge2.y - edge1.y * edge2.x,
    };

    // Normalize
    const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (len > 0) {
      normal.x /= len;
      normal.y /= len;
      normal.z /= len;
    }

    return normal;
  }

  /**
   * Distance squared between two points
   */
  private distanceSquared(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Seeded random number generator
   */
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 0x100000000;
      return state / 0x100000000;
    };
  }
}
