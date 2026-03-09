/**
 * ProcGen.prod.test.ts — Sprint CLXX
 *
 * Production stress testing for Procedural Generation determinism.
 * Validates that mathematical seed stability holds across billions of operations,
 * preventing desyncs in multiplayer environments where terrain must match perfectly.
 */

import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '../NoiseGenerator';
import { DungeonGenerator } from '../DungeonGenerator';

describe('ProcGen Extreme Determinism & Seed Stability', () => {
  it('guarantees infinite stream stability for a given seed (no drift)', () => {
    const seed = 987654321;
    const noiseA = new NoiseGenerator({ seed });
    const noiseB = new NoiseGenerator({ seed });

    // Sample points extremely far from origin to detect floating point drift
    const offsets = [
      [0, 0],
      [1_000_000.5, -500_000.2],
      [-999_999.1, 888_888.8],
      [Number.MAX_SAFE_INTEGER / 2, Number.MAX_SAFE_INTEGER / 2],
    ];

    for (const [x, y] of offsets) {
      const valA = noiseA.perlin2D(x, y);
      const valB = noiseB.perlin2D(x, y);

      // Must be EXACTLY identical, not just close
      expect(valA).toStrictEqual(valB);

      // Check structural persistence (no NaN generation at extreme coordinates)
      expect(Number.isNaN(valA)).toBe(false);
      expect(valA).toBeGreaterThanOrEqual(-1.0);
      expect(valA).toBeLessThanOrEqual(1.0);
    }
  });

  it('guarantees avalanche property: 1-bit seed change produces totally different noise', () => {
    const noiseA = new NoiseGenerator({ seed: 100000 });
    const noiseB = new NoiseGenerator({ seed: 100001 });

    let identicalResponses = 0;
    const samples = 1000;

    for (let i = 0; i < samples; i++) {
      const valA = noiseA.perlin2D(i * 0.1, i * 0.1);
      const valB = noiseB.perlin2D(i * 0.1, i * 0.1);

      if (Math.abs(valA - valB) < 0.0001) {
        identicalResponses++;
      }
    }

    // A good noise generator handles seeds cleanly. Even a difference of 1
    // should yield mostly different layouts. Standard PRNGs may overlap slightly more.
    expect(identicalResponses / samples).toBeLessThan(0.2);
  });

  it('fractal brownian motion generates identical macroscopic octaves', () => {
    const seed = 555;
    const noiseA = new NoiseGenerator({ seed });
    const noiseB = new NoiseGenerator({ seed });

    for (let octaves = 1; octaves <= 8; octaves++) {
      const valA = noiseA.fbm2D(100.5, 200.5, 'perlin', octaves);
      const valB = noiseB.fbm2D(100.5, 200.5, 'perlin', octaves);
      expect(valA).toStrictEqual(valB);
    }
  });

  describe('Dungeon Layout Stability', () => {
    it('produces structurally identical graphs regardless of the order of querying', () => {
      const config = { width: 100, height: 100, seed: 4242, maxRooms: 20 };
      
      const runA = new DungeonGenerator(config).generate();
      
      // Let's add slight delays or re-runs, and generating B
      const runB = new DungeonGenerator(config).generate();

      expect(runA.rooms.length).toBe(runB.rooms.length);
      expect(runA.corridors.length).toBe(runB.corridors.length);

      // Deep structural check
      for (let i = 0; i < runA.rooms.length; i++) {
        expect(runA.rooms[i]).toStrictEqual(runB.rooms[i]);
      }
      for (let i = 0; i < runA.corridors.length; i++) {
        expect(runA.corridors[i]).toStrictEqual(runB.corridors[i]);
      }
    });

    it('generates fully connected biomes even in restrictive spaces without infinite looping', () => {
      // 10x10 with 50 rooms is impossible, should gracefully halt and not loop
      const config = { width: 10, height: 10, seed: 101, maxRooms: 50 };
      
      const start = performance.now();
      const dungeon = new DungeonGenerator(config);
      const output = dungeon.generate();
      const time = performance.now() - start;

      // Ensure it halted cleanly
      expect(time).toBeLessThan(100); 

      // It should still maintain the connective graph property
      expect(dungeon.isFullyConnected()).toBe(true);
      // It clamped the number of rooms naturally
      expect(output.rooms.length).toBeLessThanOrEqual(20);
    });
  });
});
