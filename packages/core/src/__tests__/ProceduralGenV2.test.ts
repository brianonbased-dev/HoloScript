import { describe, it, expect, beforeEach } from 'vitest';
import { NoiseGenerator } from '@holoscript/engine/procedural/NoiseGenerator';
import { DungeonGenerator } from '@holoscript/engine/procedural/DungeonGenerator';
import { WaveFunction } from '@holoscript/engine/procedural/WaveFunction';

describe('Procedural Generation v2 (Cycle 185)', () => {
  describe('NoiseGenerator', () => {
    let noise: NoiseGenerator;

    beforeEach(() => {
      noise = new NoiseGenerator({ seed: 42 });
    });

    it('should produce deterministic output from same seed', () => {
      const a = noise.perlin2D(1.5, 2.5);
      const noise2 = new NoiseGenerator({ seed: 42 });
      expect(noise2.perlin2D(1.5, 2.5)).toBe(a);
    });

    it('should produce values in expected range for Perlin', () => {
      for (let i = 0; i < 100; i++) {
        const v = noise.perlin2D(i * 0.1, i * 0.13);
        expect(v).toBeGreaterThanOrEqual(-1.5);
        expect(v).toBeLessThanOrEqual(1.5);
      }
    });

    it('should compute value noise', () => {
      const v = noise.value2D(3.7, 8.2);
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });

    it('should compute Worley noise', () => {
      const v = noise.worley2D(5.0, 5.0);
      expect(v).toBeGreaterThanOrEqual(0);
    });

    it('should compute FBM with octaves', () => {
      const v = noise.fbm2D(1.0, 1.0, 'perlin');
      expect(typeof v).toBe('number');
    });

    it('should compute domain warping', () => {
      const v = noise.warped2D(2.0, 3.0, 3);
      expect(typeof v).toBe('number');
    });
  });

  describe('DungeonGenerator', () => {
    let dungeon: DungeonGenerator;

    beforeEach(() => {
      dungeon = new DungeonGenerator({ seed: 42, maxRooms: 8 });
    });

    it('should generate rooms', () => {
      dungeon.generate();
      expect(dungeon.getRoomCount()).toBeGreaterThan(0);
      expect(dungeon.getRoomCount()).toBeLessThanOrEqual(8);
    });

    it('should generate corridors between rooms', () => {
      dungeon.generate();
      expect(dungeon.getCorridors().length).toBeGreaterThan(0);
    });

    it('should produce connected dungeons', () => {
      dungeon.generate();
      expect(dungeon.isFullyConnected()).toBe(true);
    });

    it('should be deterministic with same seed', () => {
      dungeon.generate();
      const rooms1 = dungeon.getRooms();

      const dungeon2 = new DungeonGenerator({ seed: 42, maxRooms: 8 });
      dungeon2.generate();
      const rooms2 = dungeon2.getRooms();

      expect(rooms1.length).toBe(rooms2.length);
      expect(rooms1[0][0]).toBe(rooms2[0][0]);
    });

    it('should place rooms within bounds', () => {
      const gen = new DungeonGenerator({ width: 32, height: 32, seed: 7 });
      gen.generate();
      for (const room of gen.getRooms()) {
        expect(room[0]).toBeGreaterThanOrEqual(0);
        expect(room[1]).toBeGreaterThanOrEqual(0);
        expect(room[0] + room.width).toBeLessThanOrEqual(32);
        expect(room[1] + room.height).toBeLessThanOrEqual(32);
      }
    });
  });

  describe('WaveFunction', () => {
    let wfc: WaveFunction;

    beforeEach(() => {
      wfc = new WaveFunction(4, 4, 42);
      wfc.addTile({
        id: 'grass',
        weight: 3,
        adjacency: {
          up: ['grass', 'water'],
          down: ['grass', 'water'],
          left: ['grass', 'water'],
          right: ['grass', 'water'],
        },
      });
      wfc.addTile({
        id: 'water',
        weight: 1,
        adjacency: {
          up: ['grass', 'water'],
          down: ['grass', 'water'],
          left: ['grass', 'water'],
          right: ['grass', 'water'],
        },
      });
    });

    it('should initialize grid with all options', () => {
      wfc.initialize();
      const cell = wfc.getCell(0, 0)!;
      expect(cell.options).toHaveLength(2);
      expect(cell.collapsed).toBe(false);
    });

    it('should solve without contradictions', () => {
      const solved = wfc.solve();
      expect(solved).toBe(true);
      expect(wfc.isComplete()).toBe(true);
    });

    it('should assign tiles to all cells', () => {
      wfc.solve();
      const grid = wfc.getGrid();
      for (const row of grid) {
        for (const cell of row) {
          expect(cell.tileId).not.toBeNull();
        }
      }
    });

    it('should be deterministic', () => {
      wfc.solve();
      const grid1 = wfc.getGrid();

      const wfc2 = new WaveFunction(4, 4, 42);
      wfc2.addTile({
        id: 'grass',
        weight: 3,
        adjacency: {
          up: ['grass', 'water'],
          down: ['grass', 'water'],
          left: ['grass', 'water'],
          right: ['grass', 'water'],
        },
      });
      wfc2.addTile({
        id: 'water',
        weight: 1,
        adjacency: {
          up: ['grass', 'water'],
          down: ['grass', 'water'],
          left: ['grass', 'water'],
          right: ['grass', 'water'],
        },
      });
      wfc2.solve();
      const grid2 = wfc2.getGrid();

      expect(grid1[0][0].tileId).toBe(grid2[0][0].tileId);
    });

    it('should report grid dimensions', () => {
      expect(wfc.getWidth()).toBe(4);
      expect(wfc.getHeight()).toBe(4);
    });
  });
});
