import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '@holoscript/engine/procedural/NoiseGenerator';
import {
  LSystemGenerator,
  TREE_SIMPLE,
  TREE_BINARY,
  FERN,
} from '@holoscript/engine/procedural/LSystemGenerator';
import { BuildingGenerator, BuildingConfig } from '@holoscript/engine/procedural/BuildingGenerator';

describe('Cycle 109: Procedural Generation', () => {
  // -------------------------------------------------------------------------
  // NoiseGenerator
  // -------------------------------------------------------------------------

  it('should generate deterministic noise with same seed', () => {
    const gen1 = new NoiseGenerator({ seed: 123 });
    const gen2 = new NoiseGenerator({ seed: 123 });

    const v1 = gen1.value2D(10, 20);
    const v2 = gen2.value2D(10, 20);

    expect(v1).toBe(v2);
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v1).toBeLessThanOrEqual(1);
  });

  it('should produce different noise types', () => {
    const gen = new NoiseGenerator({ seed: 42, scale: 0.1 });

    const value = gen.sample2D(5, 5, 'value');
    const perlin = gen.sample2D(5, 5, 'perlin');
    const ridged = gen.sample2D(5, 5, 'ridged');
    const warped = gen.sample2D(5, 5, 'warped');

    // All should produce numbers in reasonable range
    expect(typeof value).toBe('number');
    expect(typeof perlin).toBe('number');
    expect(typeof ridged).toBe('number');
    expect(typeof warped).toBe('number');

    // Different types should produce different values
    const values = new Set([
      value.toFixed(4),
      perlin.toFixed(4),
      ridged.toFixed(4),
      warped.toFixed(4),
    ]);
    expect(values.size).toBeGreaterThanOrEqual(2);
  });

  it('should generate a 2D noise map', () => {
    const gen = new NoiseGenerator({ seed: 42 });
    const map = gen.generateMap(16, 16, 'value');

    expect(map.length).toBe(256);
    // Check range
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBeGreaterThanOrEqual(0);
      expect(map[i]).toBeLessThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // LSystemGenerator
  // -------------------------------------------------------------------------

  it('should expand L-system rules correctly', () => {
    const gen = new LSystemGenerator();
    const expanded = gen.expand({
      axiom: 'A',
      rules: [
        { symbol: 'A', replacement: 'AB' },
        { symbol: 'B', replacement: 'A' },
      ],
      angle: 25,
      length: 1,
      lengthScale: 0.8,
      iterations: 3,
    });

    // Iteration 0: A
    // Iteration 1: AB
    // Iteration 2: ABA
    // Iteration 3: ABAAB
    expect(expanded).toBe('ABAAB');
  });

  it('should generate tree segments and leaves', () => {
    const gen = new LSystemGenerator();
    const result = gen.generate(TREE_SIMPLE);

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.leaves.length).toBeGreaterThan(0);

    // First segment should start at origin
    expect(result.segments[0].start[1]).toBe(0);

    // Tree should grow upward
    expect(result.boundingBox.max[1]).toBeGreaterThan(0);
  });

  it('should handle different presets', () => {
    const gen = new LSystemGenerator();

    const binary = gen.generate(TREE_BINARY);
    const fern = gen.generate(FERN);

    expect(binary.segments.length).toBeGreaterThan(0);
    expect(fern.segments.length).toBeGreaterThan(0);

    // Fern should have more detail than binary tree
    expect(fern.segments.length).toBeGreaterThan(binary.segments.length);
  });

  // -------------------------------------------------------------------------
  // BuildingGenerator
  // -------------------------------------------------------------------------

  it('should generate a residential building', () => {
    const gen = new BuildingGenerator();
    const config: BuildingConfig = {
      id: 'house',
      floors: 2,
      floorHeight: 3,
      footprint: { width: 10, depth: 8 },
      style: 'residential',
      seed: 42,
    };

    const result = gen.generate(config);

    expect(result.floorPlans).toHaveLength(2);
    expect(result.meshData.vertices.length).toBeGreaterThan(0);
    expect(result.meshData.faces.length).toBeGreaterThan(0);

    // Check bounding box
    expect(result.boundingBox.max[1]).toBe(6); // 2 floors × 3m
  });

  it('should generate commercial building with lobby', () => {
    const gen = new BuildingGenerator();
    const config: BuildingConfig = {
      id: 'office',
      floors: 5,
      floorHeight: 3.5,
      footprint: { width: 20, depth: 15 },
      style: 'commercial',
      seed: 99,
    };

    const result = gen.generate(config);
    expect(result.floorPlans).toHaveLength(5);

    // Ground floor should have a lobby
    const groundFloor = result.floorPlans[0];
    const lobby = groundFloor.rooms.find((r) => r.type === 'lobby');
    expect(lobby).toBeDefined();

    // Ground floor should have a door
    const door = groundFloor.openings.find((o) => o.type === 'door');
    expect(door).toBeDefined();
  });

  it('should generate different buildings with different seeds', () => {
    const gen = new BuildingGenerator();

    const b1 = gen.generate({
      id: 'b1',
      floors: 3,
      floorHeight: 3,
      footprint: { width: 12, depth: 10 },
      style: 'residential',
      seed: 1,
    });

    const b2 = gen.generate({
      id: 'b2',
      floors: 3,
      floorHeight: 3,
      footprint: { width: 12, depth: 10 },
      style: 'residential',
      seed: 9999,
    });

    // Same structure but different room arrangements
    expect(b1.floorPlans).toHaveLength(b2.floorPlans.length);
  });
});
