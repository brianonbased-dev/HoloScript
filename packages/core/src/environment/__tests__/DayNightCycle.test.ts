import { describe, it, expect, vi } from 'vitest';
import { DayNightCycle, type TimeOfDay } from '../DayNightCycle';

describe('DayNightCycle', () => {
  it('starts at 8 AM', () => {
    const cycle = new DayNightCycle();
    expect(cycle.getTime()).toBe(8);
    expect(cycle.getPeriod()).toBe('morning');
  });

  it('setTime updates time and wraps', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(25); // wraps to 1
    expect(cycle.getTime()).toBe(1);
  });

  it('setTime handles negative values', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(-2); // wraps to 22
    expect(cycle.getTime()).toBe(22);
  });

  it('getPeriod returns correct periods', () => {
    const cycle = new DayNightCycle();
    const cases: Array<[number, TimeOfDay]> = [
      [6, 'dawn'],
      [9, 'morning'],
      [12, 'noon'],
      [15, 'afternoon'],
      [18, 'dusk'],
      [20, 'evening'],
      [23, 'night'],
      [2, 'midnight'],
    ];
    for (const [time, expected] of cases) {
      cycle.setTime(time);
      expect(cycle.getPeriod()).toBe(expected);
    }
  });

  it('sun angle is calculated correctly', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(6); // sunrise
    expect(cycle.getSunAngle()).toBe(0);
    cycle.setTime(12); // midday
    expect(cycle.getSunAngle()).toBe(90);
    cycle.setTime(18); // sunset
    expect(cycle.getSunAngle()).toBe(180);
  });

  it('sun is below horizon at night', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(3);
    expect(cycle.getSunAngle()).toBe(-1);
    expect(cycle.getSunIntensity()).toBe(0);
  });

  it('moon angle works at night', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(0); // midnight → 6h into 12h moon cycle
    expect(cycle.getMoonAngle()).toBe(90);
  });

  it('moon is below horizon during day', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(12);
    expect(cycle.getMoonAngle()).toBe(-1);
    expect(cycle.getMoonIntensity()).toBe(0);
  });

  it('update advances time', () => {
    const cycle = new DayNightCycle();
    cycle.setTimeScale(3600); // 1 hour per real second
    cycle.setTime(0);
    cycle.update(1); // 1 second → 1 hour
    expect(cycle.getTime()).toBeCloseTo(1, 1);
  });

  it('pause stops time progression', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(10);
    cycle.pause();
    cycle.update(9999);
    expect(cycle.getTime()).toBe(10);
    expect(cycle.isPaused()).toBe(true);
    cycle.resume();
    expect(cycle.isPaused()).toBe(false);
  });

  it('dayCount increments on wrap', () => {
    const cycle = new DayNightCycle();
    cycle.setTimeScale(3600);
    cycle.setTime(23);
    cycle.update(2); // 2 hours → wraps past 24
    expect(cycle.getDayCount()).toBe(1);
  });

  it('onPeriodChange fires on transition', () => {
    const cycle = new DayNightCycle();
    const cb = vi.fn();
    cycle.onPeriodChange(cb);
    cycle.setTime(10.99); // morning
    cycle.setTimeScale(3600);
    cycle.update(0.02); // push into noon
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0]).toBe('noon');
  });

  it('getFormattedTime formats correctly', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(14.5); // 14:30
    expect(cycle.getFormattedTime()).toBe('14:30');
  });

  it('getAmbientColor returns correct colors for day/night', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(12); // bright day
    const dayColor = cycle.getAmbientColor();
    expect(dayColor.r).toBe(1);
    expect(dayColor.g).toBeGreaterThan(0.9);
    cycle.setTime(0); // night
    const nightColor = cycle.getAmbientColor();
    expect(nightColor.r).toBeLessThan(0.2);
  });

  it('getState returns complete state', () => {
    const cycle = new DayNightCycle();
    cycle.setTime(12);
    const state = cycle.getState();
    expect(state.period).toBe('noon');
    expect(state.sunAngle).toBe(90);
    expect(state.sunIntensity).toBeGreaterThan(0.9);
    expect(state.dayCount).toBe(0);
  });
});
