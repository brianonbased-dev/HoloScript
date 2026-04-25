import { describe, it, expect, beforeEach } from 'vitest';
import { SkyRenderer } from '@holoscript/engine/environment/SkyRenderer';

// =============================================================================
// C306 — SkyRenderer
// =============================================================================

describe('SkyRenderer', () => {
  let sky: SkyRenderer;
  beforeEach(() => {
    sky = new SkyRenderer();
  });

  it('sampleGradient at 0 returns bottom color', () => {
    const c = sky.sampleGradient(0);
    const g = sky.getGradient();
    expect(c.r).toBeCloseTo(g.bottom.r);
    expect(c.g).toBeCloseTo(g.bottom.g);
  });

  it('sampleGradient at 0.5 returns horizon color', () => {
    const c = sky.sampleGradient(0.5);
    const g = sky.getGradient();
    expect(c.r).toBeCloseTo(g.horizon.r);
  });

  it('sampleGradient at 1 returns top color', () => {
    const c = sky.sampleGradient(1);
    const g = sky.getGradient();
    expect(c.r).toBeCloseTo(g.top.r);
  });

  it('addCloudLayer adds and tracks layers', () => {
    sky.addCloudLayer(0.5, 1000);
    sky.addCloudLayer(0.8, 2000);
    expect(sky.getCloudCount()).toBe(2);
  });

  it('removeCloudLayer deletes a layer', () => {
    const layer = sky.addCloudLayer(0.5);
    sky.removeCloudLayer(layer.id);
    expect(sky.getCloudCount()).toBe(0);
  });

  it('updateClouds advances offsets', () => {
    const layer = sky.addCloudLayer(0.5, 1000, [10, 0, 5]);
    sky.updateClouds(2);
    const layers = sky.getCloudLayers();
    expect(layers[0].offset[0]).toBeCloseTo(20);
    expect(layers[0].offset[2]).toBeCloseTo(10);
  });

  it('setSunAngle controls visibility', () => {
    sky.setSunAngle(45);
    expect(sky.getSun().visible).toBe(true);
    sky.setSunAngle(-10);
    expect(sky.getSun().visible).toBe(false);
  });

  it('setMoonPhase wraps modulo 8', () => {
    sky.setMoonPhase(10);
    expect(sky.getMoonPhase()).toBe(2);
  });

  it('applyNight enables stars', () => {
    sky.applyNight();
    expect(sky.areStarsVisible()).toBe(true);
  });

  it('applyDaytime disables stars', () => {
    sky.setStarsVisible(true);
    sky.applyDaytime();
    expect(sky.areStarsVisible()).toBe(false);
  });

  it('getTotalCoverage returns max layer coverage', () => {
    sky.addCloudLayer(0.3);
    sky.addCloudLayer(0.7);
    expect(sky.getTotalCoverage()).toBeCloseTo(0.7);
  });
});
