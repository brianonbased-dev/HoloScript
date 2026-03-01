/**
 * WaveFunction — WFC tile solver with adjacency rules and backtracking
 *
 * @version 1.0.0
 */

export interface WFCTile {
  id: string;
  weight: number;
  adjacency: { up: string[]; down: string[]; left: string[]; right: string[] };
}

export interface WFCCell {
  x: number; y: number;
  collapsed: boolean;
  tileId: string | null;
  options: string[];
}

export class WaveFunction {
  private tiles: Map<string, WFCTile> = new Map();
  private grid: WFCCell[][] = [];
  private width: number;
  private height: number;
  private rng: () => number;
  private contradictions: number = 0;

  constructor(width: number, height: number, seed: number = 42) {
    this.width = width;
    this.height = height;
    let s = seed;
    this.rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  /**
   * Register a tile type
   */
  addTile(tile: WFCTile): void {
    this.tiles.set(tile.id, tile);
  }

  /**
   * Initialize the grid with all options
   */
  initialize(): void {
    const allIds = [...this.tiles.keys()];
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      this.grid[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x] = { x, y, collapsed: false, tileId: null, options: [...allIds] };
      }
    }
    this.contradictions = 0;
  }

  /**
   * Get the cell with lowest entropy (fewest options)
   */
  getLowestEntropy(): WFCCell | null {
    let minEntropy = Infinity;
    const candidates: WFCCell[] = [];

    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.collapsed) continue;
        if (cell.options.length < minEntropy) {
          minEntropy = cell.options.length;
          candidates.length = 0;
          candidates.push(cell);
        } else if (cell.options.length === minEntropy) {
          candidates.push(cell);
        }
      }
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }

  /**
   * Collapse a cell to a single tile
   */
  collapse(cell: WFCCell): boolean {
    if (cell.options.length === 0) {
      this.contradictions++;
      return false;
    }

    // Weighted random selection
    let totalWeight = 0;
    for (const tileId of cell.options) {
      totalWeight += (this.tiles.get(tileId)?.weight ?? 1);
    }

    let rand = this.rng() * totalWeight;
    for (const tileId of cell.options) {
      rand -= (this.tiles.get(tileId)?.weight ?? 1);
      if (rand <= 0) {
        cell.tileId = tileId;
        cell.options = [tileId];
        cell.collapsed = true;
        return true;
      }
    }

    cell.tileId = cell.options[0];
    cell.options = [cell.tileId];
    cell.collapsed = true;
    return true;
  }

  /**
   * Propagate constraints from a collapsed cell
   */
  propagate(cell: WFCCell): void {
    const stack: WFCCell[] = [cell];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const neighbors = this.getNeighbors(current.x, current.y);

      for (const [dir, neighbor] of neighbors) {
        if (neighbor.collapsed) continue;

        const validOptions = new Set<string>();
        for (const optionId of current.options) {
          const tile = this.tiles.get(optionId);
          if (tile) {
            const allowed = tile.adjacency[dir as keyof WFCTile['adjacency']];
            for (const a of allowed) validOptions.add(a);
          }
        }

        const before = neighbor.options.length;
        neighbor.options = neighbor.options.filter(o => validOptions.has(o));

        if (neighbor.options.length < before) {
          stack.push(neighbor);
        }
      }
    }
  }

  /**
   * Solve the entire grid
   */
  solve(maxIterations: number = 10000): boolean {
    this.initialize();
    let iterations = 0;

    while (iterations < maxIterations) {
      const cell = this.getLowestEntropy();
      if (!cell) return true; // All collapsed

      if (!this.collapse(cell)) return false; // Contradiction
      this.propagate(cell);
      iterations++;
    }

    return false;
  }

  private getNeighbors(x: number, y: number): [string, WFCCell][] {
    const result: [string, WFCCell][] = [];
    if (y > 0) result.push(['up', this.grid[y - 1][x]]);
    if (y < this.height - 1) result.push(['down', this.grid[y + 1][x]]);
    if (x > 0) result.push(['left', this.grid[y][x - 1]]);
    if (x < this.width - 1) result.push(['right', this.grid[y][x + 1]]);
    return result;
  }

  getCell(x: number, y: number): WFCCell | undefined { return this.grid[y]?.[x]; }
  getGrid(): WFCCell[][] { return this.grid.map(row => row.map(c => ({ ...c }))); }
  isComplete(): boolean { return this.grid.every(row => row.every(c => c.collapsed)); }
  getContradictions(): number { return this.contradictions; }
  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }
}
