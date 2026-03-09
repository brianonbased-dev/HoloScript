import { describe, it, expect, vi } from 'vitest';
import { DayNightCycle } from '../environment/DayNightCycle';

// =============================================================================
// C227 — Day/Night Cycle
// =============================================================================

describe('DayNightCycle', () => {
  it('starts at 8 AM (morning)', () => {
    const dnc = new DayNightCycle();
    expect(dnc.getTime()).toBeCloseTo(8, 0);
    expect(dnc.getPeriod()).toBe('morning');
  });

  it('setTime wraps around 24h', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(25);
    expect(dnc.getTime()).toBeCloseTo(1, 0);
    dnc.setTime(-2);
    expect(dnc.getTime()).toBeCloseTo(22, 0);
  });

  it('update advances time', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(8);
    dnc.setTimeScale(3600); // 1 hour per second
    dnc.update(1); // 1 second → 1 hour
    expect(dnc.getTime()).toBeCloseTo(9, 0);
  });

  it('update does not advance when paused', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(12);
    dnc.pause();
    dnc.update(3600);
    expect(dnc.getTime()).toBeCloseTo(12, 0);
    expect(dnc.isPaused()).toBe(true);
  });

  it('resume unpauses', () => {
    const dnc = new DayNightCycle();
    dnc.pause();
    dnc.resume();
    expect(dnc.isPaused()).toBe(false);
  });

  it('dayCount increments on 24h wrap', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(23);
    dnc.setTimeScale(3600);
    expect(dnc.getDayCount()).toBe(0);
    dnc.update(2); // 2 hours → wrap past midnight
    expect(dnc.getDayCount()).toBe(1);
  });

  // --- Sun / Moon ---

  it('getSunAngle returns valid angle during day', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(12); // noon
    expect(dnc.getSunAngle()).toBeCloseTo(90, 0);
  });

  it('getSunAngle returns -1 at night', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(0);
    expect(dnc.getSunAngle()).toBe(-1);
  });

  it('getMoonAngle returns valid angle at night', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(0); // midnight
    expect(dnc.getMoonAngle()).toBeGreaterThan(0);
  });

  it('sunIntensity peaks at noon', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(12);
    const noon = dnc.getSunIntensity();
    dnc.setTime(7);
    const morning = dnc.getSunIntensity();
    expect(noon).toBeGreaterThan(morning);
  });

  it('moonIntensity is zero during day', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(12);
    expect(dnc.getMoonIntensity()).toBe(0);
  });

  // --- Period ---

  it('getPeriod returns correct periods', () => {
    const dnc = new DayNightCycle();
    const expectations: [number, string][] = [
      [6, 'dawn'],
      [8, 'morning'],
      [12, 'noon'],
      [15, 'afternoon'],
      [18, 'dusk'],
      [20, 'evening'],
      [23, 'night'],
      [2, 'midnight'],
    ];
    for (const [time, period] of expectations) {
      dnc.setTime(time);
      expect(dnc.getPeriod()).toBe(period);
    }
  });

  it('onPeriodChange fires when period transitions', () => {
    const dnc = new DayNightCycle();
    const cb = vi.fn();
    dnc.onPeriodChange(cb);
    dnc.setTime(10.9); // morning
    dnc.setTimeScale(3600);
    dnc.update(0.2); // push past 11 → noon
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0]).toBe('noon');
  });

  // --- State & Formatting ---

  it('getState returns complete state', () => {
    const dnc = new DayNightCycle();
    const state = dnc.getState();
    expect(state.time).toBeDefined();
    expect(state.sunAngle).toBeDefined();
    expect(state.moonAngle).toBeDefined();
    expect(state.ambientColor).toBeDefined();
    expect(state.period).toBeDefined();
    expect(state.dayCount).toBeDefined();
  });

  it('getFormattedTime returns HH:MM string', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(14.5);
    expect(dnc.getFormattedTime()).toBe('14:30');
  });

  it('getAmbientColor is warm at noon, dark at night', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(12);
    const day = dnc.getAmbientColor();
    dnc.setTime(0);
    const night = dnc.getAmbientColor();
    expect(day.r).toBeGreaterThan(night.r);
  });

  it('getTimeScale and setTimeScale work', () => {
    const dnc = new DayNightCycle();
    dnc.setTimeScale(120);
    expect(dnc.getTimeScale()).toBe(120);
    dnc.setTimeScale(-5); // clamped to 0
    expect(dnc.getTimeScale()).toBe(0);
  });
});
