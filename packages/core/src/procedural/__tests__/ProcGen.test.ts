import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '../NoiseGenerator';
import { DungeonGenerator } from '../DungeonGenerator';

describe('Procedural Generation Systems', () => {
  describe('NoiseGenerator Determinism', () => {
    it('generates deterministic perlin noise for the same seed', () => {
      const seed = 12345;
      const noise1 = new NoiseGenerator({ seed });
      const noise2 = new NoiseGenerator({ seed });

      for (let x = 0; x < 10; x += 0.5) {
        for (let y = 0; y < 10; y += 0.5) {
          expect(noise1.perlin2D(x, y)).toBeCloseTo(noise2.perlin2D(x, y), 5);
        }
      }
    });

    it('generates different noise outputs for different seeds', () => {
      const noiseA = new NoiseGenerator({ seed: 100 });
      const noiseB = new NoiseGenerator({ seed: 200 });

      let differences = 0;
      for (let i = 0; i < 10; i++) {
        if (
          Math.abs(noiseA.perlin2D(i + 0.5, i + 0.5) - noiseB.perlin2D(i + 0.5, i + 0.5)) > 0.001
        ) {
          differences++;
        }
      }

      expect(differences).toBeGreaterThan(0);
    });

    it('fractal brownian motion (fbm2D) aggregates octaves deterministically', () => {
      const noise = new NoiseGenerator({ seed: 999 });
      const val1 = noise.fbm2D(0.5, 0.5, 'perlin');
      const val2 = noise.fbm2D(0.5, 0.5, 'perlin');
      expect(val1).toBe(val2);
    });
  });

  describe('DungeonGenerator Determinism', () => {
    it('generates deterministic room layouts and corridors for the same seed', () => {
      const config = { width: 50, height: 50, seed: 777, maxRooms: 5 };
      const dungeon1 = new DungeonGenerator(config);
      const output1 = dungeon1.generate();

      const dungeon2 = new DungeonGenerator(config);
      const output2 = dungeon2.generate();

      expect(output1.rooms.length).toBe(output2.rooms.length);
      expect(output1.corridors.length).toBe(output2.corridors.length);

      for (let i = 0; i < output1.rooms.length; i++) {
        expect(output1.rooms[i].x).toBe(output2.rooms[i].x);
        expect(output1.rooms[i].y).toBe(output2.rooms[i].y);
        expect(output1.rooms[i].width).toBe(output2.rooms[i].width);
        expect(output1.rooms[i].height).toBe(output2.rooms[i].height);
      }
    });

    it('ensures fully connected generation', () => {
      const dungeon = new DungeonGenerator({ width: 40, height: 40, seed: 1024, maxRooms: 8 });
      dungeon.generate();

      expect(dungeon.isFullyConnected()).toBe(true);
    });
  });
});
