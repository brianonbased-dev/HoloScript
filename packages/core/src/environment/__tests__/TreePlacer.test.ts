import { describe, it, expect, beforeEach } from 'vitest';
import { TreePlacer } from '../TreePlacer';

describe('TreePlacer', () => {
  let placer: TreePlacer;

  beforeEach(() => {
    placer = new TreePlacer();
    placer.addTemplate({
      id: 'oak', meshId: 'oak_mesh', minScale: 0.8, maxScale: 1.5,
      trunkRadius: 0.5, biomes: ['forest'], probability: 1,
    });
    placer.addBiome({
      id: 'forest', name: 'Forest', density: 0.5, minSpacing: 2,
      heightRange: { min: 0, max: 100 }, slopeMax: 45,
    });
  });

  it('registers templates', () => {
    expect(placer.getTemplate('oak')).toBeDefined();
    expect(placer.getTemplateCount()).toBe(1);
  });

  it('registers biomes', () => {
    expect(placer.getBiome('forest')).toBeDefined();
  });

  it('places trees in a region', () => {
    const placed = placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 });
    expect(placed.length).toBeGreaterThan(0);
    expect(placer.getPlacedCount()).toBe(placed.length);
  });

  it('returns empty for unknown biome', () => {
    const placed = placer.placeInRegion('desert', { x: 0, z: 0, w: 10, h: 10 });
    expect(placed).toHaveLength(0);
  });

  it('respects height range', () => {
    const placed = placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 },
      () => 200, // all above max height
    );
    expect(placed).toHaveLength(0);
  });

  it('respects slope constraint', () => {
    const placed = placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 },
      () => 50, // valid height
      () => 90, // too steep
    );
    expect(placed).toHaveLength(0);
  });

  it('respects minSpacing', () => {
    const placed = placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[i].position.x - placed[j].position.x;
        const dz = placed[i].position.z - placed[j].position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        expect(dist).toBeGreaterThanOrEqual(1.9); // ~2 with float tolerance
      }
    }
  });

  it('getTreesInRadius filters by distance', () => {
    placer.placeInRegion('forest', { x: 0, z: 0, w: 20, h: 20 });
    const nearby = placer.getTreesInRadius(0, 0, 3);
    for (const t of nearby) {
      const dist = Math.sqrt(t.position.x ** 2 + t.position.z ** 2);
      expect(dist).toBeLessThanOrEqual(3);
    }
  });

  it('removeTree removes a specific tree', () => {
    const placed = placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 });
    const id = placed[0].id;
    expect(placer.removeTree(id)).toBe(true);
    expect(placer.getPlacedCount()).toBe(placed.length - 1);
  });

  it('clear removes all trees', () => {
    placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 });
    placer.clear();
    expect(placer.getPlacedCount()).toBe(0);
  });

  it('getAllTrees returns a copy', () => {
    placer.placeInRegion('forest', { x: 0, z: 0, w: 10, h: 10 });
    const all = placer.getAllTrees();
    const count = all.length;
    all.pop();
    expect(placer.getPlacedCount()).toBe(count);
  });
});
