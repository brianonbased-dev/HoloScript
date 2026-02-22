/**
 * SpatialHash.ts
 *
 * 3D spatial hashing grid for fast particle neighbor queries.
 * Optimized for high particle counts (120K+).
 *
 * Week 8: Explosive Demolition - Day 3
 */

import type { Vector3 } from './Fragment';
import type { DebrisParticle } from './DebrisParticle';

export interface SpatialHashConfig {
  /** Cell size */
  cellSize?: number;
  /** Initial capacity hint */
  initialCapacity?: number;
}

export interface SpatialHashStatistics {
  /** Total cells */
  totalCells: number;
  /** Non-empty cells */
  occupiedCells: number;
  /** Total particles */
  totalParticles: number;
  /** Average particles per occupied cell */
  avgParticlesPerCell: number;
  /** Max particles in a single cell */
  maxParticlesInCell: number;
}

/**
 * 3D spatial hash grid
 */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly cells = new Map<string, DebrisParticle[]>();

  constructor(config: SpatialHashConfig = {}) {
    this.cellSize = config.cellSize ?? 1.0;
  }

  /**
   * Get cell key from position
   */
  private getCellKey(position: Vector3): string {
    const x = Math.floor(position.x / this.cellSize);
    const y = Math.floor(position.y / this.cellSize);
    const z = Math.floor(position.z / this.cellSize);

    return `${x},${y},${z}`;
  }

  /**
   * Insert particle into spatial hash
   */
  public insert(particle: DebrisParticle): void {
    const key = this.getCellKey(particle.position);

    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }

    cell.push(particle);
    particle.setSpatialHashCell(key);
  }

  /**
   * Remove particle from spatial hash
   */
  public remove(particle: DebrisParticle): boolean {
    const cellKey = particle.getSpatialHashCell();
    if (!cellKey) return false;

    const cell = this.cells.get(cellKey);
    if (!cell) return false;

    const index = cell.indexOf(particle);
    if (index === -1) return false;

    cell.splice(index, 1);

    // Remove empty cells
    if (cell.length === 0) {
      this.cells.delete(cellKey);
    }

    particle.setSpatialHashCell(null);
    return true;
  }

  /**
   * Update particle position in spatial hash
   */
  public update(particle: DebrisParticle): void {
    const currentKey = particle.getSpatialHashCell();
    const newKey = this.getCellKey(particle.position);

    // If cell hasn't changed, no need to update
    if (currentKey === newKey) return;

    // Remove from old cell
    if (currentKey) {
      const oldCell = this.cells.get(currentKey);
      if (oldCell) {
        const index = oldCell.indexOf(particle);
        if (index !== -1) {
          oldCell.splice(index, 1);

          // Remove empty cells
          if (oldCell.length === 0) {
            this.cells.delete(currentKey);
          }
        }
      }
    }

    // Insert into new cell
    let newCell = this.cells.get(newKey);
    if (!newCell) {
      newCell = [];
      this.cells.set(newKey, newCell);
    }

    newCell.push(particle);
    particle.setSpatialHashCell(newKey);
  }

  /**
   * Query particles within radius of point
   */
  public queryRadius(position: Vector3, radius: number): DebrisParticle[] {
    const results: DebrisParticle[] = [];
    const radiusSquared = radius * radius;

    // Calculate cell range to check
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minY = Math.floor((position.y - radius) / this.cellSize);
    const maxY = Math.floor((position.y + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);

    // Check all cells in range
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${y},${z}`;
          const cell = this.cells.get(key);

          if (cell) {
            for (const particle of cell) {
              const dx = particle.position.x - position.x;
              const dy = particle.position.y - position.y;
              const dz = particle.position.z - position.z;
              const distSquared = dx * dx + dy * dy + dz * dz;

              if (distSquared <= radiusSquared) {
                results.push(particle);
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Query particles in bounding box
   */
  public queryBox(min: Vector3, max: Vector3): DebrisParticle[] {
    const results: DebrisParticle[] = [];

    // Calculate cell range to check
    const minX = Math.floor(min.x / this.cellSize);
    const maxX = Math.floor(max.x / this.cellSize);
    const minY = Math.floor(min.y / this.cellSize);
    const maxY = Math.floor(max.y / this.cellSize);
    const minZ = Math.floor(min.z / this.cellSize);
    const maxZ = Math.floor(max.z / this.cellSize);

    // Check all cells in range
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${y},${z}`;
          const cell = this.cells.get(key);

          if (cell) {
            for (const particle of cell) {
              if (
                particle.position.x >= min.x &&
                particle.position.x <= max.x &&
                particle.position.y >= min.y &&
                particle.position.y <= max.y &&
                particle.position.z >= min.z &&
                particle.position.z <= max.z
              ) {
                results.push(particle);
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Get all particles in spatial hash
   */
  public getAllParticles(): DebrisParticle[] {
    const results: DebrisParticle[] = [];

    for (const cell of this.cells.values()) {
      results.push(...cell);
    }

    return results;
  }

  /**
   * Clear all particles
   */
  public clear(): void {
    for (const cell of this.cells.values()) {
      for (const particle of cell) {
        particle.setSpatialHashCell(null);
      }
    }

    this.cells.clear();
  }

  /**
   * Get statistics
   */
  public getStatistics(): SpatialHashStatistics {
    let totalParticles = 0;
    let maxParticlesInCell = 0;

    for (const cell of this.cells.values()) {
      totalParticles += cell.length;
      maxParticlesInCell = Math.max(maxParticlesInCell, cell.length);
    }

    const occupiedCells = this.cells.size;
    const avgParticlesPerCell = occupiedCells > 0 ? totalParticles / occupiedCells : 0;

    return {
      totalCells: this.cells.size,
      occupiedCells,
      totalParticles,
      avgParticlesPerCell,
      maxParticlesInCell,
    };
  }

  /**
   * Get cell size
   */
  public getCellSize(): number {
    return this.cellSize;
  }
}
