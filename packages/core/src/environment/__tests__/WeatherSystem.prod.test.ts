/**
 * WeatherSystem.prod.test.ts
 *
 * Production tests for WeatherSystem — weather types, immediate set,
 * transitions, smoothstep interpolation, wind, temperature, history, and events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherSystem } from '../WeatherSystem';
import type { WeatherType } from '../WeatherSystem';

describe('WeatherSystem', () => {
  let ws: WeatherSystem;

  beforeEach(() => { ws = new WeatherSystem('clear'); });

  // -------------------------------------------------------------------------
  // Construction & initial state
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('initialises to clear weather', () => {
      expect(ws.getType()).toBe('clear');
    });

    it('clear weather: intensity=0, visibility=1', () => {
      const s = ws.getState();
      expect(s.intensity).toBe(0);
      expect(s.visibility).toBe(1);
    });

    it('history starts with initial type', () => {
      expect(ws.getHistory()[0].type).toBe('clear');
    });

    it('accepts non-default initial weather type', () => {
      const r = new WeatherSystem('storm');
      expect(r.getType()).toBe('storm');
    });
  });

  // -------------------------------------------------------------------------
  // setImmediate
  // -------------------------------------------------------------------------
  describe('setImmediate()', () => {
    it('immediately changes type', () => {
      ws.setImmediate('storm');
      expect(ws.getType()).toBe('storm');
    });

    it('clears any in-progress transition', () => {
      ws.setWeather('rain', 10);
      ws.setImmediate('fog');
      expect(ws.isTransitioning()).toBe(false);
    });

    it('fire onChange callback', () => {
      const cb = vi.fn();
      ws.onChange(cb);
      ws.setImmediate('snow');
      expect(cb).toHaveBeenCalledOnce();
    });

    it('storm: high intensity, low visibility', () => {
      ws.setImmediate('storm');
      const s = ws.getState();
      expect(s.intensity).toBe(1);
      expect(s.visibility).toBe(0.3);
      expect(s.precipitation).toBe(1);
    });

    it('fog: low visibility, high humidity', () => {
      ws.setImmediate('fog');
      const s = ws.getState();
      expect(s.visibility).toBe(0.2);
      expect(s.humidity).toBeCloseTo(0.9);
    });
  });

  // -------------------------------------------------------------------------
  // setWeather (gradual transition)
  // -------------------------------------------------------------------------
  describe('setWeather() transitions', () => {
    it('starts transitioning', () => {
      ws.setWeather('rain', 5);
      expect(ws.isTransitioning()).toBe(true);
    });

    it('getTransitionProgress starts at 0', () => {
      ws.setWeather('rain', 5);
      expect(ws.getTransitionProgress()).toBe(0);
    });

    it('same type + no transition: no-op', () => {
      ws.setWeather('clear', 5);
      expect(ws.isTransitioning()).toBe(false);
    });

    it('adds to history', () => {
      ws.setWeather('rain', 5);
      expect(ws.getHistory()).toHaveLength(2);
    });

    it('transition completes after duration dt', () => {
      ws.setWeather('storm', 5);
      ws.update(5); // full duration in one step
      expect(ws.isTransitioning()).toBe(false);
      expect(ws.getType()).toBe('storm');
    });

    it('during transition: progress increases', () => {
      ws.setWeather('snow', 10);
      ws.update(5); // half-way
      expect(ws.getTransitionProgress()).toBeCloseTo(0.5);
    });

    it('onChange fires when transition completes', () => {
      const cb = vi.fn();
      ws.onChange(cb);
      ws.setWeather('rain', 5);
      ws.update(5);
      expect(cb).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setWind / setTemperature
  // -------------------------------------------------------------------------
  describe('setWind() / setTemperature()', () => {
    it('setWind updates wind state', () => {
      ws.setWind(1, 0, 0, 10);
      expect(ws.getState().wind.speed).toBe(10);
    });

    it('setTemperature updates temperature', () => {
      ws.setTemperature(35);
      expect(ws.getState().temperature).toBe(35);
    });

    it('wind preserved through transition completion', () => {
      ws.setWind(0.5, 0, 0.5, 8);
      ws.setWeather('rain', 2);
      ws.update(2);
      expect(ws.getState().wind.speed).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // Weather type properties
  // -------------------------------------------------------------------------
  describe('weather type defaults', () => {
    const weatherChecks: [WeatherType, Partial<{ intensity: number; visibility: number; precipitation: number }>][] = [
      ['clear',     { intensity: 0, visibility: 1, precipitation: 0 }],
      ['rain',      { precipitation: 0.7 }],
      ['sandstorm', { visibility: 0.15 }],
      ['snow',      { precipitation: 0.6 }],
    ];
    for (const [type, checks] of weatherChecks) {
      it(`${type}: matches defaults`, () => {
        ws.setImmediate(type);
        const s = ws.getState();
        for (const [key, val] of Object.entries(checks)) {
          expect(s[key as keyof typeof s]).toBeCloseTo(val as number, 5);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // getHistory
  // -------------------------------------------------------------------------
  describe('getHistory()', () => {
    it('returns a copy (not live reference)', () => {
      const h1 = ws.getHistory();
      ws.setWeather('rain', 5); // setWeather adds to history; setImmediate does NOT
      const h2 = ws.getHistory();
      expect(h1).toHaveLength(1);
      expect(h2).toHaveLength(2);
    });
  });
});
