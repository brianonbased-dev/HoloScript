/**
 * ProcgenSystems.prod.test.ts
 *
 * Production tests for the procgen subsystem:
 *   DungeonGenerator, NoiseGenerator, WaveFunction
 *
 * Rules: pure in-memory, deterministic (seeded RNG), no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DungeonGenerator } from '../DungeonGenerator';
import { NoiseGenerator } from '../NoiseGenerator';
import { WaveFunction, WFCTile } from '../WaveFunction';

// =============================================================================
// DungeonGenerator
// =============================================================================

describe('DungeonGenerator', () => {
  it('generates rooms within maxRooms limit', () => {
    const gen = new DungeonGenerator({ maxRooms: 5, seed: 1 });
    const { rooms } = gen.generate();
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms.length).toBeLessThanOrEqual(5);
  });

  it('all generated rooms are within dungeon bounds', () => {
    const gen = new DungeonGenerator({ width: 64, height: 64, seed: 42 });
    const { rooms } = gen.generate();
    for (const room of rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(64);
      expect(room.y + room.height).toBeLessThanOrEqual(64);
    }
  });

  it('rooms do not overlap each other', () => {
    const gen = new DungeonGenerator({ seed: 7 });
    const { rooms } = gen.generate();
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i],
          b = rooms[j];
        const overlapX = a.x < b.x + b.width + 1 && a.x + a.width + 1 > b.x;
        const overlapY = a.y < b.y + b.height + 1 && a.y + a.height + 1 > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('dungeon is fully connected', () => {
    const gen = new DungeonGenerator({ maxRooms: 8, seed: 99 });
    gen.generate();
    expect(gen.isFullyConnected()).toBe(true);
  });

  it('corridors count equals rooms−1 (sequential chain)', () => {
    const gen = new DungeonGenerator({ maxRooms: 6, seed: 10 });
    const { rooms, corridors } = gen.generate();
    if (rooms.length > 1) {
      expect(corridors.length).toBe(rooms.length - 1);
    }
  });

  it('getRooms returns same as generate output', () => {
    const gen = new DungeonGenerator({ seed: 3 });
    const { rooms } = gen.generate();
    expect(gen.getRooms().length).toBe(rooms.length);
  });

  it('getCorridors returns correct list', () => {
    const gen = new DungeonGenerator({ seed: 3 });
    const { corridors } = gen.generate();
    expect(gen.getCorridors().length).toBe(corridors.length);
  });

  it('rooms have unique IDs starting at 0', () => {
    const gen = new DungeonGenerator({ maxRooms: 4, seed: 5 });
    const { rooms } = gen.generate();
    const ids = rooms.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(Math.min(...ids)).toBe(0);
  });

  it('corridor points form a non-empty path', () => {
    const gen = new DungeonGenerator({ maxRooms: 3, seed: 2 });
    const { corridors } = gen.generate();
    for (const c of corridors) {
      expect(c.points.length).toBeGreaterThan(0);
    }
  });

  it('generates different layouts for different seeds', () => {
    const a = new DungeonGenerator({ seed: 1, maxRooms: 10 });
    const b = new DungeonGenerator({ seed: 9999, maxRooms: 10 });
    const { rooms: ra } = a.generate();
    const { rooms: rb } = b.generate();
    // At least one coordinate should differ
    const same =
      ra.length === rb.length && ra.every((r, i) => r.x === rb[i]?.x && r.y === rb[i]?.y);
    expect(same).toBe(false);
  });
});

// =============================================================================
// NoiseGenerator
// =============================================================================

describe('NoiseGenerator', () => {
  let ng: NoiseGenerator;
  beforeEach(() => {
    ng = new NoiseGenerator({ seed: 42 });
  });

  it('perlin2D returns value in roughly [-1, 1] range', () => {
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const v = ng.perlin2D(x * 0.3, y * 0.3);
        expect(v).toBeGreaterThanOrEqual(-1.1);
        expect(v).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('perlin2D is deterministic for the same seed', () => {
    const ng2 = new NoiseGenerator({ seed: 42 });
    expect(ng.perlin2D(1.5, 2.7)).toBeCloseTo(ng2.perlin2D(1.5, 2.7));
  });

  it('different seeds produce different perlin values', () => {
    const ng2 = new NoiseGenerator({ seed: 99 });
    expect(ng.perlin2D(1.1, 1.1)).not.toBeCloseTo(ng2.perlin2D(1.1, 1.1), 3);
  });

  it('value2D returns value in [0, 1] range', () => {
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const v = ng.value2D(x * 0.5, y * 0.5);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('worley2D returns value in [0, 1] range', () => {
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const v = ng.worley2D(x * 0.5, y * 0.5);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.1); // can slightly exceed 1 at far distances
      }
    }
  });

  it('fbm2D returns finite number', () => {
    const v = ng.fbm2D(1.0, 2.0);
    expect(isFinite(v)).toBe(true);
  });

  it('fbm2D with value type returns finite number', () => {
    const v = ng.fbm2D(1.0, 2.0, 'value');
    expect(isFinite(v)).toBe(true);
  });

  it('worley2D via sample2D returns finite number', () => {
    const v = ng.sample2D(1.0, 2.0, 'worley');
    expect(isFinite(v)).toBe(true);
  });

  it('warped2D returns finite number', () => {
    const v = ng.warped2D(1.0, 2.0, 3);
    expect(isFinite(v)).toBe(true);
  });

  it('getConfig returns config with the seed provided', () => {
    expect(ng.getConfig().seed).toBe(42);
  });
});

// =============================================================================
// WaveFunction (WFC)
// =============================================================================

describe('WaveFunction', () => {
  // Simple tileset: floor and wall that can go next to each other
  const makeTiles = (): WFCTile[] => [
    {
      id: 'floor',
      weight: 3,
      adjacency: {
        up: ['floor', 'wall'],
        down: ['floor', 'wall'],
        left: ['floor', 'wall'],
        right: ['floor', 'wall'],
      },
    },
    {
      id: 'wall',
      weight: 1,
      adjacency: {
        up: ['floor', 'wall'],
        down: ['floor', 'wall'],
        left: ['floor', 'wall'],
        right: ['floor', 'wall'],
      },
    },
  ];

  it('initializes grid with all options for each cell', () => {
    const wfc = new WaveFunction(3, 3, 42);
    makeTiles().forEach((t) => wfc.addTile(t));
    wfc.initialize();
    const cell = wfc.getCell(0, 0);
    expect(cell?.options.length).toBe(2);
    expect(cell?.collapsed).toBe(false);
  });

  it('getLowestEntropy returns uncollapsed cell after init', () => {
    const wfc = new WaveFunction(2, 2, 42);
    makeTiles().forEach((t) => wfc.addTile(t));
    wfc.initialize();
    const cell = wfc.getLowestEntropy();
    expect(cell).not.toBeNull();
    expect(cell!.collapsed).toBe(false);
  });

  it('collapse reduces cell to one option', () => {
    const wfc = new WaveFunction(2, 2, 42);
    makeTiles().forEach((t) => wfc.addTile(t));
    wfc.initialize();
    const cell = wfc.getCell(0, 0)!;
    const ok = wfc.collapse(cell);
    expect(ok).toBe(true);
    expect(cell.collapsed).toBe(true);
    expect(cell.options.length).toBe(1);
  });

  it('solve completes the grid', () => {
    const wfc = new WaveFunction(4, 4, 42);
    makeTiles().forEach((t) => wfc.addTile(t));
    const solved = wfc.solve();
    expect(solved).toBe(true);
    expect(wfc.isComplete()).toBe(true);
  });

  it('all cells have a tileId after solve', () => {
    const wfc = new WaveFunction(3, 3, 5);
    makeTiles().forEach((t) => wfc.addTile(t));
    wfc.solve();
    const grid = wfc.getGrid();
    for (const row of grid) {
      for (const cell of row) {
        expect(cell.tileId).not.toBeNull();
      }
    }
  });

  it('getContradictions returns 0 for a compatible tileset', () => {
    const wfc = new WaveFunction(3, 3, 42);
    makeTiles().forEach((t) => wfc.addTile(t));
    wfc.solve();
    expect(wfc.getContradictions()).toBe(0);
  });

  it('getWidth and getHeight return constructor values', () => {
    const wfc = new WaveFunction(6, 8, 1);
    expect(wfc.getWidth()).toBe(6);
    expect(wfc.getHeight()).toBe(8);
  });

  it('propagate reduces neighbor options based on adjacency', () => {
    // restricted tileset: floor can only be next to floor
    const wfc = new WaveFunction(3, 1, 42);
    wfc.addTile({
      id: 'floor',
      weight: 1,
      adjacency: { up: ['floor'], down: ['floor'], left: ['floor'], right: ['floor'] },
    });
    wfc.addTile({
      id: 'wall',
      weight: 1,
      adjacency: { up: ['wall'], down: ['wall'], left: ['wall'], right: ['wall'] },
    });
    wfc.initialize();
    const cell = wfc.getCell(1, 0)!;
    cell.options = ['floor'];
    cell.collapsed = true;
    wfc.propagate(cell);
    // neighbors on left/right can only be floor now
    expect(wfc.getCell(0, 0)!.options).toEqual(['floor']);
    expect(wfc.getCell(2, 0)!.options).toEqual(['floor']);
  });
});
