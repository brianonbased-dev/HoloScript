import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainTexturing, type TerrainLayer } from '../TerrainTexturing';

const makeLayer = (id: string): TerrainLayer => ({
  id, textureId: `tex_${id}`, tiling: { x: 1, y: 1 },
  metallic: 0, roughness: 0.5, heightBlend: false,
});

describe('TerrainTexturing', () => {
  let tt: TerrainTexturing;

  beforeEach(() => { tt = new TerrainTexturing(); });

  // Layers
  it('addLayer increases count', () => {
    tt.addLayer(makeLayer('grass'));
    expect(tt.getLayerCount()).toBe(1);
  });

  it('getLayer retrieves by index', () => {
    tt.addLayer(makeLayer('grass'));
    expect(tt.getLayer(0)?.id).toBe('grass');
    expect(tt.getLayer(99)).toBeUndefined();
  });

  it('removeLayer by id', () => {
    tt.addLayer(makeLayer('a'));
    tt.addLayer(makeLayer('b'));
    tt.removeLayer('a');
    expect(tt.getLayerCount()).toBe(1);
    expect(tt.getLayer(0)?.id).toBe('b');
  });

  it('max 16 layers', () => {
    for (let i = 0; i < 16; i++) tt.addLayer(makeLayer(`l${i}`));
    expect(() => tt.addLayer(makeLayer('l17'))).toThrow('Max 16');
  });

  // Splatmap
  it('createSplatmap initializes correctly', () => {
    const splat = tt.createSplatmap(4, 4);
    expect(splat.width).toBe(4);
    expect(splat.height).toBe(4);
    expect(splat.channels.length).toBe(4);
    expect(splat.channels[0][0]).toBe(1); // default channel
  });

  it('getSplatWeights returns defaults before splatmap', () => {
    const w = tt.getSplatWeights(0, 0);
    expect(w).toEqual([1, 0, 0, 0]);
  });

  it('paintSplatmap modifies weights', () => {
    tt.createSplatmap(4, 4);
    tt.paintSplatmap(1, 0.5, 0.5, 0.3, 0.5);
    const w = tt.getSplatWeights(0.5, 0.5);
    expect(w[1]).toBeGreaterThan(0);
  });

  it('splatmap normalizes after paint', () => {
    tt.createSplatmap(4, 4);
    tt.paintSplatmap(2, 0.5, 0.5, 0.5, 1);
    const w = tt.getSplatWeights(0.5, 0.5);
    const sum = w.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  // Triplanar
  it('triplanar defaults', () => {
    const tp = tt.getTriplanar();
    expect(tp.enabled).toBe(false);
    expect(tp.sharpness).toBe(4);
  });

  it('setTriplanar merges', () => {
    tt.setTriplanar({ enabled: true, sharpness: 8 });
    expect(tt.getTriplanar().enabled).toBe(true);
    expect(tt.getTriplanar().sharpness).toBe(8);
  });

  it('computeTriplanarWeights sums to ~1', () => {
    tt.setTriplanar({ enabled: true });
    const w = tt.computeTriplanarWeights({ x: 0, y: 1, z: 0 });
    const sum = w.x + w.y + w.z;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('computeTriplanarWeights favors dominant axis', () => {
    const w = tt.computeTriplanarWeights({ x: 0, y: 1, z: 0 });
    expect(w.y).toBeGreaterThan(w.x);
    expect(w.y).toBeGreaterThan(w.z);
  });

  // Detail layers
  it('addDetailLayer and getDetailLayers', () => {
    tt.addDetailLayer(0, 50, 4);
    tt.addDetailLayer(1, 100, 8);
    const dl = tt.getDetailLayers();
    expect(dl.length).toBe(2);
    expect(dl[0].layerIndex).toBe(0);
  });

  it('getDetailLayers returns copy', () => {
    tt.addDetailLayer(0, 50, 4);
    expect(tt.getDetailLayers()).not.toBe(tt.getDetailLayers());
  });
});
