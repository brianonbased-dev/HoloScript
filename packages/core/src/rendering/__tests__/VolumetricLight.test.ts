import { describe, it, expect, beforeEach } from 'vitest';
import { VolumetricLight } from '../VolumetricLight';

describe('VolumetricLight', () => {
  let vl: VolumetricLight;

  beforeEach(() => {
    vl = new VolumetricLight();
  });

  // Management
  it('addLight creates with defaults', () => {
    const l = vl.addLight({ id: 'god' });
    expect(l.id).toBe('god');
    expect(l.samples).toBe(32);
    expect(l.enabled).toBe(true);
    expect(vl.getLightCount()).toBe(1);
  });

  it('getLight and removeLight', () => {
    vl.addLight({ id: 'a' });
    expect(vl.getLight('a')).toBeDefined();
    vl.removeLight('a');
    expect(vl.getLight('a')).toBeUndefined();
    expect(vl.getLightCount()).toBe(0);
  });

  // March
  it('march returns empty for unknown light', () => {
    expect(vl.march('nope', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual([]);
  });

  it('march returns empty for disabled light', () => {
    vl.addLight({ id: 'a', enabled: false });
    expect(vl.march('a', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual([]);
  });

  it('march returns correct sample count', () => {
    vl.addLight({ id: 'a', samples: 16 });
    const samples = vl.march('a', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(samples.length).toBe(16);
  });

  it('march samples have increasing accumulated values', () => {
    vl.addLight({ id: 'a', samples: 8 });
    const samples = vl.march('a', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].accumulated).toBeGreaterThanOrEqual(samples[i - 1].accumulated);
    }
  });

  it('march samples have correct step indices', () => {
    vl.addLight({ id: 'a', samples: 4 });
    const samples = vl.march('a', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(samples.map((s) => s.step)).toEqual([0, 1, 2, 3]);
  });

  // Scattering query
  it('getScatteringAt returns 0 for unknown light', () => {
    expect(vl.getScatteringAt('nope', { x: 0, y: 0, z: 0 })).toBe(0);
  });

  it('getScatteringAt returns 0 when out of range', () => {
    vl.addLight({ id: 'a', maxDistance: 10 });
    expect(vl.getScatteringAt('a', { x: 1000, y: 0, z: 0 })).toBe(0);
  });

  it('getScatteringAt returns positive in range', () => {
    vl.addLight({ id: 'a', position: { x: 0, y: 50, z: 0 }, maxDistance: 100 });
    const s = vl.getScatteringAt('a', { x: 0, y: 50, z: 0 });
    expect(s).toBeGreaterThan(0);
  });

  it('getScatteringAt decreases with distance', () => {
    vl.addLight({ id: 'a', position: { x: 0, y: 0, z: 0 }, maxDistance: 100 });
    const near = vl.getScatteringAt('a', { x: 10, y: 0, z: 0 });
    const far = vl.getScatteringAt('a', { x: 80, y: 0, z: 0 });
    expect(near).toBeGreaterThan(far);
  });
});
