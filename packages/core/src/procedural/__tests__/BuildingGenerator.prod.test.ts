/**
 * BuildingGenerator Production Tests
 *
 * Seeded procedural building generation: floor plans, rooms, walls, mesh.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BuildingGenerator } from '../BuildingGenerator';
import type { BuildingConfig } from '../BuildingGenerator';

const BASE_CONFIG: BuildingConfig = {
  id: 'bldg-1',
  floors: 3,
  floorHeight: 3,
  footprint: { width: 20, depth: 15 },
  style: 'residential',
  seed: 42,
};

describe('BuildingGenerator — Production', () => {
  let gen: BuildingGenerator;

  beforeEach(() => {
    gen = new BuildingGenerator(42);
  });

  describe('generate', () => {
    it('produces floor plans for each floor', () => {
      const result = gen.generate(BASE_CONFIG);
      expect(result.floorPlans).toHaveLength(3);
    });

    it('floor plans have rooms and walls', () => {
      const result = gen.generate(BASE_CONFIG);
      const ground = result.floorPlans[0];
      expect(ground.rooms.length).toBeGreaterThan(0);
      expect(ground.walls.length).toBeGreaterThan(0);
    });

    it('generates mesh data', () => {
      const result = gen.generate(BASE_CONFIG);
      expect(result.meshData.vertices.length).toBeGreaterThan(0);
      expect(result.meshData.faces.length).toBeGreaterThan(0);
    });

    it('computes bounding box', () => {
      const result = gen.generate(BASE_CONFIG);
      expect(result.boundingBox.min.x).toBeLessThanOrEqual(result.boundingBox.max.x);
      expect(result.boundingBox.min.y).toBeLessThanOrEqual(result.boundingBox.max.y);
    });
  });

  describe('deterministic seed', () => {
    it('same seed produces same output', () => {
      const gen1 = new BuildingGenerator(42);
      const gen2 = new BuildingGenerator(42);
      const r1 = gen1.generate(BASE_CONFIG);
      const r2 = gen2.generate(BASE_CONFIG);
      expect(r1.floorPlans[0].rooms.length).toBe(r2.floorPlans[0].rooms.length);
    });

    it('different seed produces different output', () => {
      const gen1 = new BuildingGenerator(42);
      const gen2 = new BuildingGenerator(999);
      const r1 = gen1.generate(BASE_CONFIG);
      const r2 = gen2.generate({ ...BASE_CONFIG, seed: 999 });
      // Rooms may differ (probabilistic but near-certain)
      const s1 = JSON.stringify(r1.floorPlans[0].rooms.map(r => r.bounds));
      const s2 = JSON.stringify(r2.floorPlans[0].rooms.map(r => r.bounds));
      expect(s1).not.toBe(s2);
    });
  });

  describe('styles', () => {
    it('commercial style generates', () => {
      const result = gen.generate({ ...BASE_CONFIG, style: 'commercial' });
      expect(result.floorPlans).toHaveLength(3);
    });

    it('industrial style generates', () => {
      const result = gen.generate({ ...BASE_CONFIG, style: 'industrial' });
      expect(result.floorPlans).toHaveLength(3);
    });
  });
});
