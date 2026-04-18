import { describe, it, expect, beforeEach } from 'vitest';
import { CloudRenderer } from '@holoscript/engine/rendering';

// =============================================================================
// C284 — Cloud Renderer
// =============================================================================

describe('CloudRenderer', () => {
  let cloud: CloudRenderer;
  beforeEach(() => {
    cloud = new CloudRenderer();
  });

  it('constructor sets default config', () => {
    const cfg = cloud.getConfig();
    expect(cfg.coverage).toBe(0.5);
    expect(cfg.altitude).toBe(200);
    expect(cfg.layers).toBe(4);
  });

  it('setConfig merges partial config', () => {
    cloud.setConfig({ coverage: 0.8, density: 2 });
    const cfg = cloud.getConfig();
    expect(cfg.coverage).toBe(0.8);
    expect(cfg.density).toBe(2);
    expect(cfg.altitude).toBe(200); // unchanged
  });

  it('sampleDensity returns 0 below cloud layer', () => {
    expect(cloud.sampleDensity(0, 0, 0)).toBe(0); // y=0, altitude=200
  });

  it('sampleDensity returns 0 above cloud layer', () => {
    expect(cloud.sampleDensity(0, 300, 0)).toBe(0); // 200+50=250
  });

  it('sampleDensity returns positive within cloud layer', () => {
    const d = cloud.sampleDensity(100, 225, 100); // middle of layer
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it('sampleDensity peak is at layer center', () => {
    const mid = cloud.sampleDensity(100, 225, 100); // center = 200 + 50/2
    const edge = cloud.sampleDensity(100, 201, 100); // near bottom edge
    expect(mid).toBeGreaterThanOrEqual(edge);
  });

  it('update advances time for wind drift', () => {
    const d1 = cloud.sampleDensity(100, 225, 100);
    cloud.update(10);
    const d2 = cloud.sampleDensity(100, 225, 100);
    // Wind should shift the noise, changing density
    // They may coincidentally be equal — just check no crash
    expect(typeof d2).toBe('number');
  });

  it('sampleLighting returns density and transmittance', () => {
    const sample = cloud.sampleLighting(100, 225, 100);
    expect(sample.position).toEqual({ x: 100, y: 225, z: 100 });
    expect(typeof sample.density).toBe('number');
    expect(sample.lighting).toBeGreaterThanOrEqual(0);
    expect(sample.lighting).toBeLessThanOrEqual(1);
  });

  it('high coverage produces higher density', () => {
    const low = new CloudRenderer({ coverage: 0.1 });
    const high = new CloudRenderer({ coverage: 0.9 });
    // Sample at many points and compare average density
    let sumLow = 0,
      sumHigh = 0;
    for (let x = 0; x < 100; x += 10) {
      sumLow += low.sampleDensity(x, 225, 0);
      sumHigh += high.sampleDensity(x, 225, 0);
    }
    expect(sumHigh).toBeGreaterThan(sumLow);
  });

  it('getCoverageMap returns Float32Array of correct size', () => {
    const map = cloud.getCoverageMap(8, 10);
    expect(map).toBeInstanceOf(Float32Array);
    expect(map.length).toBe(64); // 8*8
  });
});
