/**
 * EnvironmentManager.prod.test.ts
 *
 * Production tests for EnvironmentManager and EnvironmentPresets —
 * preset selection, time-of-day management, sun position, weather, and fog adjustment.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnvironmentManager,
  ALL_PRESETS,
  PRESET_SUNNY_DAY,
  PRESET_SUNSET,
  PRESET_NIGHT,
  PRESET_OVERCAST,
  PRESET_SCIFI,
} from '../EnvironmentPresets';

describe('EnvironmentPresets constants', () => {
  it('ALL_PRESETS contains 5 entries', () => {
    expect(ALL_PRESETS).toHaveLength(5);
  });

  it('each preset has required fields', () => {
    for (const p of ALL_PRESETS) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('skybox');
      expect(p).toHaveProperty('lights');
      expect(p).toHaveProperty('fog');
      expect(p).toHaveProperty('atmosphere');
    }
  });

  it('PRESET_SUNNY_DAY id is "sunny_day"', () => {
    expect(PRESET_SUNNY_DAY.id).toBe('sunny_day');
  });

  it('PRESET_NIGHT has low ambient intensity', () => {
    const ambient = PRESET_NIGHT.lights.find((l) => l.type === 'ambient');
    expect(ambient?.intensity).toBeLessThan(0.2);
  });

  it('PRESET_SCIFI has point light', () => {
    expect(PRESET_SCIFI.lights.some((l) => l.type === 'point')).toBe(true);
  });

  it('PRESET_OVERCAST atmosphere.bloom is false', () => {
    expect(PRESET_OVERCAST.atmosphere.bloom).toBe(false);
  });
});

describe('EnvironmentManager', () => {
  let em: EnvironmentManager;

  beforeEach(() => {
    em = new EnvironmentManager();
  });

  // -------------------------------------------------------------------------
  // Constructor / getEnvironment
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('defaults to PRESET_SUNNY_DAY', () => {
      expect(em.getEnvironment().id).toBe('sunny_day');
    });

    it('accepts a custom initial preset', () => {
      const custom = new EnvironmentManager(PRESET_NIGHT);
      expect(custom.getEnvironment().id).toBe('night');
    });
  });

  // -------------------------------------------------------------------------
  // setEnvironment / setPreset
  // -------------------------------------------------------------------------
  describe('setEnvironment / setPreset', () => {
    it('setEnvironment replaces the environment', () => {
      em.setEnvironment(PRESET_SUNSET);
      expect(em.getEnvironment().id).toBe('sunset');
    });

    it('setPreset returns true for known preset', () => {
      expect(em.setPreset('night')).toBe(true);
      expect(em.getEnvironment().id).toBe('night');
    });

    it('setPreset returns false for unknown id', () => {
      expect(em.setPreset('lava_world')).toBe(false);
    });

    it('getPresetIds returns all 5 known ids', () => {
      const ids = em.getPresetIds();
      expect(ids).toContain('sunny_day');
      expect(ids).toContain('sunset');
      expect(ids).toContain('night');
      expect(ids).toContain('overcast');
      expect(ids).toContain('scifi');
    });
  });

  // -------------------------------------------------------------------------
  // Time of Day
  // -------------------------------------------------------------------------
  describe('setTimeOfDay / getTimeOfDay', () => {
    it('default hour is 12', () => {
      expect(em.getTimeOfDay().currentHour).toBe(12);
    });

    it('setTimeOfDay wraps mod 24', () => {
      em.setTimeOfDay(26);
      expect(em.getTimeOfDay().currentHour).toBe(2);
    });

    it('setTimeOfDay midday: sun position y > 0', () => {
      em.setTimeOfDay(12);
      const sunY = em.getEnvironment().skybox.sunPosition?.y ?? 0;
      expect(sunY).toBeGreaterThan(0);
    });

    it('setTimeOfDay at night: sun position y < 0', () => {
      em.setTimeOfDay(2); // 2 AM
      const sunY = em.getEnvironment().skybox.sunPosition?.y ?? 0;
      expect(sunY).toBeLessThan(0);
    });

    it('light intensity peaks at noon', () => {
      em.setTimeOfDay(12);
      const noonIntensity = em.getEnvironment().lights[0].intensity;
      em.setTimeOfDay(8);
      const morningIntensity = em.getEnvironment().lights[0].intensity;
      expect(noonIntensity).toBeGreaterThan(morningIntensity);
    });
  });

  describe('advanceTime()', () => {
    it('advances the hour', () => {
      em.setTimeOfDay(12);
      const tod = em.getTimeOfDay();
      // daySpeed=1, 3600s = 1 real hour of in-game time
      em.advanceTime(3600 * tod.daySpeed);
      expect(em.getTimeOfDay().currentHour).toBeCloseTo(13, 1);
    });

    it('wraps past 24', () => {
      em.setTimeOfDay(23);
      em.advanceTime(3600 * 2); // advance 2 hours
      expect(em.getTimeOfDay().currentHour).toBeCloseTo(1, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Weather
  // -------------------------------------------------------------------------
  describe('setWeather / getWeather', () => {
    it('default weather is clear', () => {
      expect(em.getWeather().type).toBe('clear');
    });

    it('setWeather updates type', () => {
      em.setWeather('storm', 0.9);
      expect(em.getWeather().type).toBe('storm');
    });

    it('setWeather clamps intensity to [0,1]', () => {
      em.setWeather('rain', 5);
      expect(em.getWeather().intensity).toBe(1);
      em.setWeather('rain', -1);
      expect(em.getWeather().intensity).toBe(0);
    });

    it('setWeather resets transitionProgress to 0', () => {
      em.setWeather('snow', 0.5);
      expect(em.getWeather().transitionProgress).toBe(0);
    });

    it('fog: sets dense fog config', () => {
      em.setWeather('fog', 0.8);
      expect(em.getEnvironment().fog.type).toBe('exponential2');
      expect(em.getEnvironment().fog.density).toBeGreaterThan(0);
    });

    it('rain: adjusts fog density', () => {
      em.setWeather('rain', 1.0);
      expect(em.getEnvironment().fog.density).toBeGreaterThan(0);
    });

    it('snow: adjusts fog density', () => {
      em.setWeather('snow', 0.5);
      expect(em.getEnvironment().fog.density).toBeGreaterThan(0);
    });
  });

  describe('updateWeatherTransition()', () => {
    it('increments transitionProgress toward 1', () => {
      em.setWeather('rain', 0.5);
      em.updateWeatherTransition(1);
      expect(em.getWeather().transitionProgress).toBeGreaterThan(0);
    });

    it('clamps transitionProgress at 1', () => {
      em.setWeather('rain', 0.5);
      em.updateWeatherTransition(100);
      expect(em.getWeather().transitionProgress).toBe(1);
    });
  });
});
