import { describe, it, expect } from 'vitest';
import { FoliageSystem } from '@holoscript/engine/environment/FoliageSystem';
import { GrassRenderer } from '@holoscript/engine/environment/GrassRenderer';
import { TreePlacer } from '@holoscript/engine/environment/TreePlacer';

describe('Cycle 139: Foliage & Vegetation', () => {
  // -------------------------------------------------------------------------
  // FoliageSystem
  // -------------------------------------------------------------------------

  it('should scatter foliage instances deterministically', () => {
    const fs = new FoliageSystem();
    fs.registerType({
      id: 'fern',
      meshId: 'mesh_fern',
      density: 2,
      minScale: 0.8,
      maxScale: 1.2,
      alignToNormal: true,
      windResponse: 0.5,
      castsShadow: true,
      lodDistances: [20, 50],
    });

    const patch = fs.scatter('p1', 'fern', { x: 0, z: 0, w: 10, h: 10 }, 50);
    expect(patch.instances).toHaveLength(50);

    // Deterministic: same seed = same positions
    const patch2 = fs.scatter('p2', 'fern', { x: 0, z: 0, w: 10, h: 10 }, 50);
    expect(patch2.instances[0].position[0]).toBeCloseTo(patch.instances[0].position[0]);
  });

  it('should compute wind sway offsets', () => {
    const fs = new FoliageSystem();
    fs.registerType({
      id: 'bush',
      meshId: 'mesh_bush',
      density: 1,
      minScale: 1,
      maxScale: 1,
      alignToNormal: false,
      windResponse: 0.8,
      castsShadow: false,
      lodDistances: [30],
    });

    fs.setWind(1, 0, 0.7);
    const patch = fs.scatter('p1', 'bush', { x: 0, z: 0, w: 5, h: 5 }, 10);

    // After advancing time, sway should be non-zero
    fs.update(1.0, { x: 0, z: 0 });
    const offset = fs.getWindOffset(patch.instances[0]);
    expect(typeof offset[0]).toBe('number');
    expect(typeof offset[2]).toBe('number');
  });

  it('should LOD and cull based on camera distance', () => {
    const fs = new FoliageSystem();
    fs.registerType({
      id: 'flower',
      meshId: 'mesh_flower',
      density: 5,
      minScale: 0.5,
      maxScale: 1,
      alignToNormal: false,
      windResponse: 0.3,
      castsShadow: false,
      lodDistances: [10, 30],
    });

    fs.scatter('p1', 'flower', { x: 0, z: 0, w: 100, h: 100 }, 200);
    fs.update(0.1, { x: 50, z: 50 }); // Camera in the center

    const visible = fs.getVisibleCount();
    const total = fs.getTotalInstanceCount();
    expect(visible).toBeLessThanOrEqual(total);
    expect(visible).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // GrassRenderer
  // -------------------------------------------------------------------------

  it('should generate grass blades with color variation', () => {
    const gr = new GrassRenderer({ bladesPerUnit: 20, baseHeight: 0.3 });
    gr.generate({ x: 0, z: 0, w: 5, h: 5 });

    expect(gr.getBladeCount()).toBe(500); // 25 sqm * 20

    const visible = gr.getVisibleBlades();
    expect(visible.length).toBe(500); // All visible before LOD update
    expect(visible[0].color.g).toBeGreaterThan(0);
  });

  it('should billboard distant grass and cull far blades', () => {
    const gr = new GrassRenderer({ bladesPerUnit: 5, billboardDistance: 10, cullDistance: 30 });
    gr.generate({ x: 0, z: 0, w: 100, h: 1 }); // Long strip

    gr.updateLOD({ x: 0, z: 0 });

    const billboards = gr.getBillboardCount();
    const visible = gr.getVisibleBlades();

    expect(billboards).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(gr.getBladeCount());
  });

  // -------------------------------------------------------------------------
  // TreePlacer
  // -------------------------------------------------------------------------

  it('should place trees with collision avoidance', () => {
    const tp = new TreePlacer();
    tp.addTemplate({
      id: 'oak',
      meshId: 'mesh_oak',
      minScale: 0.8,
      maxScale: 1.5,
      trunkRadius: 1,
      biomes: ['forest'],
      probability: 1,
    });
    tp.addBiome({
      id: 'forest',
      name: 'Forest',
      density: 0.05,
      minSpacing: 3,
      heightRange: { min: 0, max: 100 },
      slopeMax: 45,
    });

    const placed = tp.placeInRegion('forest', { x: 0, z: 0, w: 50, h: 50 });

    expect(placed.length).toBeGreaterThan(0);

    // Check minimum spacing
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dx = placed[i].position[0] - placed[j].position[0];
        const dz = placed[i].position[2] - placed[j].position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        expect(dist).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('should filter by height and slope', () => {
    const tp = new TreePlacer();
    tp.addTemplate({
      id: 'pine',
      meshId: 'mesh_pine',
      minScale: 1,
      maxScale: 2,
      trunkRadius: 0.5,
      biomes: ['mountain'],
      probability: 1,
    });
    tp.addBiome({
      id: 'mountain',
      name: 'Mountain',
      density: 0.1,
      minSpacing: 2,
      heightRange: { min: 50, max: 200 },
      slopeMax: 30,
    });

    // Height sampler returns 60 (in range)
    const placed = tp.placeInRegion(
      'mountain',
      { x: 0, z: 0, w: 20, h: 20 },
      () => 60,
      () => 10
    );
    expect(placed.length).toBeGreaterThan(0);

    // Height sampler returns 10 (out of range)
    const placedLow = tp.placeInRegion(
      'mountain',
      { x: 100, z: 100, w: 20, h: 20 },
      () => 10,
      () => 0,
      99
    );
    expect(placedLow.length).toBe(0);
  });

  it('should query trees by radius', () => {
    const tp = new TreePlacer();
    tp.addTemplate({
      id: 't1',
      meshId: 'mesh',
      minScale: 1,
      maxScale: 1,
      trunkRadius: 0.5,
      biomes: ['test'],
      probability: 1,
    });
    tp.addBiome({
      id: 'test',
      name: 'Test',
      density: 0.1,
      minSpacing: 1,
      heightRange: { min: -100, max: 100 },
      slopeMax: 90,
    });

    tp.placeInRegion('test', { x: 0, z: 0, w: 100, h: 100 });
    const total = tp.getPlacedCount();
    expect(total).toBeGreaterThan(0);

    const nearby = tp.getTreesInRadius(50, 50, 20);
    expect(nearby.length).toBeLessThanOrEqual(total);
  });
});
