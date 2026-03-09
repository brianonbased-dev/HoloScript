import { describe, it, expect, beforeEach } from 'vitest';
import { DecalSystem } from '../DecalSystem';

const normal = { x: 0, y: 1, z: 0 };
const pos = { x: 0, y: 0, z: 0 };

describe('DecalSystem', () => {
  let ds: DecalSystem;

  beforeEach(() => {
    ds = new DecalSystem();
  });

  // Spawning
  it('spawn creates decal', () => {
    const d = ds.spawn({ textureId: 'blood', position: pos, normal });
    expect(d.textureId).toBe('blood');
    expect(d.active).toBe(true);
    expect(d.age).toBe(0);
    expect(ds.getActiveCount()).toBe(1);
  });

  it('spawn enforces maxDecals', () => {
    ds.setMaxDecals(2);
    ds.spawn({ textureId: 'a', position: pos, normal });
    ds.spawn({ textureId: 'b', position: pos, normal });
    ds.spawn({ textureId: 'c', position: pos, normal });
    expect(ds.getActiveCount()).toBe(2); // oldest removed
  });

  it('remove pools decal', () => {
    const d = ds.spawn({ textureId: 'a', position: pos, normal });
    ds.remove(d.id);
    expect(ds.getActiveCount()).toBe(0);
    expect(ds.getPoolSize()).toBeGreaterThanOrEqual(1);
  });

  // Update — fade in/out and expiry
  it('fade in increases opacity', () => {
    const d = ds.spawn({ textureId: 'a', position: pos, normal, fadeInDuration: 1 });
    ds.update(0.5);
    expect(d.opacity).toBeCloseTo(0.5);
  });

  it('active opacity reaches 1 after fade in', () => {
    const d = ds.spawn({ textureId: 'a', position: pos, normal, fadeInDuration: 0.1 });
    ds.update(0.2);
    expect(d.opacity).toBe(1);
  });

  it('expired decals are removed', () => {
    ds.spawn({
      textureId: 'a',
      position: pos,
      normal,
      lifetime: 1,
      fadeInDuration: 0,
      fadeOutDuration: 0,
    });
    ds.update(2);
    expect(ds.getActiveCount()).toBe(0);
  });

  it('infinite lifetime does not expire', () => {
    ds.spawn({ textureId: 'a', position: pos, normal, lifetime: 0, fadeInDuration: 0 });
    ds.update(100);
    expect(ds.getActiveCount()).toBe(1);
  });

  // Visibility
  it('getVisible returns active visible decals', () => {
    const d = ds.spawn({ textureId: 'a', position: pos, normal, fadeInDuration: 0 });
    ds.update(0.01); // set opacity to 1
    expect(ds.getVisible().length).toBe(1);
  });

  it('getVisible respects layer mask', () => {
    ds.spawn({ textureId: 'a', position: pos, normal, layer: 2, fadeInDuration: 0 });
    ds.update(0.01);
    ds.setLayerMask(1); // layer 1 only
    expect(ds.getVisible().length).toBe(0);
  });

  it('getVisible applies frustum test', () => {
    ds.spawn({ textureId: 'a', position: { x: 100, y: 0, z: 0 }, normal, fadeInDuration: 0 });
    ds.update(0.01);
    expect(ds.getVisible((p) => p.x < 50).length).toBe(0);
  });

  it('getVisible sorts by sortOrder', () => {
    ds.spawn({ textureId: 'a', position: pos, normal, sortOrder: 2, fadeInDuration: 0 });
    ds.spawn({ textureId: 'b', position: pos, normal, sortOrder: 1, fadeInDuration: 0 });
    ds.update(0.01);
    const visible = ds.getVisible();
    expect(visible[0].sortOrder).toBeLessThanOrEqual(visible[1].sortOrder);
  });

  // Config
  it('setMaxDecals clamps to 1', () => {
    ds.setMaxDecals(-5);
    expect(ds.getMaxDecals()).toBe(1);
  });

  // Clear
  it('clear pools all decals', () => {
    ds.spawn({ textureId: 'a', position: pos, normal });
    ds.spawn({ textureId: 'b', position: pos, normal });
    ds.clear();
    expect(ds.getActiveCount()).toBe(0);
  });

  // GetDecal
  it('getDecal retrieves by id', () => {
    const d = ds.spawn({ textureId: 'a', position: pos, normal });
    expect(ds.getDecal(d.id)).toBeDefined();
    expect(ds.getDecal('nope')).toBeUndefined();
  });
});
