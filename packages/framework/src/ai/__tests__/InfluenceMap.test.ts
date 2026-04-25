import { describe, it, expect, beforeEach } from 'vitest';
import { InfluenceMap } from '../InfluenceMap';

describe('InfluenceMap', () => {
  let map: InfluenceMap;

  beforeEach(() => {
    map = new InfluenceMap({
      width: 10,
      height: 10,
      cellSize: 1,
      decayRate: 0.1,
      propagationRate: 0.2,
      maxValue: 100,
    });
  });

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  it('addLayer creates a named layer', () => {
    map.addLayer('threat');
    expect(map.getLayerNames()).toContain('threat');
  });

  it('removeLayer deletes a layer', () => {
    map.addLayer('temp');
    map.removeLayer('temp');
    expect(map.getLayerNames()).not.toContain('temp');
  });

  it('getLayerNames returns all layers', () => {
    map.addLayer('a');
    map.addLayer('b');
    expect(map.getLayerNames()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  // ---------------------------------------------------------------------------
  // Influence Modification
  // ---------------------------------------------------------------------------

  it('setInfluence stores and getInfluence retrieves', () => {
    map.addLayer('test');
    map.setInfluence('test', 3, 4, 50);
    expect(map.getInfluence('test', 3, 4)).toBe(50);
  });

  it('addInfluence accumulates values', () => {
    map.addLayer('test');
    map.setInfluence('test', 0, 0, 30);
    map.addInfluence('test', 0, 0, 20);
    expect(map.getInfluence('test', 0, 0)).toBe(50);
  });

  it('setInfluence clamps to maxValue', () => {
    map.addLayer('test');
    map.setInfluence('test', 0, 0, 200); // maxValue = 100
    expect(map.getInfluence('test', 0, 0)).toBe(100);
  });

  it('out-of-bounds reads return 0', () => {
    map.addLayer('test');
    expect(map.getInfluence('test', -1, 0)).toBe(0);
    expect(map.getInfluence('test', 100, 0)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Stamp Radius
  // ---------------------------------------------------------------------------

  it('stampRadius affects cells within radius', () => {
    map.addLayer('test');
    map.stampRadius('test', 5, 5, 2, 60);
    expect(map.getInfluence('test', 5, 5)).toBeGreaterThan(0);
    expect(map.getInfluence('test', 5, 4)).toBeGreaterThan(0);
  });

  it('stampRadius does not affect cells outside radius', () => {
    map.addLayer('test');
    map.stampRadius('test', 5, 5, 1, 60);
    expect(map.getInfluence('test', 0, 0)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Update (Decay + Propagation)
  // ---------------------------------------------------------------------------

  it('update decays values', () => {
    map.addLayer('test');
    map.setInfluence('test', 5, 5, 80);
    map.update();
    expect(map.getInfluence('test', 5, 5)).toBeLessThan(80);
  });

  it('update propagates to neighbors', () => {
    map.addLayer('test');
    map.setInfluence('test', 5, 5, 80);
    map.update();
    // Neighbors should have picked up some influence
    expect(map.getInfluence('test', 5, 4)).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // World Coordinates
  // ---------------------------------------------------------------------------

  it('getInfluenceAtWorld converts world to grid', () => {
    map.addLayer('test');
    map.setInfluence('test', 3, 4, 42);
    // cellSize = 1, so world (3, 4) → grid (3, 4)
    expect(map.getInfluenceAtWorld('test', 3, 4)).toBe(42);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getMaxCell returns position and value of highest cell', () => {
    map.addLayer('test');
    map.setInfluence('test', 2, 3, 10);
    map.setInfluence('test', 7, 8, 90);
    const max = map.getMaxCell('test');
    expect(max[0]).toBe(7);
    expect(max[1]).toBe(8);
    expect(max.value).toBe(90);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear resets a single layer', () => {
    map.addLayer('test');
    map.setInfluence('test', 0, 0, 50);
    map.clear('test');
    expect(map.getInfluence('test', 0, 0)).toBe(0);
  });

  it('clearAll resets all layers', () => {
    map.addLayer('a');
    map.addLayer('b');
    map.setInfluence('a', 0, 0, 50);
    map.setInfluence('b', 0, 0, 50);
    map.clearAll();
    expect(map.getInfluence('a', 0, 0)).toBe(0);
    expect(map.getInfluence('b', 0, 0)).toBe(0);
  });
});
