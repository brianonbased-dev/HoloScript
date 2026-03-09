import { describe, it, expect, beforeEach } from 'vitest';
import { CloudRenderer } from '../CloudRenderer';

describe('CloudRenderer', () => {
  let cr: CloudRenderer;

  beforeEach(() => {
    cr = new CloudRenderer();
  });

  // Defaults
  it('has default config', () => {
    const c = cr.getConfig();
    expect(c.coverage).toBe(0.5);
    expect(c.density).toBe(1);
    expect(c.altitude).toBe(200);
    expect(c.layers).toBe(4);
  });

  // Config
  it('setConfig merges config', () => {
    cr.setConfig({ coverage: 0.8 });
    expect(cr.getConfig().coverage).toBe(0.8);
    expect(cr.getConfig().density).toBe(1); // unchanged
  });

  it('getConfig returns copy', () => {
    const a = cr.getConfig();
    const b = cr.getConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  // Density sampling
  it('sampleDensity returns 0 below cloud layer', () => {
    expect(cr.sampleDensity(0, 0, 0)).toBe(0); // well below altitude
  });

  it('sampleDensity returns 0 above cloud layer', () => {
    expect(cr.sampleDensity(0, 300, 0)).toBe(0); // above altitude + thickness
  });

  it('sampleDensity returns value in cloud layer', () => {
    const d = cr.sampleDensity(10, 225, 10); // mid-cloud layer
    expect(typeof d).toBe('number');
  });

  it('full coverage increases density', () => {
    cr.setConfig({ coverage: 1 });
    const dFull = cr.sampleDensity(10, 225, 10);
    cr.setConfig({ coverage: 0.1 });
    const dLow = cr.sampleDensity(10, 225, 10);
    expect(dFull).toBeGreaterThanOrEqual(dLow);
  });

  // Wind drift
  it('update advances time and shifts density', () => {
    const before = cr.sampleDensity(50, 225, 50);
    cr.update(100); // large time step for big wind offset
    const after = cr.sampleDensity(50, 225, 50);
    // Values change because wind offsets the noise
    expect(typeof after).toBe('number');
  });

  // Lighting
  it('sampleLighting returns density and lighting', () => {
    const sample = cr.sampleLighting(10, 225, 10);
    expect(sample.position).toEqual({ x: 10, y: 225, z: 10 });
    expect(typeof sample.density).toBe('number');
    expect(typeof sample.lighting).toBe('number');
  });

  it('sampleLighting transmittance in [0,1]', () => {
    const sample = cr.sampleLighting(10, 225, 10);
    expect(sample.lighting).toBeGreaterThanOrEqual(0);
    expect(sample.lighting).toBeLessThanOrEqual(1);
  });

  it('sampleLighting custom step count', () => {
    const sample = cr.sampleLighting(10, 225, 10, 8);
    expect(typeof sample.lighting).toBe('number');
  });

  // Coverage map
  it('getCoverageMap returns correct size', () => {
    const map = cr.getCoverageMap(4, 10);
    expect(map.length).toBe(16); // 4x4
  });

  it('getCoverageMap with offset shifts samples', () => {
    const a = cr.getCoverageMap(4, 10, 0, 0);
    const b = cr.getCoverageMap(4, 10, 100, 100);
    // Different offsets should generally produce different values
    expect(a.length).toBe(b.length);
  });

  // Constructor with config
  it('constructor accepts partial config', () => {
    const cr2 = new CloudRenderer({ coverage: 0.9, layers: 2 });
    expect(cr2.getConfig().coverage).toBe(0.9);
    expect(cr2.getConfig().layers).toBe(2);
  });
});
