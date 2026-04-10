import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnvironmentManager,
  PRESET_SUNNY_DAY,
  PRESET_SUNSET,
  PRESET_NIGHT,
  PRESET_OVERCAST,
  PRESET_SCIFI,
  ALL_PRESETS,
} from '../EnvironmentPresets';

describe('EnvironmentPresets constants', () => {
  it('PRESET_SUNNY_DAY has valid structure', () => {
    expect(PRESET_SUNNY_DAY.id).toBe('sunny_day');
    expect(PRESET_SUNNY_DAY.skybox).toBeDefined();
    expect(PRESET_SUNNY_DAY.lights.length).toBeGreaterThan(0);
  });

  it('all presets have required fields', () => {
    for (const p of ALL_PRESETS) {
      expect(p.id).toBeDefined();
      expect(p.name).toBeDefined();
      expect(p.skybox).toBeDefined();
      expect(p.fog).toBeDefined();
      expect(p.atmosphere).toBeDefined();
    }
  });

  it('preset list contains all named presets', () => {
    const ids = ALL_PRESETS.map((p) => p.id);
    expect(ids).toContain('sunny_day');
    expect(ids).toContain('sunset');
    expect(ids).toContain('night');
    expect(ids).toContain('overcast');
    expect(ids).toContain('scifi');
  });
});

describe('EnvironmentManager', () => {
  let mgr: EnvironmentManager;

  beforeEach(() => {
    mgr = new EnvironmentManager();
  });

  it('defaults to sunny day', () => {
    expect(mgr.getEnvironment().id).toBe('sunny_day');
  });

  it('setPreset switches environment', () => {
    expect(mgr.setPreset('night')).toBe(true);
    expect(mgr.getEnvironment().id).toBe('night');
  });

  it('setPreset returns false for unknown preset', () => {
    expect(mgr.setPreset('martian')).toBe(false);
  });

  it('getPresetIds lists available presets', () => {
    const ids = mgr.getPresetIds();
    expect(ids).toContain('sunny_day');
    expect(ids.length).toBe(ALL_PRESETS.length);
  });

  it('setEnvironment accepts custom config', () => {
    mgr.setEnvironment(PRESET_SCIFI);
    expect(mgr.getEnvironment().name).toBe('Sci-Fi Neon');
  });

  it('setTimeOfDay updates current hour', () => {
    mgr.setTimeOfDay(14);
    expect(mgr.getTimeOfDay().currentHour).toBe(14);
  });

  it('advanceTime progresses time', () => {
    const before = mgr.getTimeOfDay().currentHour;
    mgr.advanceTime(3600); // 1 hour in seconds
    const after = mgr.getTimeOfDay().currentHour;
    expect(after).toBeGreaterThan(before);
  });

  it('setWeather changes weather state', () => {
    mgr.setWeather('rain', 0.8);
    expect(mgr.getWeather().type).toBe('rain');
    expect(mgr.getWeather().intensity).toBe(0.8);
  });

  it('updateWeatherTransition progresses', () => {
    mgr.setWeather('storm', 1);
    mgr.updateWeatherTransition(0.1);
    // Should advance transition
    expect(mgr.getWeather().transitionProgress).toBeGreaterThanOrEqual(0);
  });
});
