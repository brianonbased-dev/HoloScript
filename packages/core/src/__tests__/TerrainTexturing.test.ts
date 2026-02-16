import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainTexturing } from '../terrain/TerrainTexturing';

// =============================================================================
// C299 — Terrain Texturing
// =============================================================================

describe('TerrainTexturing', () => {
  let tex: TerrainTexturing;
  beforeEach(() => { tex = new TerrainTexturing(); });

  it('adds terrain layers', () => {
    tex.addLayer({ id: 'grass', textureId: 't1', tiling: { x: 1, y: 1 }, metallic: 0, roughness: 0.8, heightBlend: false });
    expect(tex.getLayerCount()).toBe(1);
    expect(tex.getLayer(0)?.id).toBe('grass');
  });

  it('throws when exceeding 16 layers', () => {
    for (let i = 0; i < 16; i++) {
      tex.addLayer({ id: `l${i}`, textureId: `t${i}`, tiling: { x: 1, y: 1 }, metallic: 0, roughness: 0.5, heightBlend: false });
    }
    expect(() => tex.addLayer({ id: 'overflow', textureId: 'x', tiling: { x: 1, y: 1 }, metallic: 0, roughness: 0.5, heightBlend: false })).toThrow('Max 16');
  });

  it('removes a layer by id', () => {
    tex.addLayer({ id: 'dirt', textureId: 't2', tiling: { x: 1, y: 1 }, metallic: 0, roughness: 0.9, heightBlend: false });
    tex.removeLayer('dirt');
    expect(tex.getLayerCount()).toBe(0);
  });

  it('creates splatmap with default channel', () => {
    const splat = tex.createSplatmap(8, 8);
    expect(splat.channels).toHaveLength(4);
    expect(splat.channels[0][0]).toBe(1); // first channel defaults to 1
    expect(splat.channels[1][0]).toBe(0);
  });

  it('getSplatWeights returns normalized weights', () => {
    tex.createSplatmap(4, 4);
    const w = tex.getSplatWeights(0, 0);
    expect(w[0]).toBeCloseTo(1);
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
  });

  it('paintSplatmap increases target channel', () => {
    tex.createSplatmap(16, 16);
    tex.paintSplatmap(1, 0.5, 0.5, 0.1, 0.5);
    const w = tex.getSplatWeights(0.5, 0.5);
    expect(w[1]).toBeGreaterThan(0);
  });

  it('splatmap channels stay normalized after painting', () => {
    tex.createSplatmap(8, 8);
    tex.paintSplatmap(2, 0.5, 0.5, 0.2, 1);
    const w = tex.getSplatWeights(0.5, 0.5);
    const sum = w.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('triplanar config defaults and updates', () => {
    expect(tex.getTriplanar().enabled).toBe(false);
    tex.setTriplanar({ enabled: true, sharpness: 8 });
    expect(tex.getTriplanar().enabled).toBe(true);
    expect(tex.getTriplanar().sharpness).toBe(8);
  });

  it('computeTriplanarWeights sums to 1', () => {
    const w = tex.computeTriplanarWeights({ x: 0.5, y: 0.7, z: 0.3 });
    const sum = w.x + w.y + w.z;
    expect(sum).toBeCloseTo(1);
  });

  it('triplanar sharpness concentrates weight on dominant axis', () => {
    tex.setTriplanar({ sharpness: 8 });
    const w = tex.computeTriplanarWeights({ x: 0, y: 1, z: 0 });
    expect(w.y).toBeCloseTo(1);
  });

  it('detail layers are tracked', () => {
    tex.addDetailLayer(0, 50, 4);
    tex.addDetailLayer(1, 100, 8);
    expect(tex.getDetailLayers()).toHaveLength(2);
  });
});
