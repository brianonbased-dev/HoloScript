/**
 * EnvironmentSky.test.ts — Cycle 190
 *
 * Tests for DayNightCycle, WeatherSystem, and SkyRenderer.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DayNightCycle } from '@holoscript/engine/environment/DayNightCycle';
import { WeatherSystem } from '@holoscript/engine/environment/WeatherSystem';
import { SkyRenderer } from '@holoscript/engine/environment/SkyRenderer';

describe('DayNightCycle', () => {
  let dnc: DayNightCycle;
  beforeEach(() => {
    dnc = new DayNightCycle();
  });

  it('starts at 8 AM morning', () => {
    expect(dnc.getTime()).toBe(8);
    expect(dnc.getPeriod()).toBe('morning');
  });

  it('advances time with update', () => {
    dnc.update(3600);
    expect(dnc.getTime()).toBeCloseTo(9, 0);
  });

  it('wraps past 24 and increments day', () => {
    dnc.setTime(23.5);
    dnc.update(3600);
    expect(dnc.getDayCount()).toBeGreaterThanOrEqual(1);
  });

  it('time scale works', () => {
    dnc.setTimeScale(60);
    dnc.update(1);
    expect(dnc.getTime()).toBeGreaterThan(8);
  });

  it('pause stops time', () => {
    dnc.pause();
    dnc.update(10000);
    expect(dnc.getTime()).toBe(8);
  });

  it('sun angle at noon is ~90', () => {
    dnc.setTime(12);
    expect(dnc.getSunAngle()).toBeCloseTo(90, 0);
  });

  it('moon active at midnight', () => {
    dnc.setTime(0);
    expect(dnc.getMoonAngle()).toBeGreaterThan(0);
  });

  it('period change fires listener', () => {
    const p: string[] = [];
    dnc.onPeriodChange((period) => p.push(period));
    dnc.setTime(10.9);
    dnc.update(3600 * 0.2);
    expect(p).toContain('noon');
  });

  it('formatted time returns HH:MM', () => {
    dnc.setTime(14.5);
    expect(dnc.getFormattedTime()).toBe('14:30');
  });

  it('ambient color differs day vs night', () => {
    dnc.setTime(12);
    const day = dnc.getAmbientColor();
    dnc.setTime(0);
    const night = dnc.getAmbientColor();
    expect(day.r).toBeGreaterThan(night.r);
  });
});

describe('WeatherSystem', () => {
  let ws: WeatherSystem;
  beforeEach(() => {
    ws = new WeatherSystem('clear');
  });

  it('starts clear', () => {
    expect(ws.getType()).toBe('clear');
  });

  it('transitions over time', () => {
    ws.setWeather('storm', 2);
    expect(ws.isTransitioning()).toBe(true);
    ws.update(2.5);
    expect(ws.getType()).toBe('storm');
  });

  it('immediate skips transition', () => {
    ws.setImmediate('fog');
    expect(ws.getType()).toBe('fog');
    expect(ws.isTransitioning()).toBe(false);
  });

  it('wind is configurable', () => {
    ws.setWind(1, 0, -1, 15);
    expect(ws.getState().wind.speed).toBe(15);
  });

  it('onChange fires', () => {
    const log: string[] = [];
    ws.onChange((s) => log.push(s.type));
    ws.setWeather('rain', 0.5);
    ws.update(0.6);
    expect(log).toContain('rain');
  });

  it('history tracks changes', () => {
    ws.setWeather('snow', 1);
    expect(ws.getHistory().length).toBeGreaterThanOrEqual(2);
  });
});

describe('SkyRenderer', () => {
  let sky: SkyRenderer;
  beforeEach(() => {
    sky = new SkyRenderer();
  });

  it('samples gradient', () => {
    const c = sky.sampleGradient(0.5);
    expect(c.r).toBeDefined();
  });

  it('star field configurable', () => {
    sky.setStarField({ density: 200 });
    expect(sky.getStarField().density).toBe(200);
  });

  it('cloud layers add/remove', () => {
    const l = sky.addCloudLayer(0.5, 2000);
    expect(sky.getCloudCount()).toBe(1);
    sky.removeCloudLayer(l.id);
    expect(sky.getCloudCount()).toBe(0);
  });

  it('cloud offset advances', () => {
    const l = sky.addCloudLayer(0.3, 1000, [10, 0, 0]);
    const before = l.offset[0];
    sky.updateClouds(1);
    expect(l.offset[0]).toBeGreaterThan(before);
  });

  it('sun visibility tied to angle', () => {
    sky.setSunAngle(90);
    expect(sky.getSun().visible).toBe(true);
    sky.setSunAngle(-10);
    expect(sky.getSun().visible).toBe(false);
  });

  it('applyNight shows stars', () => {
    sky.applyNight();
    expect(sky.areStarsVisible()).toBe(true);
  });

  it('total coverage reflects max', () => {
    sky.addCloudLayer(0.3);
    sky.addCloudLayer(0.7);
    expect(sky.getTotalCoverage()).toBeCloseTo(0.7);
  });
});
