/**
 * SpatialHash.ts
 *
 * Grid-based spatial hash for broad-phase collision detection:
 * insert/remove/query, cell management, and neighbor iteration.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SpatialEntry {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number; // Bounding radius for multi-cell insertion
}

// =============================================================================
// SPATIAL HASH
// =============================================================================

export class SpatialHash {
  private cellSize: number;
  private cells: Map<string, Set<string>> = new Map();
  private entries: Map<string, SpatialEntry> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  // ---------------------------------------------------------------------------
  // Insert / Remove
  // ---------------------------------------------------------------------------

  insert(entry: SpatialEntry): void {
    this.entries.set(entry.id, entry);
    const cells = this.getCellsForEntry(entry);
    for (const key of cells) {
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key)!.add(entry.id);
    }
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    const cells = this.getCellsForEntry(entry);
    for (const key of cells) {
      const cell = this.cells.get(key);
      if (cell) {
        cell.delete(id);
        if (cell.size === 0) this.cells.delete(key);
      }
    }
    this.entries.delete(id);
  }

  update(id: string, x: number, y: number, z: number): void {
    this.remove(id);
    const entry = this.entries.get(id) ?? { id, x, y, z, radius: 0 };
    entry.x = x;
    entry.y = y;
    entry.z = z;
    this.insert(entry);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  queryPoint(x: number, y: number, z: number): string[] {
    const key = this.cellKey(
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
      Math.floor(z / this.cellSize)
    );
    const cell = this.cells.get(key);
    return cell ? [...cell] : [];
  }

  queryRadius(x: number, y: number, z: number, radius: number): string[] {
    const results = new Set<string>();
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const cell = this.cells.get(this.cellKey(cx, cy, cz));
          if (!cell) continue;
          for (const id of cell) {
            const entry = this.entries.get(id);
            if (entry) {
              const dx = entry.x - x,
                dy = entry.y - y,
                dz = entry.z - z;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dist <= radius + entry.radius) results.add(id);
            }
          }
        }
      }
    }

    return [...results];
  }

  getNearbyPairs(): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    const seen = new Set<string>();

    for (const cell of this.cells.values()) {
      const ids = [...cell];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = ids[i] < ids[j] ? `${ids[i]}:${ids[j]}` : `${ids[j]}:${ids[i]}`;
          if (!seen.has(key)) {
            seen.add(key);
            pairs.push([ids[i], ids[j]]);
          }
        }
      }
    }

    return pairs;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private getCellsForEntry(entry: SpatialEntry): string[] {
    const keys: string[] = [];
    const minCx = Math.floor((entry.x - entry.radius) / this.cellSize);
    const maxCx = Math.floor((entry.x + entry.radius) / this.cellSize);
    const minCy = Math.floor((entry.y - entry.radius) / this.cellSize);
    const maxCy = Math.floor((entry.y + entry.radius) / this.cellSize);
    const minCz = Math.floor((entry.z - entry.radius) / this.cellSize);
    const maxCz = Math.floor((entry.z + entry.radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          keys.push(this.cellKey(cx, cy, cz));
        }
      }
    }
    return keys;
  }

  private cellKey(cx: number, cy: number, cz: number): string {
    return `${cx}:${cy}:${cz}`;
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getEntryCount(): number {
    return this.entries.size;
  }
  getCellCount(): number {
    return this.cells.size;
  }
  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }
}
