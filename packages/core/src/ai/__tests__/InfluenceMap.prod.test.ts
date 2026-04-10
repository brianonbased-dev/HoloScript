/**
 * InfluenceMap — Production Test Suite
 *
 * Covers: layer management, setInfluence, addInfluence, stampRadius,
 * propagation/decay, getInfluence, getInfluenceAtWorld, getMaxCell,
 * clear, clearAll, bounds checking.
 */
import { describe, it, expect } from 'vitest';
import { InfluenceMap } from '@holoscript/framework/ai';

const DEFAULT_CONFIG = {
  width: 10,
  height: 10,
  cellSize: 1,
  decayRate: 0.1,
  propagationRate: 0.2,
  maxValue: 100,
};

describe('InfluenceMap — Production', () => {
  // ─── Layer Management ─────────────────────────────────────────────
  it('addLayer creates new layer', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    expect(map.getLayerNames()).toContain('threat');
  });

  it('removeLayer removes layer', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('temp');
    map.removeLayer('temp');
    expect(map.getLayerNames()).not.toContain('temp');
  });

  it('multiple layers tracked independently', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.addLayer('resource');
    expect(map.getLayerNames().sort()).toEqual(['resource', 'threat']);
  });

  // ─── Set / Get Influence ──────────────────────────────────────────
  it('setInfluence + getInfluence', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.setInfluence('threat', 3, 4, 50);
    expect(map.getInfluence('threat', 3, 4)).toBe(50);
  });

  it('getInfluence returns 0 for empty cell', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    expect(map.getInfluence('threat', 0, 0)).toBe(0);
  });

  it('getInfluence returns 0 for out-of-bounds', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    expect(map.getInfluence('threat', -1, 0)).toBe(0);
    expect(map.getInfluence('threat', 100, 0)).toBe(0);
  });

  it('setInfluence clamps to maxValue', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.setInfluence('threat', 0, 0, 999);
    expect(map.getInfluence('threat', 0, 0)).toBe(100);
  });

  // ─── Add Influence ────────────────────────────────────────────────
  it('addInfluence accumulates value', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.addInfluence('threat', 5, 5, 30);
    map.addInfluence('threat', 5, 5, 20);
    expect(map.getInfluence('threat', 5, 5)).toBe(50);
  });

  // ─── stampRadius ──────────────────────────────────────────────────
  it('stampRadius sets influence in radius', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.stampRadius('threat', 5, 5, 2, 80);
    expect(map.getInfluence('threat', 5, 5)).toBeGreaterThan(0);
    expect(map.getInfluence('threat', 4, 5)).toBeGreaterThan(0);
    expect(map.getInfluence('threat', 0, 0)).toBe(0); // outside radius
  });

  // ─── Propagation + Decay ──────────────────────────────────────────
  it('update propagates influence to neighbors', () => {
    const map = new InfluenceMap({ ...DEFAULT_CONFIG, decayRate: 0, propagationRate: 0.5 });
    map.addLayer('threat');
    map.setInfluence('threat', 5, 5, 100);
    map.update();
    expect(map.getInfluence('threat', 4, 5)).toBeGreaterThan(0);
    expect(map.getInfluence('threat', 6, 5)).toBeGreaterThan(0);
  });

  it('update decays influence', () => {
    const map = new InfluenceMap({ ...DEFAULT_CONFIG, decayRate: 0.5, propagationRate: 0 });
    map.addLayer('threat');
    map.setInfluence('threat', 5, 5, 100);
    map.update();
    expect(map.getInfluence('threat', 5, 5)).toBeLessThan(100);
  });

  // ─── World Coordinates ────────────────────────────────────────────
  it('getInfluenceAtWorld converts world to grid', () => {
    const map = new InfluenceMap({ ...DEFAULT_CONFIG, cellSize: 2 });
    map.addLayer('threat');
    map.setInfluence('threat', 2, 3, 75);
    expect(map.getInfluenceAtWorld('threat', 4, 6)).toBe(75); // wx/cellSize = 2, wy/cellSize = 3
  });

  // ─── getMaxCell ───────────────────────────────────────────────────
  it('getMaxCell finds highest influence', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.setInfluence('threat', 3, 7, 90);
    map.setInfluence('threat', 1, 1, 10);
    const max = map.getMaxCell('threat');
    expect(max.x).toBe(3);
    expect(max.y).toBe(7);
    expect(max.value).toBe(90);
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear resets single layer', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('threat');
    map.setInfluence('threat', 5, 5, 50);
    map.clear('threat');
    expect(map.getInfluence('threat', 5, 5)).toBe(0);
  });

  it('clearAll resets all layers', () => {
    const map = new InfluenceMap(DEFAULT_CONFIG);
    map.addLayer('a');
    map.addLayer('b');
    map.setInfluence('a', 0, 0, 50);
    map.setInfluence('b', 0, 0, 60);
    map.clearAll();
    expect(map.getInfluence('a', 0, 0)).toBe(0);
    expect(map.getInfluence('b', 0, 0)).toBe(0);
  });
});
