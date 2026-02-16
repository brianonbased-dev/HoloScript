import { describe, it, expect, beforeEach } from 'vitest';
import { WeatherSystem } from '../environment/WeatherSystem';

describe('WeatherSystem', () => {
  let ws: WeatherSystem;

  beforeEach(() => { ws = new WeatherSystem('clear'); });

  it('starts with clear weather', () => {
    expect(ws.getType()).toBe('clear');
    expect(ws.getState().visibility).toBe(1);
    expect(ws.getState().precipitation).toBe(0);
  });

  it('setImmediate changes weather instantly', () => {
    ws.setImmediate('storm');
    expect(ws.getType()).toBe('storm');
    expect(ws.isTransitioning()).toBe(false);
  });

  it('setWeather begins a transition', () => {
    ws.setWeather('rain', 5);
    expect(ws.isTransitioning()).toBe(true);
    expect(ws.getTransitionProgress()).toBe(0);
  });

  it('update progresses the transition', () => {
    ws.setWeather('rain', 10);
    ws.update(5);
    expect(ws.getTransitionProgress()).toBeCloseTo(0.5);
  });

  it('transition completes and sets correct type', () => {
    ws.setWeather('snow', 2);
    ws.update(2);
    expect(ws.isTransitioning()).toBe(false);
    expect(ws.getType()).toBe('snow');
    expect(ws.getState().precipitation).toBeGreaterThan(0);
  });

  it('setWind updates wind state', () => {
    ws.setWind(1, 0, 0, 10);
    expect(ws.getState().wind.speed).toBe(10);
    expect(ws.getState().wind.x).toBe(1);
  });

  it('setTemperature updates temperature', () => {
    ws.setTemperature(-5);
    expect(ws.getState().temperature).toBe(-5);
  });

  it('onChange listener fires on transition complete', () => {
    const states: string[] = [];
    ws.onChange(s => states.push(s.type));
    ws.setWeather('fog', 1);
    ws.update(1);
    expect(states).toContain('fog');
  });

  it('onChange listener fires on setImmediate', () => {
    const states: string[] = [];
    ws.onChange(s => states.push(s.type));
    ws.setImmediate('sandstorm');
    expect(states).toContain('sandstorm');
  });

  it('getHistory tracks weather changes', () => {
    ws.setWeather('rain', 1);
    ws.setWeather('storm', 1);
    const history = ws.getHistory();
    expect(history.length).toBe(3); // clear + rain + storm
  });

  it('same weather type is ignored when not transitioning', () => {
    ws.setWeather('clear');
    expect(ws.isTransitioning()).toBe(false);
  });
});
