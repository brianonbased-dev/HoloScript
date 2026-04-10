import { describe, it, expect } from 'vitest';
import { WaveFunction, type WFCTile } from '../WaveFunction';

const grass: WFCTile = {
  id: 'grass',
  weight: 3,
  adjacency: {
    up: ['grass', 'sand'],
    down: ['grass', 'sand'],
    left: ['grass', 'sand'],
    right: ['grass', 'sand'],
  },
};
const sand: WFCTile = {
  id: 'sand',
  weight: 1,
  adjacency: {
    up: ['grass', 'sand', 'water'],
    down: ['grass', 'sand', 'water'],
    left: ['grass', 'sand', 'water'],
    right: ['grass', 'sand', 'water'],
  },
};
const water: WFCTile = {
  id: 'water',
  weight: 2,
  adjacency: {
    up: ['sand', 'water'],
    down: ['sand', 'water'],
    left: ['sand', 'water'],
    right: ['sand', 'water'],
  },
};

function makeWFC(w = 4, h = 4) {
  const wfc = new WaveFunction(w, h, 42);
  wfc.addTile(grass);
  wfc.addTile(sand);
  wfc.addTile(water);
  return wfc;
}

describe('WaveFunction', () => {
  it('constructor sets dimensions', () => {
    const wfc = new WaveFunction(5, 3);
    expect(wfc.getWidth()).toBe(5);
    expect(wfc.getHeight()).toBe(3);
  });

  it('initialize populates all cells with all options', () => {
    const wfc = makeWFC();
    wfc.initialize();
    const cell = wfc.getCell(0, 0);
    expect(cell!.options.length).toBe(3);
    expect(cell!.collapsed).toBe(false);
  });

  it('getLowestEntropy finds uncollapsed cell', () => {
    const wfc = makeWFC();
    wfc.initialize();
    const cell = wfc.getLowestEntropy();
    expect(cell).not.toBeNull();
    expect(cell!.collapsed).toBe(false);
  });

  it('collapse sets a tile on a cell', () => {
    const wfc = makeWFC();
    wfc.initialize();
    const cell = wfc.getCell(0, 0)!;
    expect(wfc.collapse(cell)).toBe(true);
    expect(cell.collapsed).toBe(true);
    expect(cell.tileId).toBeTruthy();
    expect(cell.options.length).toBe(1);
  });

  it('collapse returns false on empty options', () => {
    const wfc = makeWFC();
    wfc.initialize();
    const cell = wfc.getCell(0, 0)!;
    cell.options = [];
    expect(wfc.collapse(cell)).toBe(false);
    expect(wfc.getContradictions()).toBe(1);
  });

  it('propagate reduces neighbor options', () => {
    const wfc = makeWFC();
    wfc.initialize();
    const cell = wfc.getCell(1, 1)!;
    cell.options = ['water'];
    cell.tileId = 'water';
    cell.collapsed = true;
    wfc.propagate(cell);
    // Neighbor at (1,0) should not contain 'grass' (water doesn't allow grass)
    const neighbor = wfc.getCell(1, 0)!;
    expect(neighbor.options).not.toContain('grass');
  });

  it('solve completes all cells', () => {
    const wfc = makeWFC(3, 3);
    const success = wfc.solve();
    expect(success).toBe(true);
    expect(wfc.isComplete()).toBe(true);
  });

  it('solve is deterministic with same seed', () => {
    const a = makeWFC(3, 3);
    const b = makeWFC(3, 3);
    a.solve();
    b.solve();
    const gridA = a.getGrid();
    const gridB = b.getGrid();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(gridA[y][x].tileId).toBe(gridB[y][x].tileId);
      }
    }
  });

  it('all solved tiles respect adjacency', () => {
    const wfc = makeWFC(4, 4);
    wfc.solve();
    const grid = wfc.getGrid();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cell = grid[y][x];
        if (!cell.tileId) continue;
        const tile = [grass, sand, water].find((t) => t.id === cell.tileId)!;
        // Check right neighbor
        if (x < 3) {
          const right = grid[y][x + 1];
          expect(tile.adjacency.right).toContain(right.tileId);
        }
        // Check down neighbor
        if (y < 3) {
          const down = grid[y + 1][x];
          expect(tile.adjacency.down).toContain(down.tileId);
        }
      }
    }
  });

  it('getGrid returns deep copy', () => {
    const wfc = makeWFC();
    wfc.initialize();
    const g1 = wfc.getGrid();
    const g2 = wfc.getGrid();
    expect(g1).not.toBe(g2);
    expect(g1[0][0]).not.toBe(g2[0][0]);
  });

  it('getContradictions starts at 0', () => {
    const wfc = makeWFC();
    wfc.initialize();
    expect(wfc.getContradictions()).toBe(0);
  });
});
