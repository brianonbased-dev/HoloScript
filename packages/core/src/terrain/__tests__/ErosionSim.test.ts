import { describe, it, expect, beforeEach } from 'vitest';
import { ErosionSim } from '../ErosionSim';

function flatHeightmap(w: number, h: number, val = 0.5): Float32Array {
  return new Float32Array(w * h).fill(val);
}

function peakedHeightmap(w: number, h: number): Float32Array {
  const hm = new Float32Array(w * h);
  const cx = w / 2, cz = h / 2;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dz = z - cz;
      hm[z * w + x] = 1 - Math.sqrt(dx * dx + dz * dz) / Math.max(cx, cz);
    }
  }
  return hm;
}

describe('ErosionSim', () => {
  let sim: ErosionSim;

  beforeEach(() => { sim = new ErosionSim({ iterations: 500, seed: 42 }); });

  it('default config', () => {
    const c = sim.getConfig();
    expect(c.iterations).toBe(500);
    expect(c.seed).toBe(42);
  });

  it('setConfig merges', () => {
    sim.setConfig({ rainAmount: 2 });
    expect(sim.getConfig().rainAmount).toBe(2);
    expect(sim.getConfig().seed).toBe(42);
  });

  // Hydraulic erosion
  it('hydraulicErode returns ErosionResult', () => {
    const hm = peakedHeightmap(16, 16);
    const result = sim.hydraulicErode(hm, 16, 16);
    expect(result.iterations).toBe(500);
    expect(typeof result.totalEroded).toBe('number');
    expect(typeof result.totalDeposited).toBe('number');
    expect(typeof result.maxDepthChange).toBe('number');
  });

  it('hydraulicErode modifies heightmap', () => {
    const hm = peakedHeightmap(16, 16);
    const before = hm[8 * 16 + 8]; // center
    sim.hydraulicErode(hm, 16, 16);
    // The sum of changes should be non-zero for a non-flat map
    let changed = false;
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] !== peakedHeightmap(16, 16)[i]) { changed = true; break; }
    }
    expect(changed).toBe(true);
  });

  it('hydraulicErode is deterministic with same seed', () => {
    const hm1 = peakedHeightmap(16, 16);
    const hm2 = peakedHeightmap(16, 16);
    const s1 = new ErosionSim({ iterations: 100, seed: 99 });
    const s2 = new ErosionSim({ iterations: 100, seed: 99 });
    s1.hydraulicErode(hm1, 16, 16);
    s2.hydraulicErode(hm2, 16, 16);
    for (let i = 0; i < hm1.length; i++) {
      expect(hm1[i]).toBeCloseTo(hm2[i], 10);
    }
  });

  // Thermal erosion
  it('thermalErode returns ErosionResult', () => {
    const hm = peakedHeightmap(16, 16);
    const result = sim.thermalErode(hm, 16, 16, 10);
    expect(result.iterations).toBe(10);
    expect(result.totalEroded).toBeGreaterThanOrEqual(0);
  });

  it('thermalErode smooths steep slopes', () => {
    const hm = new Float32Array(16 * 16).fill(0);
    hm[8 * 16 + 8] = 100; // extreme peak
    sim.thermalErode(hm, 16, 16, 50);
    // Should have been reduced
    expect(hm[8 * 16 + 8]).toBeLessThan(100);
  });

  it('flat map unchanged by thermal erosion', () => {
    const hm = flatHeightmap(8, 8, 1);
    const before = new Float32Array(hm);
    sim.thermalErode(hm, 8, 8, 10);
    for (let i = 0; i < hm.length; i++) {
      expect(hm[i]).toBeCloseTo(before[i], 10);
    }
  });
});
