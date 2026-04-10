import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherSystem } from '../WeatherSystem';

describe('WeatherSystem', () => {
  let ws: WeatherSystem;

  beforeEach(() => {
    ws = new WeatherSystem('clear');
  });

  it('starts with clear weather', () => {
    expect(ws.getType()).toBe('clear');
    expect(ws.getState().visibility).toBe(1);
  });

  it('setImmediate changes weather instantly', () => {
    ws.setImmediate('rain');
    expect(ws.getType()).toBe('rain');
    expect(ws.isTransitioning()).toBe(false);
  });

  it('setWeather starts a transition', () => {
    ws.setWeather('storm', 5);
    expect(ws.isTransitioning()).toBe(true);
    expect(ws.getTransitionProgress()).toBe(0);
  });

  it('update progresses transition', () => {
    ws.setWeather('rain', 2);
    ws.update(1);
    expect(ws.getTransitionProgress()).toBeCloseTo(0.5, 1);
  });

  it('transition completes after full duration', () => {
    ws.setWeather('snow', 1);
    ws.update(1.5);
    expect(ws.isTransitioning()).toBe(false);
    expect(ws.getType()).toBe('snow');
  });

  it('notifies listeners on setImmediate', () => {
    const handler = vi.fn();
    ws.onChange(handler);
    ws.setImmediate('fog');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('fog');
  });

  it('notifies listeners when transition completes', () => {
    const handler = vi.fn();
    ws.onChange(handler);
    ws.setWeather('cloudy', 0.5);
    ws.update(1);
    expect(handler).toHaveBeenCalled();
  });

  it('setWind updates wind state', () => {
    ws.setWind(1, 0, 0, 10);
    expect(ws.getState().wind).toEqual({ x: 1, y: 0, z: 0, speed: 10 });
  });

  it('setTemperature updates temperature', () => {
    ws.setTemperature(-5);
    expect(ws.getState().temperature).toBe(-5);
  });

  it('getHistory tracks weather changes', () => {
    ws.setWeather('rain', 1);
    ws.setWeather('snow', 1);
    const history = ws.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(3); // clear + rain + snow
  });

  it('skips no-op setWeather when already that type', () => {
    ws.setWeather('clear', 5);
    expect(ws.isTransitioning()).toBe(false);
  });

  it('different initial types work', () => {
    const storm = new WeatherSystem('storm');
    expect(storm.getType()).toBe('storm');
    expect(storm.getState().intensity).toBe(1);
  });
});
