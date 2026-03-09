import { describe, it, expect, beforeEach } from 'vitest';
import { LightingModel } from '../LightingModel';

describe('LightingModel', () => {
  let lm: LightingModel;

  beforeEach(() => {
    lm = new LightingModel();
  });

  // Light management
  it('addLight creates light with defaults', () => {
    const l = lm.addLight({ id: 'sun', type: 'directional' });
    expect(l.id).toBe('sun');
    expect(l.intensity).toBe(1);
    expect(l.enabled).toBe(true);
    expect(lm.getLightCount()).toBe(1);
  });

  it('getLight returns light by id', () => {
    lm.addLight({ id: 'pt1', type: 'point' });
    expect(lm.getLight('pt1')).toBeDefined();
    expect(lm.getLight('nothing')).toBeUndefined();
  });

  it('removeLight deletes light', () => {
    lm.addLight({ id: 'x', type: 'point' });
    lm.removeLight('x');
    expect(lm.getLightCount()).toBe(0);
  });

  it('enableLight toggles', () => {
    lm.addLight({ id: 'a', type: 'point' });
    lm.enableLight('a', false);
    expect(lm.getLight('a')!.enabled).toBe(false);
  });

  // Ambient
  it('getAmbient returns defaults', () => {
    const a = lm.getAmbient();
    expect(a.intensity).toBe(0.3);
  });

  it('setAmbient merges config', () => {
    lm.setAmbient({ intensity: 0.8 });
    expect(lm.getAmbient().intensity).toBe(0.8);
  });

  // GI probes
  it('sampleGI returns ambient when no probes', () => {
    const [r, g, b] = lm.sampleGI({ x: 0, y: 0, z: 0 });
    expect(r).toBeCloseTo(0.03);
  });

  it('sampleGI blends probes by distance', () => {
    lm.addGIProbe({
      id: 'p1',
      position: { x: 0, y: 0, z: 0 },
      radius: 10,
      irradiance: [1, 0, 0],
      weight: 1,
    });
    const [r, g, b] = lm.sampleGI({ x: 0, y: 0, z: 0 });
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(0);
  });

  it('sampleGI falls back to ambient when out of range', () => {
    lm.addGIProbe({
      id: 'p1',
      position: { x: 0, y: 0, z: 0 },
      radius: 5,
      irradiance: [1, 0, 0],
      weight: 1,
    });
    const [r] = lm.sampleGI({ x: 100, y: 100, z: 100 });
    expect(r).toBeCloseTo(0.03); // ambient fallback
  });

  it('removeGIProbe removes probe', () => {
    lm.addGIProbe({
      id: 'p1',
      position: { x: 0, y: 0, z: 0 },
      radius: 10,
      irradiance: [1, 0, 0],
      weight: 1,
    });
    lm.removeGIProbe('p1');
    const [r] = lm.sampleGI({ x: 0, y: 0, z: 0 });
    expect(r).toBeCloseTo(0.03);
  });

  // Attenuation
  it('directional has no attenuation', () => {
    lm.addLight({ id: 'sun', type: 'directional' });
    expect(lm.calculateAttenuation('sun', { x: 1000, y: 1000, z: 1000 })).toBe(1);
  });

  it('point light attenuates with distance', () => {
    lm.addLight({ id: 'pt', type: 'point', position: { x: 0, y: 0, z: 0 }, range: 10 });
    expect(lm.calculateAttenuation('pt', { x: 0, y: 0, z: 0 })).toBeCloseTo(1);
    expect(lm.calculateAttenuation('pt', { x: 20, y: 0, z: 0 })).toBe(0);
  });

  it('disabled light returns 0 attenuation', () => {
    lm.addLight({ id: 'pt', type: 'point' });
    lm.enableLight('pt', false);
    expect(lm.calculateAttenuation('pt', { x: 0, y: 0, z: 0 })).toBe(0);
  });

  // Visible lights
  it('getVisibleLights returns directionals always', () => {
    lm.addLight({ id: 'sun', type: 'directional' });
    const vis = lm.getVisibleLights({ x: 0, y: 0, z: 0 }, 10);
    expect(vis.length).toBe(1);
  });

  it('getVisibleLights filters disabled', () => {
    lm.addLight({ id: 'a', type: 'point' });
    lm.enableLight('a', false);
    expect(lm.getVisibleLights({ x: 0, y: 0, z: 0 }, 1000).length).toBe(0);
  });

  // Shadow casters
  it('getShadowCasters returns only shadow-casting lights', () => {
    lm.addLight({ id: 'a', type: 'directional', castShadow: true });
    lm.addLight({ id: 'b', type: 'point', castShadow: false });
    expect(lm.getShadowCasters().length).toBe(1);
    expect(lm.getShadowCasters()[0].id).toBe('a');
  });
});
