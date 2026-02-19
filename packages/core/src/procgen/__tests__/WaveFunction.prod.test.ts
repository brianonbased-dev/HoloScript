/**
 * WaveFunction Collapse — Production Test Suite
 *
 * Covers: tile registration, grid initialization, solve,
 * adjacency constraint propagation, weighted selection,
 * contradictions, queries.
 */
import { describe, it, expect } from 'vitest';
import { WaveFunction, type WFCTile } from '../WaveFunction';

// Simple tileset: grass and water, where grass can be next to anything
// and water can only be next to grass or water.
const GRASS: WFCTile = {
  id: 'grass', weight: 2,
  adjacency: {
    up: ['grass', 'water'], down: ['grass', 'water'],
    left: ['grass', 'water'], right: ['grass', 'water'],
  },
};

const WATER: WFCTile = {
  id: 'water', weight: 1,
  adjacency: {
    up: ['grass', 'water'], down: ['grass', 'water'],
    left: ['grass', 'water'], right: ['grass', 'water'],
  },
};

describe('WaveFunction Collapse — Production', () => {
  // ─── Tile Registration ────────────────────────────────────────────
  it('addTile registers tiles', () => {
    const wfc = new WaveFunction(4, 4, 42);
    wfc.addTile(GRASS);
    wfc.addTile(WATER);
    wfc.initialize();
    const cell = wfc.getCell(0, 0);
    expect(cell!.options).toContain('grass');
    expect(cell!.options).toContain('water');
  });

  // ─── Initialization ──────────────────────────────────────────────
  it('initialize creates grid of correct dimensions', () => {
    const wfc = new WaveFunction(5, 3, 42);
    wfc.addTile(GRASS);
    wfc.initialize();
    expect(wfc.getWidth()).toBe(5);
    expect(wfc.getHeight()).toBe(3);
    expect(wfc.getGrid().length).toBe(3);
    expect(wfc.getGrid()[0].length).toBe(5);
  });

  it('all cells start uncollapsed', () => {
    const wfc = new WaveFunction(3, 3, 42);
    wfc.addTile(GRASS);
    wfc.addTile(WATER);
    wfc.initialize();
    expect(wfc.isComplete()).toBe(false);
  });

  // ─── Solve ────────────────────────────────────────────────────────
  it('solve completes a solvable grid', () => {
    const wfc = new WaveFunction(4, 4, 42);
    wfc.addTile(GRASS);
    wfc.addTile(WATER);
    const success = wfc.solve();
    expect(success).toBe(true);
    expect(wfc.isComplete()).toBe(true);
  });

  it('every cell has a tileId after solve', () => {
    const wfc = new WaveFunction(3, 3, 42);
    wfc.addTile(GRASS);
    wfc.addTile(WATER);
    wfc.solve();
    for (const row of wfc.getGrid()) {
      for (const cell of row) {
        expect(cell.tileId).not.toBeNull();
        expect(['grass', 'water']).toContain(cell.tileId);
      }
    }
  });

  // ─── Determinism ──────────────────────────────────────────────────
  it('same seed produces same grid', () => {
    const solve = (seed: number) => {
      const wfc = new WaveFunction(4, 4, seed);
      wfc.addTile(GRASS);
      wfc.addTile(WATER);
      wfc.solve();
      return JSON.stringify(wfc.getGrid().map(row => row.map(c => c.tileId)));
    };
    expect(solve(42)).toBe(solve(42));
  });

  // ─── Contradictions ───────────────────────────────────────────────
  it('contradictions start at zero', () => {
    const wfc = new WaveFunction(3, 3, 42);
    wfc.addTile(GRASS);
    wfc.initialize();
    expect(wfc.getContradictions()).toBe(0);
  });

  // ─── Cell Queries ─────────────────────────────────────────────────
  it('getCell returns undefined for out-of-bounds', () => {
    const wfc = new WaveFunction(3, 3, 42);
    wfc.addTile(GRASS);
    wfc.initialize();
    expect(wfc.getCell(99, 99)).toBeUndefined();
  });

  // ─── Weight Influence ─────────────────────────────────────────────
  it('heavier tiles appear more often', () => {
    let grassCount = 0;
    let waterCount = 0;
    for (let seed = 0; seed < 10; seed++) {
      const wfc = new WaveFunction(5, 5, seed);
      wfc.addTile(GRASS);
      wfc.addTile(WATER);
      wfc.solve();
      for (const row of wfc.getGrid()) {
        for (const cell of row) {
          if (cell.tileId === 'grass') grassCount++;
          if (cell.tileId === 'water') waterCount++;
        }
      }
    }
    // Grass has weight 2, water weight 1, so grass should roughly dominate
    expect(grassCount).toBeGreaterThan(waterCount);
  });
});
