import { describe, it, expect, beforeEach } from 'vitest';
import { VolumetricLight } from '../rendering/VolumetricLight';

// =============================================================================
// C264 — Volumetric Light
// =============================================================================

describe('VolumetricLight', () => {
  let vol: VolumetricLight;
  beforeEach(() => { vol = new VolumetricLight(); });

  it('addLight creates a light with defaults', () => {
    const l = vol.addLight({ id: 'sun' });
    expect(l.enabled).toBe(true);
    expect(l.samples).toBe(32);
  });

  it('addLight uses custom config', () => {
    const l = vol.addLight({ id: 'sun', intensity: 2, samples: 64 });
    expect(l.intensity).toBe(2);
    expect(l.samples).toBe(64);
  });

  it('removeLight deletes light', () => {
    vol.addLight({ id: 'sun' });
    vol.removeLight('sun');
    expect(vol.getLight('sun')).toBeUndefined();
  });

  it('getLightCount reflects additions', () => {
    vol.addLight({ id: 'a' });
    vol.addLight({ id: 'b' });
    expect(vol.getLightCount()).toBe(2);
  });

  it('march returns empty for disabled light', () => {
    vol.addLight({ id: 'sun', enabled: false });
    const samples = vol.march('sun', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(samples).toHaveLength(0);
  });

  it('march returns empty for unknown light', () => {
    expect(vol.march('nope', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toHaveLength(0);
  });

  it('march returns correct number of samples', () => {
    vol.addLight({ id: 'sun', samples: 16 });
    const samples = vol.march('sun', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(samples).toHaveLength(16);
  });

  it('march accumulated increases monotonically', () => {
    vol.addLight({ id: 'sun' });
    const samples = vol.march('sun', { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].accumulated).toBeGreaterThanOrEqual(samples[i - 1].accumulated);
    }
  });

  it('getScatteringAt returns 0 for disabled light', () => {
    vol.addLight({ id: 'sun', enabled: false });
    expect(vol.getScatteringAt('sun', { x: 0, y: 0, z: 0 })).toBe(0);
  });

  it('getScatteringAt returns 0 beyond maxDistance', () => {
    vol.addLight({ id: 'sun', maxDistance: 10, position: { x: 0, y: 0, z: 0 } });
    expect(vol.getScatteringAt('sun', { x: 100, y: 0, z: 0 })).toBe(0);
  });

  it('getScatteringAt positive at light position', () => {
    vol.addLight({ id: 'sun', position: { x: 0, y: 50, z: 0 } });
    const s = vol.getScatteringAt('sun', { x: 0, y: 50, z: 0 });
    expect(s).toBeGreaterThan(0);
  });

  it('getScatteringAt decreases with distance', () => {
    vol.addLight({ id: 'sun', position: { x: 0, y: 0, z: 0 }, maxDistance: 100 });
    const near = vol.getScatteringAt('sun', { x: 10, y: 0, z: 0 });
    const far = vol.getScatteringAt('sun', { x: 50, y: 0, z: 0 });
    expect(near).toBeGreaterThan(far);
  });
});
