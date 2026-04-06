import { describe, it, expect, beforeEach } from 'vitest';
import { ErosionSim } from '@holoscript/engine/terrain/ErosionSim';

// =============================================================================
// C250 — Erosion Sim
// =============================================================================

function flatMap(w: number, h: number, val = 10): Float32Array {
  return new Float32Array(w * h).fill(val);
}

function slopedMap(w: number, h: number): Float32Array {
  const map = new Float32Array(w * h);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) map[z * w + x] = 50 - z * (50 / h);
  return map;
}

describe('ErosionSim', () => {
  it('default config has expected values', () => {
    const e = new ErosionSim();
    const c = e.getConfig();
    expect(c.iterations).toBe(50000);
    expect(c.seed).toBe(42);
  });

  it('setConfig overrides partial config', () => {
    const e = new ErosionSim();
    e.setConfig({ iterations: 100 });
    expect(e.getConfig().iterations).toBe(100);
  });

  it('hydraulicErode returns valid result', () => {
    const e = new ErosionSim({ iterations: 100 });
    const map = slopedMap(32, 32);
    const result = e.hydraulicErode(map, 32, 32);
    expect(result.iterations).toBe(100);
    expect(result.totalEroded).toBeGreaterThanOrEqual(0);
    expect(result.totalDeposited).toBeGreaterThanOrEqual(0);
  });

  it('hydraulicErode modifies heightmap', () => {
    const e = new ErosionSim({ iterations: 500 });
    const map = slopedMap(32, 32);
    const original = new Float32Array(map);
    e.hydraulicErode(map, 32, 32);
    let changed = false;
    for (let i = 0; i < map.length; i++) {
      if (Math.abs(map[i] - original[i]) > 1e-6) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('hydraulicErode on flat map changes very little', () => {
    const e = new ErosionSim({ iterations: 100 });
    const map = flatMap(16, 16, 5);
    const result = e.hydraulicErode(map, 16, 16);
    expect(result.maxDepthChange).toBeLessThan(1);
  });

  it('thermalErode returns valid result', () => {
    const e = new ErosionSim({ thermalAngle: 30 });
    const map = slopedMap(16, 16);
    const result = e.thermalErode(map, 16, 16, 10);
    expect(result.iterations).toBe(10);
    expect(result.totalEroded).toBeGreaterThanOrEqual(0);
  });

  it('thermalErode erodes steep terrain', () => {
    const e = new ErosionSim({ thermalAngle: 10, thermalRate: 0.8 });
    const map = slopedMap(16, 16);
    const result = e.thermalErode(map, 16, 16, 50);
    // Steep sloped map should produce erosion
    expect(result.totalEroded).toBeGreaterThan(0);
    expect(result.totalDeposited).toBeGreaterThan(0);
  });

  it('seed produces deterministic results', () => {
    const map1 = slopedMap(16, 16);
    const map2 = slopedMap(16, 16);
    new ErosionSim({ iterations: 200, seed: 123 }).hydraulicErode(map1, 16, 16);
    new ErosionSim({ iterations: 200, seed: 123 }).hydraulicErode(map2, 16, 16);
    expect(map1).toEqual(map2);
  });

  it('different seeds produce different results', () => {
    const map1 = slopedMap(16, 16);
    const map2 = slopedMap(16, 16);
    new ErosionSim({ iterations: 200, seed: 1 }).hydraulicErode(map1, 16, 16);
    new ErosionSim({ iterations: 200, seed: 999 }).hydraulicErode(map2, 16, 16);
    let same = true;
    for (let i = 0; i < map1.length; i++) {
      if (Math.abs(map1[i] - map2[i]) > 1e-6) {
        same = false;
        break;
      }
    }
    expect(same).toBe(false);
  });

  it('thermalErode on flat map is no-op', () => {
    const e = new ErosionSim();
    const map = flatMap(16, 16, 10);
    const result = e.thermalErode(map, 16, 16, 5);
    expect(result.totalEroded).toBe(0);
  });
});
