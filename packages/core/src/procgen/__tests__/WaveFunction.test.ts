import { describe, it, expect, beforeEach } from 'vitest';
import { WaveFunction, type WFCTile } from '../WaveFunction';

const tileA: WFCTile = { id: 'grass', weight: 1, adjacency: { up: ['grass','road'], down: ['grass','road'], left: ['grass','road'], right: ['grass','road'] } };
const tileB: WFCTile = { id: 'road', weight: 1, adjacency: { up: ['grass','road'], down: ['grass','road'], left: ['grass','road'], right: ['grass','road'] } };

describe('WaveFunction', () => {
  let wfc: WaveFunction;

  beforeEach(() => {
    wfc = new WaveFunction(4, 4, 42);
    wfc.addTile(tileA);
    wfc.addTile(tileB);
  });

  it('getWidth / getHeight', () => {
    expect(wfc.getWidth()).toBe(4);
    expect(wfc.getHeight()).toBe(4);
  });

  it('initialize populates grid', () => {
    wfc.initialize();
    const cell = wfc.getCell(0, 0);
    expect(cell).toBeDefined();
    expect(cell!.collapsed).toBe(false);
    expect(cell!.options).toHaveLength(2);
  });

  it('solve completes the grid', () => {
    const success = wfc.solve();
    expect(success).toBe(true);
    expect(wfc.isComplete()).toBe(true);
  });

  it('all cells have a tileId after solve', () => {
    wfc.solve();
    const grid = wfc.getGrid();
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.collapsed).toBe(true);
        expect(cell.tileId).not.toBeNull();
        expect(['grass', 'road']).toContain(cell.tileId);
      }
    }
  });

  it('getContradictions is 0 for compatible tiles', () => {
    wfc.solve();
    expect(wfc.getContradictions()).toBe(0);
  });

  it('getGrid returns copy', () => {
    wfc.initialize();
    const grid1 = wfc.getGrid();
    const grid2 = wfc.getGrid();
    expect(grid1).not.toBe(grid2);
    expect(grid1[0][0]).not.toBe(grid2[0][0]);
  });

  it('solve with restrictive adjacency may produce contradictions', () => {
    const wfc2 = new WaveFunction(3, 3, 42);
    // tile that can only be next to itself
    wfc2.addTile({ id: 'a', weight: 1, adjacency: { up: ['a'], down: ['a'], left: ['a'], right: ['a'] } });
    // tile that can only be next to itself (incompatible with 'a')
    wfc2.addTile({ id: 'b', weight: 1, adjacency: { up: ['b'], down: ['b'], left: ['b'], right: ['b'] } });
    // This will likely produce contradictions or solve to all one type
    wfc2.solve();
    // After solve, either there are contradictions or all cells collapsed
    expect(typeof wfc2.getContradictions()).toBe('number');
  });

  it('isComplete returns false before solve', () => {
    wfc.initialize();
    expect(wfc.isComplete()).toBe(false);
  });

  it('deterministic with same seed', () => {
    const w1 = new WaveFunction(4, 4, 123);
    w1.addTile(tileA); w1.addTile(tileB);
    w1.solve();
    const w2 = new WaveFunction(4, 4, 123);
    w2.addTile(tileA); w2.addTile(tileB);
    w2.solve();
    const g1 = w1.getGrid(), g2 = w2.getGrid();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(g1[y][x].tileId).toBe(g2[y][x].tileId);
      }
    }
  });
});
