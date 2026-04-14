import { describe, it, expect } from 'vitest';
import { DecalSystem } from '../rendering/DecalSystem';
import { ProjectorLight } from '../rendering/ProjectorLight';
import { DecalBatcher } from '../rendering/DecalBatcher';

describe('Cycle 138: Decals & Projectors', () => {
  // -------------------------------------------------------------------------
  // DecalSystem
  // -------------------------------------------------------------------------

  it('should spawn and track decals with pooling', () => {
    const ds = new DecalSystem();
    const d1 = ds.spawn({
      textureId: 'blood',
      position: [0, 0, 0],
      normal: { x: 0, y: 1, z: 0 },
      lifetime: 5,
    });
    const d2 = ds.spawn({
      textureId: 'crack',
      position: [1, 0, 0],
      normal: { x: 0, y: 1, z: 0 },
      lifetime: 3,
    });

    expect(ds.getActiveCount()).toBe(2);

    ds.remove(d1.id);
    expect(ds.getActiveCount()).toBe(1);

    // Spawn reuses pooled instance
    const d3 = ds.spawn({
      textureId: 'scorch',
      position: [2, 0, 0],
      normal: { x: 0, y: 1, z: 0 },
    });
    expect(d3).toBeDefined();
  });

  it('should fade in/out and expire decals', () => {
    const ds = new DecalSystem();
    ds.spawn({
      textureId: 'test',
      position: [0, 0, 0],
      normal: { x: 0, y: 1, z: 0 },
      lifetime: 2,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
    });

    ds.update(0.25);
    const d = ds.getVisible()[0];
    expect(d.opacity).toBeCloseTo(0.5, 1); // Fading in

    ds.update(0.5); // t=0.75 → fully visible
    expect(ds.getVisible()[0].opacity).toBeCloseTo(1, 0);

    ds.update(1.0); // t=1.75 → fading out
    expect(ds.getVisible()[0].opacity).toBeLessThan(1);

    ds.update(0.5); // t=2.25 → expired
    expect(ds.getActiveCount()).toBe(0);
  });

  it('should enforce max decal limit', () => {
    const ds = new DecalSystem();
    ds.setMaxDecals(3);

    for (let i = 0; i < 5; i++) {
      ds.spawn({
        textureId: `tex${i}`,
        position: [i, 0, 0],
        normal: { x: 0, y: 1, z: 0 },
      });
    }

    expect(ds.getActiveCount()).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // ProjectorLight
  // -------------------------------------------------------------------------

  it('should create projectors and test frustum containment', () => {
    const pl = new ProjectorLight();
    pl.create({
      position: [0, 10, 0],
      direction: { x: 0, y: -1, z: 0 },
      cookieTextureId: 'spotlight_cookie',
      fov: 60,
      aspectRatio: 1,
      nearClip: 1,
      farClip: 20,
      intensity: 2,
      color: { r: 1, g: 1, b: 1 },
      falloff: 'linear',
      enabled: true,
      id: 'spot1',
    });

    expect(pl.getCount()).toBe(1);

    // Point directly below at distance 5 should be in frustum
    expect(pl.isPointInFrustum('spot1', { x: 0, y: 5, z: 0 })).toBe(true);

    // Point way off to the side should not be in frustum
    expect(pl.isPointInFrustum('spot1', { x: 100, y: 5, z: 0 })).toBe(false);
  });

  it('should compute falloff attenuation', () => {
    const pl = new ProjectorLight();
    pl.create({
      id: 'p1',
      position: [0, 0, 0],
      direction: { x: 0, y: 0, z: 1 },
      cookieTextureId: 'cookie',
      fov: 90,
      aspectRatio: 1,
      nearClip: 0,
      farClip: 10,
      intensity: 1,
      color: { r: 1, g: 1, b: 1 },
      falloff: 'linear',
      enabled: true,
    });

    expect(pl.computeAttenuation('p1', 0)).toBe(1);
    expect(pl.computeAttenuation('p1', 5)).toBeCloseTo(0.5, 1);
    expect(pl.computeAttenuation('p1', 10)).toBeCloseTo(0, 1);
  });

  // -------------------------------------------------------------------------
  // DecalBatcher
  // -------------------------------------------------------------------------

  it('should batch instances by texture and apply LOD', () => {
    const batcher = new DecalBatcher();
    batcher.setLODDistances([10, 30, 60]);

    for (let i = 0; i < 10; i++) {
      batcher.addInstance({
        id: `d${i}`,
        textureId: i < 5 ? 'blood' : 'scorch',
        position: [i * 5, 0, 0],
        scale: [1, 1, 1 ],
        rotation: [0, 0, 0, 1 ],
        opacity: 1,
        lodLevel: 0,
      });
    }

    const batches = batcher.buildBatches({ x: 0, y: 0, z: 0 });
    expect(batches.length).toBeGreaterThan(0);

    const stats = batcher.getStats();
    expect(stats.totalInstances).toBe(10);
    expect(stats.drawnCount).toBeGreaterThan(0);
  });

  it('should cull instances outside frustum', () => {
    const batcher = new DecalBatcher();

    batcher.addInstance({
      id: 'visible',
      textureId: 'tex',
      position: [5, 0, 0],
      scale: [1, 1, 1 ],
      rotation: [0, 0, 0, 1 ],
      opacity: 1,
      lodLevel: 0,
    });
    batcher.addInstance({
      id: 'hidden',
      textureId: 'tex',
      position: [500, 0, 0],
      scale: [1, 1, 1 ],
      rotation: [0, 0, 0, 1 ],
      opacity: 1,
      lodLevel: 0,
    });

    const batches = batcher.buildBatches(
      { x: 0, y: 0, z: 0 },
      (pos) => pos.x < 100 // Simple frustum test
    );

    const stats = batcher.getStats();
    expect(stats.culledCount).toBe(1);
    expect(stats.drawnCount).toBe(1);
  });
});
