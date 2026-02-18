import { describe, it, expect, beforeEach } from 'vitest';
import { SkyRenderer } from '../SkyRenderer';

describe('SkyRenderer', () => {
  let sky: SkyRenderer;

  beforeEach(() => {
    sky = new SkyRenderer();
  });

  it('has default gradient', () => {
    const g = sky.getGradient();
    expect(g.top).toBeDefined();
    expect(g.horizon).toBeDefined();
    expect(g.bottom).toBeDefined();
  });

  it('sets and gets gradient', () => {
    const g = { top: { r: 1, g: 0, b: 0 }, horizon: { r: 0, g: 1, b: 0 }, bottom: { r: 0, g: 0, b: 1 } };
    sky.setGradient(g);
    expect(sky.getGradient().top).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('sampleGradient at t=0 returns bottom', () => {
    const c = sky.sampleGradient(0);
    const g = sky.getGradient();
    expect(c.r).toBeCloseTo(g.bottom.r);
  });

  it('sampleGradient at t=1 returns top', () => {
    const c = sky.sampleGradient(1);
    const g = sky.getGradient();
    expect(c.r).toBeCloseTo(g.top.r);
  });

  it('sampleGradient at t=0.5 returns horizon', () => {
    const c = sky.sampleGradient(0.5);
    const g = sky.getGradient();
    expect(c.r).toBeCloseTo(g.horizon.r);
  });

  it('stars are not visible by default', () => {
    expect(sky.areStarsVisible()).toBe(false);
  });

  it('sets star visibility', () => {
    sky.setStarsVisible(true);
    expect(sky.areStarsVisible()).toBe(true);
  });

  it('configures star field', () => {
    sky.setStarField({ brightness: 0.5, density: 200 });
    const sf = sky.getStarField();
    expect(sf.brightness).toBe(0.5);
    expect(sf.density).toBe(200);
  });

  it('adds cloud layers', () => {
    sky.addCloudLayer(0.5, 1000);
    sky.addCloudLayer(0.8, 2000);
    expect(sky.getCloudCount()).toBe(2);
  });

  it('removes cloud layer', () => {
    const layer = sky.addCloudLayer(0.5);
    expect(sky.removeCloudLayer(layer.id)).toBe(true);
    expect(sky.getCloudCount()).toBe(0);
  });

  it('updateClouds advances offsets', () => {
    const layer = sky.addCloudLayer(0.5, 1000, { x: 10, z: 0 });
    sky.updateClouds(1);
    const layers = sky.getCloudLayers();
    const updated = layers.find(l => l.id === layer.id)!;
    expect(updated.offset.x).toBeCloseTo(10);
  });

  it('sun defaults visible with angle 90', () => {
    const sun = sky.getSun();
    expect(sun.visible).toBe(true);
    expect(sun.angle).toBe(90);
  });

  it('setSunAngle below 0 hides sun', () => {
    sky.setSunAngle(-10);
    expect(sky.getSun().visible).toBe(false);
  });

  it('moon defaults not visible', () => {
    expect(sky.getMoon().visible).toBe(false);
  });

  it('setMoonAngle >= 0 shows moon', () => {
    sky.setMoonAngle(45);
    expect(sky.getMoon().visible).toBe(true);
  });

  it('setMoonPhase wraps around 8', () => {
    sky.setMoonPhase(10);
    expect(sky.getMoonPhase()).toBe(2);
  });

  it('applyDaytime hides stars', () => {
    sky.setStarsVisible(true);
    sky.applyDaytime();
    expect(sky.areStarsVisible()).toBe(false);
  });

  it('applyNight shows stars', () => {
    sky.applyNight();
    expect(sky.areStarsVisible()).toBe(true);
  });

  it('applySunset hides stars', () => {
    sky.setStarsVisible(true);
    sky.applySunset();
    expect(sky.areStarsVisible()).toBe(false);
  });

  it('getTotalCoverage returns max cloud coverage', () => {
    sky.addCloudLayer(0.3);
    sky.addCloudLayer(0.7);
    expect(sky.getTotalCoverage()).toBeCloseTo(0.7);
  });
});
