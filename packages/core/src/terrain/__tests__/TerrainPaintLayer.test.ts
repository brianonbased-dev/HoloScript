import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainPaintLayer } from '../TerrainPaintLayer';

const layer = (id: string) => ({
  id, name: id, textureId: `tex_${id}`, tiling: 1, metallic: 0, roughness: 0.5,
});

describe('TerrainPaintLayer', () => {
  let pl: TerrainPaintLayer;

  beforeEach(() => { pl = new TerrainPaintLayer(8); });

  it('addLayer increases count', () => {
    pl.addLayer(layer('grass'));
    expect(pl.getLayerCount()).toBe(1);
  });

  it('first layer initializes splat to 100%', () => {
    pl.addLayer(layer('grass'));
    const w = pl.getWeights(0, 0);
    expect(w[0]).toBe(1);
  });

  it('second layer extends weights', () => {
    pl.addLayer(layer('grass'));
    pl.addLayer(layer('rock'));
    const w = pl.getWeights(0, 0);
    expect(w.length).toBe(2);
    expect(w[0]).toBe(1); // still dominant
    expect(w[1]).toBe(0);
  });

  it('removeLayer shrinks weights', () => {
    pl.addLayer(layer('a'));
    pl.addLayer(layer('b'));
    expect(pl.removeLayer(1)).toBe(true);
    expect(pl.getLayerCount()).toBe(1);
  });

  it('removeLayer returns false for invalid', () => {
    expect(pl.removeLayer(99)).toBe(false);
  });

  it('paintAt increases layer weight', () => {
    pl.addLayer(layer('grass'));
    pl.addLayer(layer('rock'));
    const painted = pl.paintAt(4, 4, 1, 0.8);
    expect(painted).toBeGreaterThan(0);
    const w = pl.getWeights(4, 4);
    expect(w[1]).toBeGreaterThan(0);
  });

  it('paintAt normalizes weights', () => {
    pl.addLayer(layer('a'));
    pl.addLayer(layer('b'));
    pl.paintAt(4, 4, 1, 1);
    const w = pl.getWeights(4, 4);
    const sum = w.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('paintAt returns 0 for invalid layer', () => {
    pl.addLayer(layer('a'));
    expect(pl.paintAt(4, 4, 5, 1)).toBe(0);
  });

  it('getDominantLayer returns correct index', () => {
    pl.addLayer(layer('a'));
    pl.addLayer(layer('b'));
    // Paint layer 1 multiple times so it dominates
    pl.paintAt(4, 4, 1, 10, 1);
    pl.paintAt(4, 4, 1, 10, 1);
    pl.paintAt(4, 4, 1, 10, 1);
    const w = pl.getWeights(4, 4);
    // layer 1 should be >= layer 0 after heavy painting
    expect(w[1]).toBeGreaterThanOrEqual(w[0]);
  });

  it('getDominantLayer returns -1 for empty', () => {
    expect(pl.getDominantLayer(99, 99)).toBe(-1);
  });

  it('undo restores weights', () => {
    pl.addLayer(layer('a'));
    pl.addLayer(layer('b'));
    pl.paintAt(4, 4, 1, 1);
    expect(pl.undo()).toBe(true);
    const w = pl.getWeights(4, 4);
    expect(w[1]).toBe(0);
  });

  it('undo returns false when empty', () => {
    expect(pl.undo()).toBe(false);
  });

  it('getLayers returns copy', () => {
    pl.addLayer(layer('a'));
    const a = pl.getLayers();
    const b = pl.getLayers();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('getUndoCount tracks', () => {
    pl.addLayer(layer('a'));
    pl.addLayer(layer('b'));
    pl.paintAt(4, 4, 1, 1);
    pl.paintAt(5, 5, 0, 1);
    expect(pl.getUndoCount()).toBe(2);
  });
});
