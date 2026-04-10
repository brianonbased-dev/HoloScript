import { describe, it, expect, beforeEach } from 'vitest';
import { WaveFunction, type WFCTile } from '@holoscript/engine/procedural/WaveFunction';

// =============================================================================
// C307 — WaveFunction Collapse
// =============================================================================

function makeTiles(): WFCTile[] {
  // Simple 2-tile setup: 'land' and 'water'
  // land can be next to land or water, water can be next to water or land
  return [
    {
      id: 'land',
      weight: 1,
      adjacency: {
        up: ['land', 'water'],
        down: ['land', 'water'],
        left: ['land', 'water'],
        right: ['land', 'water'],
      },
    },
    {
      id: 'water',
      weight: 1,
      adjacency: {
        up: ['land', 'water'],
        down: ['land', 'water'],
        left: ['land', 'water'],
        right: ['land', 'water'],
      },
    },
  ];
}

describe('WaveFunction', () => {
  let wfc: WaveFunction;
  beforeEach(() => {
    wfc = new WaveFunction(3, 3, 42);
    makeTiles().forEach((t) => wfc.addTile(t));
  });

  it('initialize creates grid with all options', () => {
    wfc.initialize();
    const cell = wfc.getCell(0, 0)!;
    expect(cell.collapsed).toBe(false);
    expect(cell.options.length).toBe(2);
  });

  it('getLowestEntropy returns uncollapsed cell', () => {
    wfc.initialize();
    const cell = wfc.getLowestEntropy();
    expect(cell).not.toBeNull();
    expect(cell!.collapsed).toBe(false);
  });

  it('collapse assigns a tileId', () => {
    wfc.initialize();
    const cell = wfc.getCell(1, 1)!;
    const ok = wfc.collapse(cell);
    expect(ok).toBe(true);
    expect(cell.collapsed).toBe(true);
    expect(['land', 'water']).toContain(cell.tileId);
  });

  it('collapse fails on empty options', () => {
    wfc.initialize();
    const cell = wfc.getCell(0, 0)!;
    cell.options = [];
    const ok = wfc.collapse(cell);
    expect(ok).toBe(false);
    expect(wfc.getContradictions()).toBe(1);
  });

  it('solve completes entire grid', () => {
    const success = wfc.solve();
    expect(success).toBe(true);
    expect(wfc.isComplete()).toBe(true);
  });

  it('all cells have valid tileIds after solve', () => {
    wfc.solve();
    const grid = wfc.getGrid();
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.tileId).not.toBeNull();
        expect(['land', 'water']).toContain(cell.tileId);
      }
    }
  });

  it('propagate reduces neighbor options', () => {
    // Use restrictive tiles: 'A' can only be next to 'A'
    const wfc2 = new WaveFunction(2, 1, 99);
    wfc2.addTile({
      id: 'A',
      weight: 1,
      adjacency: { up: ['A'], down: ['A'], left: ['A'], right: ['A'] },
    });
    wfc2.addTile({
      id: 'B',
      weight: 1,
      adjacency: { up: ['B'], down: ['B'], left: ['B'], right: ['B'] },
    });
    wfc2.initialize();
    const cell0 = wfc2.getCell(0, 0)!;
    cell0.options = ['A'];
    cell0.collapsed = true;
    cell0.tileId = 'A';
    wfc2.propagate(cell0);
    const cell1 = wfc2.getCell(1, 0)!;
    expect(cell1.options).toEqual(['A']);
  });

  it('getWidth and getHeight return grid dims', () => {
    expect(wfc.getWidth()).toBe(3);
    expect(wfc.getHeight()).toBe(3);
  });

  it('deterministic with same seed', () => {
    const a = new WaveFunction(4, 4, 123);
    makeTiles().forEach((t) => a.addTile(t));
    a.solve();
    const b = new WaveFunction(4, 4, 123);
    makeTiles().forEach((t) => b.addTile(t));
    b.solve();
    const gridA = a.getGrid();
    const gridB = b.getGrid();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(gridA[y][x].tileId).toBe(gridB[y][x].tileId);
      }
    }
  });

  it('weighted tiles are biased in selection', () => {
    // Heavy-weighted 'land' should appear more often
    const wfc3 = new WaveFunction(10, 10, 42);
    wfc3.addTile({
      id: 'land',
      weight: 100,
      adjacency: {
        up: ['land', 'water'],
        down: ['land', 'water'],
        left: ['land', 'water'],
        right: ['land', 'water'],
      },
    });
    wfc3.addTile({
      id: 'water',
      weight: 1,
      adjacency: {
        up: ['land', 'water'],
        down: ['land', 'water'],
        left: ['land', 'water'],
        right: ['land', 'water'],
      },
    });
    wfc3.solve();
    let landCount = 0;
    for (const row of wfc3.getGrid()) for (const c of row) if (c.tileId === 'land') landCount++;
    expect(landCount).toBeGreaterThan(50); // Out of 100 cells
  });
});
