/**
 * SpatialHash.ts
 *
 * Spatial hashing grid for broadphase collision detection.
 * Divides 3D space into uniform cells for O(1) average neighbor queries.
 */

export interface SpatialEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  radius?: number;
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

export class SpatialHash {
  private cellSize: number;
  private cells: Map<string, Set<string>> = new Map();
  private entities: Map<string, SpatialEntity> = new Map();

  constructor(cellSize: number = 5) {
    this.cellSize = cellSize;
  }

  /**
   * Insert or update an entity.
   */
  insert(entity: SpatialEntity): void {
    this.remove(entity.id); // Remove from old cell
    this.entities.set(entity.id, entity);

    const keys = this.getOccupiedCells(entity);
    for (const key of keys) {
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key)!.add(entity.id);
    }
  }

  /**
   * Remove an entity.
   */
  remove(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    const keys = this.getOccupiedCells(entity);
    for (const key of keys) {
      this.cells.get(key)?.delete(id);
    }
    this.entities.delete(id);
  }

  /**
   * Query entities near a point within a radius.
   */
  queryRadius(x: number, y: number, z: number, radius: number): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const seen = new Set<string>();

    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const cell = this.cells.get(cellKey(cx, cy, cz));
          if (!cell) continue;

          for (const id of cell) {
            if (seen.has(id)) continue;
            seen.add(id);

            const e = this.entities.get(id)!;
            const dx = e.x - x,
              dy = e.y - y,
              dz = e.z - z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= radius + (e.radius || 0)) {
              results.push(e);
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Get entity count.
   */
  get count(): number {
    return this.entities.size;
  }

  /**
   * Clear all entities.
   */
  clear(): void {
    this.cells.clear();
    this.entities.clear();
  }

  private getOccupiedCells(e: SpatialEntity): string[] {
    const r = e.radius || 0;
    const minCx = Math.floor((e.x - r) / this.cellSize);
    const maxCx = Math.floor((e.x + r) / this.cellSize);
    const minCy = Math.floor((e.y - r) / this.cellSize);
    const maxCy = Math.floor((e.y + r) / this.cellSize);
    const minCz = Math.floor((e.z - r) / this.cellSize);
    const maxCz = Math.floor((e.z + r) / this.cellSize);

    const keys: string[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          keys.push(cellKey(cx, cy, cz));
        }
      }
    }
    return keys;
  }
}
