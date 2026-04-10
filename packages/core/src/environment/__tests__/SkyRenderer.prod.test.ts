/**
 * SkyRenderer.prod.test.ts
 *
 * Production tests for SkyRenderer — gradient sampling, star field,
 * cloud layer management, cloud drift, sun/moon state, and time-of-day presets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkyRenderer } from '../SkyRenderer';

describe('SkyRenderer', () => {
  let sky: SkyRenderer;

  beforeEach(() => {
    sky = new SkyRenderer();
  });

  // -------------------------------------------------------------------------
  // Gradient
  // -------------------------------------------------------------------------
  describe('setGradient / getGradient', () => {
    it('default gradient has correct top colour', () => {
      const g = sky.getGradient();
      expect(g.top.b).toBeCloseTo(0.9);
    });

    it('setGradient replaces gradient', () => {
      sky.setGradient({
        top: { r: 1, g: 0, b: 0 },
        horizon: { r: 0, g: 1, b: 0 },
        bottom: { r: 0, g: 0, b: 1 },
      });
      expect(sky.getGradient().top.r).toBe(1);
    });
  });

  describe('sampleGradient()', () => {
    beforeEach(() => {
      sky.setGradient({
        top: { r: 0, g: 0, b: 1 },
        horizon: { r: 0, g: 1, b: 0 },
        bottom: { r: 1, g: 0, b: 0 },
      });
    });

    it('t=0 returns bottom colour', () => {
      const c = sky.sampleGradient(0);
      expect(c.r).toBeCloseTo(1);
    });

    it('t=0.5 returns horizon colour', () => {
      const c = sky.sampleGradient(0.5);
      expect(c.g).toBeCloseTo(1);
    });

    it('t=1 returns top colour', () => {
      const c = sky.sampleGradient(1);
      expect(c.b).toBeCloseTo(1);
    });

    it('t=0.25 is midpoint between bottom and horizon', () => {
      const c = sky.sampleGradient(0.25);
      // r lerps from 1 to 0 at t_local=0.5 → 0.5
      expect(c.r).toBeCloseTo(0.5);
    });

    it('t=0.75 is midpoint between horizon and top', () => {
      const c = sky.sampleGradient(0.75);
      // b lerps from 0 to 1 at t_local=0.5 → 0.5
      expect(c.b).toBeCloseTo(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // Stars
  // -------------------------------------------------------------------------
  describe('stars', () => {
    it('default stars are not visible', () => {
      expect(sky.areStarsVisible()).toBe(false);
    });

    it('setStarsVisible(true) makes them visible', () => {
      sky.setStarsVisible(true);
      expect(sky.areStarsVisible()).toBe(true);
    });

    it('setStarField updates partial config', () => {
      sky.setStarField({ brightness: 0.5 });
      expect(sky.getStarField().brightness).toBe(0.5);
    });

    it('setStarField preserves other fields', () => {
      const orig = sky.getStarField().seed;
      sky.setStarField({ brightness: 0.1 });
      expect(sky.getStarField().seed).toBe(orig);
    });
  });

  // -------------------------------------------------------------------------
  // Cloud layers
  // -------------------------------------------------------------------------
  describe('cloud layers', () => {
    it('initially no cloud layers', () => {
      expect(sky.getCloudCount()).toBe(0);
    });

    it('addCloudLayer returns a layer with correct coverage', () => {
      const l = sky.addCloudLayer(0.7, 1000);
      expect(l.coverage).toBe(0.7);
    });

    it('addCloudLayer increments cloud count', () => {
      sky.addCloudLayer(0.5);
      sky.addCloudLayer(0.3);
      expect(sky.getCloudCount()).toBe(2);
    });

    it('removeCloudLayer returns true and decrements count', () => {
      const l = sky.addCloudLayer(0.5);
      expect(sky.removeCloudLayer(l.id)).toBe(true);
      expect(sky.getCloudCount()).toBe(0);
    });

    it('removeCloudLayer returns false for unknown id', () => {
      expect(sky.removeCloudLayer('ghost')).toBe(false);
    });

    it('getCloudLayers returns all layers', () => {
      sky.addCloudLayer(0.4);
      sky.addCloudLayer(0.8);
      expect(sky.getCloudLayers()).toHaveLength(2);
    });

    it('addCloudLayer default speed is {x:5, z:0}', () => {
      const l = sky.addCloudLayer(0.5);
      expect(l.speed.x).toBe(5);
      expect(l.speed.z).toBe(0);
    });

    it('addCloudLayer accepts custom speed', () => {
      const l = sky.addCloudLayer(0.5, 2000, { x: 10, z: 3 });
      expect(l.speed.x).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // updateClouds
  // -------------------------------------------------------------------------
  describe('updateClouds()', () => {
    it('advances cloud offset over time', () => {
      const l = sky.addCloudLayer(0.5, 1000, { x: 10, z: 0 });
      const origX = l.offset.x;
      sky.updateClouds(2);
      const layers = sky.getCloudLayers();
      expect(layers[0].offset.x).toBeCloseTo(origX + 20);
    });

    it('multiple clouds drift independently', () => {
      sky.addCloudLayer(0.5, 500, { x: 1, z: 0 });
      sky.addCloudLayer(0.3, 1500, { x: 3, z: 0 });
      sky.updateClouds(5);
      const [a, b] = sky.getCloudLayers();
      expect(a.offset.x).toBeCloseTo(5);
      expect(b.offset.x).toBeCloseTo(15);
    });
  });

  // -------------------------------------------------------------------------
  // Sun / Moon
  // -------------------------------------------------------------------------
  describe('setSunAngle / getMoon / setSunAngle visibility', () => {
    it('sun visible when angle >= 0', () => {
      sky.setSunAngle(90);
      expect(sky.getSun().visible).toBe(true);
    });

    it('sun hidden when angle < 0', () => {
      sky.setSunAngle(-1);
      expect(sky.getSun().visible).toBe(false);
    });

    it('moon visible when angle >= 0', () => {
      sky.setMoonAngle(45);
      expect(sky.getMoon().visible).toBe(true);
    });

    it('moon hidden when angle < 0', () => {
      sky.setMoonAngle(-10);
      expect(sky.getMoon().visible).toBe(false);
    });

    it('setMoonPhase wraps mod 8', () => {
      sky.setMoonPhase(10);
      expect(sky.getMoonPhase()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getTotalCoverage
  // -------------------------------------------------------------------------
  describe('getTotalCoverage()', () => {
    it('returns 0 with no clouds', () => {
      expect(sky.getTotalCoverage()).toBe(0);
    });

    it('returns max coverage across layers', () => {
      sky.addCloudLayer(0.3);
      sky.addCloudLayer(0.9);
      sky.addCloudLayer(0.6);
      expect(sky.getTotalCoverage()).toBeCloseTo(0.9);
    });
  });

  // -------------------------------------------------------------------------
  // Time-of-day presets
  // -------------------------------------------------------------------------
  describe('time-of-day presets', () => {
    it('applyDaytime: stars not visible, blue-ish top', () => {
      sky.applyDaytime();
      expect(sky.areStarsVisible()).toBe(false);
      expect(sky.getGradient().top.b).toBeGreaterThan(0.5);
    });

    it('applySunset: warm horizon colour', () => {
      sky.applySunset();
      expect(sky.getGradient().horizon.r).toBe(1);
    });

    it('applyNight: stars visible, dark sky', () => {
      sky.applyNight();
      expect(sky.areStarsVisible()).toBe(true);
      expect(sky.getGradient().top.r).toBeLessThan(0.1);
    });
  });
});
