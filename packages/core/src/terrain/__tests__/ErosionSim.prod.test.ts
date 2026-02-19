/**
 * ErosionSim — Production Test Suite
 *
 * Covers: construction (defaults), setConfig/getConfig,
 * hydraulicErode (non-zero eroded/deposited, result fields, heightmap mutation,
 * deterministic with same seed), thermalErode (non-zero transfer, iteration override,
 * flattens steep slopes), small vs large heightmaps.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ErosionSim } from '../ErosionSim';

function flatMap(w: number, h: number, val = 0.5): Float32Array {
  return new Float32Array(w * h).fill(val);
}

function rampMap(w: number, h: number): Float32Array {
  const map = new Float32Array(w * h);
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++)
      map[z * w + x] = (h - z) / h; // high at top, low at bottom
  return map;
}

describe('ErosionSim — Production', () => {
  let sim: ErosionSim;

  beforeEach(() => {
    // Use small iteration count for speed
    sim = new ErosionSim({ iterations: 100, seed: 42 });
  });

  // ─── Construction ─────────────────────────────────────────────────
  it('getConfig returns default values', () => {
    const fullSim = new ErosionSim();
    const cfg = fullSim.getConfig();
    expect(cfg.iterations).toBe(50000);
    expect(cfg.seed).toBe(42);
    expect(cfg.solubility).toBeGreaterThan(0);
  });

  it('constructor accepts partial config', () => {
    const s = new ErosionSim({ iterations: 200, seed: 99 });
    expect(s.getConfig().iterations).toBe(200);
    expect(s.getConfig().seed).toBe(99);
  });

  // ─── setConfig / getConfig ────────────────────────────────────────
  it('setConfig updates values', () => {
    sim.setConfig({ iterations: 999 });
    expect(sim.getConfig().iterations).toBe(999);
  });

  it('getConfig returns copy (mutation safety)', () => {
    const cfg = sim.getConfig();
    cfg.iterations = 1;
    expect(sim.getConfig().iterations).toBe(100);
  });

  // ─── hydraulicErode — result fields ───────────────────────────────
  it('hydraulicErode returns correct iteration count', () => {
    const map = rampMap(10, 10);
    const result = sim.hydraulicErode(map, 10, 10);
    expect(result.iterations).toBe(100);
  });

  it('hydraulicErode result has non-negative totalEroded and totalDeposited', () => {
    const map = rampMap(10, 10);
    const result = sim.hydraulicErode(map, 10, 10);
    expect(result.totalEroded).toBeGreaterThanOrEqual(0);
    expect(result.totalDeposited).toBeGreaterThanOrEqual(0);
  });

  it('hydraulicErode mutates heightmap on sloped terrain', () => {
    const map = rampMap(16, 16);
    const original = Float32Array.from(map);
    sim.hydraulicErode(map, 16, 16);
    let changed = false;
    for (let i = 0; i < map.length; i++) {
      if (Math.abs(map[i] - original[i]) > 1e-7) { changed = true; break; }
    }
    expect(changed).toBe(true);
  });

  it('hydraulicErode maxDepthChange >= 0', () => {
    const map = rampMap(10, 10);
    const result = sim.hydraulicErode(map, 10, 10);
    expect(result.maxDepthChange).toBeGreaterThanOrEqual(0);
  });

  it('hydraulicErode is deterministic with same seed', () => {
    const map1 = rampMap(8, 8);
    const map2 = rampMap(8, 8);
    new ErosionSim({ iterations: 50, seed: 7 }).hydraulicErode(map1, 8, 8);
    new ErosionSim({ iterations: 50, seed: 7 }).hydraulicErode(map2, 8, 8);
    for (let i = 0; i < map1.length; i++) {
      expect(map1[i]).toBeCloseTo(map2[i], 6);
    }
  });

  it('flat heightmap has minimal erosion', () => {
    const map = flatMap(8, 8, 0.5);
    const result = sim.hydraulicErode(map, 8, 8);
    // Very little erosion on flat terrain
    expect(result.totalEroded).toBeCloseTo(0, 0);
  });

  // ─── thermalErode ────────────────────────────────────────────────
  it('thermalErode returns iteration count matching override', () => {
    const map = rampMap(10, 10);
    const result = sim.thermalErode(map, 10, 10, 5);
    expect(result.iterations).toBe(5);
  });

  it('thermalErode transfers material on steep ramp', () => {
    // rampMap slope = 1/h per cell; use thermalAngle:5 → tan(5°)≈0.087 < 0.1
    const steepSim = new ErosionSim({ iterations: 10, thermalAngle: 5, seed: 42 });
    const map = rampMap(10, 10);
    const result = steepSim.thermalErode(map, 10, 10, 10);
    expect(result.totalEroded).toBeGreaterThan(0);
    expect(result.totalDeposited).toBeGreaterThan(0);
  });

  it('thermalErode flattens steep slope', () => {
    // Use a sim with a very small thermalAngle so tan(10°)≈0.18 triggers easily
    const steep = new ErosionSim({ iterations: 10, thermalAngle: 10, seed: 42 });
    const w = 8, h = 8;
    const map = new Float32Array(w * h);
    // Set top 4 rows to height 1.0, bottom 4 to 0.0 — yields slope = 1.0/cell >> 0.18
    for (let z = 0; z < 4; z++) for (let x = 0; x < w; x++) map[z * w + x] = 1;
    const original = Float32Array.from(map);
    steep.thermalErode(map, w, h, 50);
    let moved = false;
    for (let i = 0; i < map.length; i++) {
      if (Math.abs(map[i] - original[i]) > 1e-7) { moved = true; break; }
    }
    expect(moved).toBe(true);
  });

  it('thermalErode on flat map has zero erosion', () => {
    const flatSim = new ErosionSim({ iterations: 10, thermalAngle: 10, seed: 42 });
    const map = new Float32Array(8 * 8).fill(0.5);
    const result = flatSim.thermalErode(map, 8, 8, 5);
    expect(result.totalEroded).toBeCloseTo(0, 5);
  });
});
