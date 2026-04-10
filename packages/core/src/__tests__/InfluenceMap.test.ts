import { describe, it, expect, beforeEach } from 'vitest';
import { InfluenceMap } from '../ai/InfluenceMap';
import type { InfluenceConfig } from '../ai/InfluenceMap';

// =============================================================================
// C233 — Influence Map
// =============================================================================

const CFG: InfluenceConfig = {
  width: 10,
  height: 10,
  cellSize: 1,
  decayRate: 0.1,
  propagationRate: 0.2,
  maxValue: 100,
};

describe('InfluenceMap', () => {
  let map: InfluenceMap;
  beforeEach(() => {
    map = new InfluenceMap(CFG);
  });

  it('addLayer creates named layer', () => {
    map.addLayer('threat');
    expect(map.getLayerNames()).toContain('threat');
  });

  it('removeLayer removes layer', () => {
    map.addLayer('threat');
    map.removeLayer('threat');
    expect(map.getLayerNames()).not.toContain('threat');
  });

  it('setInfluence and getInfluence', () => {
    map.addLayer('threat');
    map.setInfluence('threat', 5, 5, 50);
    expect(map.getInfluence('threat', 5, 5)).toBe(50);
  });

  it('setInfluence clamps to maxValue', () => {
    map.addLayer('threat');
    map.setInfluence('threat', 0, 0, 200);
    expect(map.getInfluence('threat', 0, 0)).toBe(100);
  });

  it('setInfluence out of bounds is no-op', () => {
    map.addLayer('threat');
    map.setInfluence('threat', -1, 0, 50);
    map.setInfluence('threat', 99, 0, 50);
    // No crash, returns 0 for those coords
    expect(map.getInfluence('threat', -1, 0)).toBe(0);
  });

  it('addInfluence accumulates', () => {
    map.addLayer('threat');
    map.addInfluence('threat', 3, 3, 20);
    map.addInfluence('threat', 3, 3, 15);
    expect(map.getInfluence('threat', 3, 3)).toBe(35);
  });

  it('stampRadius sets radial influence', () => {
    map.addLayer('threat');
    map.stampRadius('threat', 5, 5, 2, 50);
    // Center should have influence
    expect(map.getInfluence('threat', 5, 5)).toBeGreaterThan(0);
    // Edge of radius should have falloff
    const edge = map.getInfluence('threat', 5, 3);
    const center = map.getInfluence('threat', 5, 5);
    expect(center).toBeGreaterThan(edge);
  });

  it('update applies decay', () => {
    map.addLayer('threat');
    map.setInfluence('threat', 5, 5, 100);
    const before = map.getInfluence('threat', 5, 5);
    map.update();
    const after = map.getInfluence('threat', 5, 5);
    expect(after).toBeLessThan(before);
  });

  it('update propagates to neighbors', () => {
    map.addLayer('threat');
    map.setInfluence('threat', 5, 5, 100);
    map.update();
    // Adjacent cells should get some influence via propagation
    expect(map.getInfluence('threat', 4, 5)).toBeGreaterThan(0);
    expect(map.getInfluence('threat', 6, 5)).toBeGreaterThan(0);
  });

  it('getInfluenceAtWorld converts world coords', () => {
    const cfg2: InfluenceConfig = { ...CFG, cellSize: 10 };
    const map2 = new InfluenceMap(cfg2);
    map2.addLayer('threat');
    map2.setInfluence('threat', 3, 4, 42);
    // World coords (35, 45) → grid (3, 4)
    expect(map2.getInfluenceAtWorld('threat', 35, 45)).toBe(42);
  });

  it('getMaxCell returns highest influence cell', () => {
    map.addLayer('threat');
    map.setInfluence('threat', 2, 3, 10);
    map.setInfluence('threat', 7, 8, 80);
    const max = map.getMaxCell('threat');
    expect(max.x).toBe(7);
    expect(max.y).toBe(8);
    expect(max.value).toBe(80);
  });

  it('getMaxCell returns (0,0,0) for missing layer', () => {
    const max = map.getMaxCell('nonexistent');
    expect(max).toEqual({ x: 0, y: 0, value: 0 });
  });

  it('clear resets single layer', () => {
    map.addLayer('threat');
    map.addLayer('safety');
    map.setInfluence('threat', 0, 0, 50);
    map.setInfluence('safety', 0, 0, 30);
    map.clear('threat');
    expect(map.getInfluence('threat', 0, 0)).toBe(0);
    expect(map.getInfluence('safety', 0, 0)).toBe(30);
  });

  it('clearAll resets all layers', () => {
    map.addLayer('threat');
    map.addLayer('safety');
    map.setInfluence('threat', 0, 0, 50);
    map.setInfluence('safety', 0, 0, 30);
    map.clearAll();
    expect(map.getInfluence('threat', 0, 0)).toBe(0);
    expect(map.getInfluence('safety', 0, 0)).toBe(0);
  });

  it('getInfluence returns 0 for unknown layer', () => {
    expect(map.getInfluence('nope', 0, 0)).toBe(0);
  });
});
