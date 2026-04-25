import { describe, it, expect } from 'vitest';
import { WeatherSystem } from '@holoscript/engine/environment/WeatherSystem';
import { DayNightCycle } from '@holoscript/engine/environment/DayNightCycle';
import { SkyRenderer } from '@holoscript/engine/environment/SkyRenderer';

describe('Cycle 132: Weather & Time of Day', () => {
  // -------------------------------------------------------------------------
  // WeatherSystem
  // -------------------------------------------------------------------------

  it('should transition between weather types', () => {
    const ws = new WeatherSystem('clear');
    expect(ws.getType()).toBe('clear');
    expect(ws.getState().visibility).toBe(1);

    ws.setWeather('storm', 2);
    expect(ws.isTransitioning()).toBe(true);

    ws.update(1);
    expect(ws.getTransitionProgress()).toBeCloseTo(0.5, 1);

    ws.update(2); // Complete
    expect(ws.getType()).toBe('storm');
    expect(ws.getState().visibility).toBeLessThan(0.5);
  });

  it('should set immediate weather and track history', () => {
    const ws = new WeatherSystem('clear');
    ws.setImmediate('fog');
    expect(ws.getType()).toBe('fog');
    expect(ws.isTransitioning()).toBe(false);
    expect(ws.getState().visibility).toBeLessThan(0.3);
    expect(ws.getHistory().length).toBeGreaterThanOrEqual(1);
  });

  it('should control wind and temperature', () => {
    const ws = new WeatherSystem();
    ws.setWind(1, 0, 0.5, 15);
    ws.setTemperature(-5);
    const state = ws.getState();
    expect(state.wind.speed).toBe(15);
    expect(state.temperature).toBe(-5);
  });

  // -------------------------------------------------------------------------
  // DayNightCycle
  // -------------------------------------------------------------------------

  it('should track sun position and time periods', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(12); // Noon
    expect(cycle.getPeriod()).toBe('noon');
    expect(cycle.getSunAngle()).toBe(90);
    expect(cycle.getSunIntensity()).toBeCloseTo(1, 1);

    cycle.setTime(22);
    expect(cycle.getPeriod()).toBe('night');
    expect(cycle.getSunAngle()).toBe(-1);
  });

  it('should advance time and count days', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(23);
    cycle.setTimeScale(3600); // 1 hour per second
    cycle.update(2); // 2 hours pass

    expect(cycle.getTime()).toBeCloseTo(1, 0);
    expect(cycle.getDayCount()).toBe(1);
    expect(cycle.getFormattedTime()).toMatch(/^\d{2}:\d{2}$/);
  });

  it('should emit period change events', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(6.9);
    cycle.setTimeScale(3600);

    const periods: string[] = [];
    cycle.onPeriodChange((period) => periods.push(period));

    cycle.update(0.2); // Push past 7 → morning
    expect(periods).toContain('morning');
  });

  // -------------------------------------------------------------------------
  // SkyRenderer
  // -------------------------------------------------------------------------

  it('should sample sky gradient', () => {
    const sky = new SkyRenderer();
    const bottom = sky.sampleGradient(0);
    const horizon = sky.sampleGradient(0.5);
    const top = sky.sampleGradient(1);

    expect(bottom.r).not.toBe(top.r);
    expect(horizon.r).toBeDefined();
  });

  it('should manage cloud layers', () => {
    const sky = new SkyRenderer();
    const c1 = sky.addCloudLayer(0.5, 1000, [3, 0, 0]);
    sky.addCloudLayer(0.8, 2000);

    expect(sky.getCloudCount()).toBe(2);
    expect(sky.getTotalCoverage()).toBe(0.8);

    sky.updateClouds(1);
    const layers = sky.getCloudLayers();
    expect(layers[0].offset[0]).toBe(3); // Moved
  });

  it('should apply time-of-day presets', () => {
    const sky = new SkyRenderer();
    sky.applyNight();
    expect(sky.areStarsVisible()).toBe(true);
    const nightTop = sky.getGradient().top;
    expect(nightTop.r).toBeLessThan(0.1);

    sky.applyDaytime();
    expect(sky.areStarsVisible()).toBe(false);
    const dayTop = sky.getGradient().top;
    expect(dayTop.b).toBeGreaterThan(0.5);
  });
});
