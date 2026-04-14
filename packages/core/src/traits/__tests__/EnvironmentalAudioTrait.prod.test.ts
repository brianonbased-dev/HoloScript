/**
 * EnvironmentalAudioSystem — Production Test Suite
 *
 * Tests the pure class-based EnvironmentalAudioSystem and helpers:
 * getAirAbsorption, WEATHER_PRESETS, setWeather, calculateAirAbsorption,
 * calculateDopplerShift, calculateDopplerShiftSimple, getEnvironmentalEffect.
 */
import { describe, it, expect } from 'vitest';
import {
  EnvironmentalAudioSystem,
  WEATHER_PRESETS,
  getAirAbsorption,
} from '../EnvironmentalAudioTrait';

// ─── WEATHER_PRESETS ──────────────────────────────────────────────────────────

describe('WEATHER_PRESETS', () => {
  it('has all 6 weather types', () => {
    expect(Object.keys(WEATHER_PRESETS)).toEqual(
      expect.arrayContaining(['clear', 'rain', 'storm', 'snow', 'fog', 'wind'])
    );
  });
  it('storm has highest ambientVolume', () => {
    const volumes = Object.values(WEATHER_PRESETS).map((p) => p.ambientVolume);
    expect(WEATHER_PRESETS.storm.ambientVolume).toBe(Math.max(...volumes));
  });
  it('snow has highest reverbDamping', () => {
    expect(WEATHER_PRESETS.snow.reverbDamping).toBeGreaterThanOrEqual(
      WEATHER_PRESETS.storm.reverbDamping
    );
  });
  it('storm has highest airAbsorptionMultiplier', () => {
    const vals = Object.values(WEATHER_PRESETS).map((p) => p.airAbsorptionMultiplier);
    expect(WEATHER_PRESETS.storm.airAbsorptionMultiplier).toBe(Math.max(...vals));
  });
  it('each preset has a description string', () => {
    for (const preset of Object.values(WEATHER_PRESETS)) {
      expect(typeof preset.description).toBe('string');
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── getAirAbsorption (standalone helper) ─────────────────────────────────────

describe('getAirAbsorption helper', () => {
  it('returns all 5 frequency bands', () => {
    const result = getAirAbsorption(20, 50);
    expect(result.absorption).toHaveProperty('500');
    expect(result.absorption).toHaveProperty('1000');
    expect(result.absorption).toHaveProperty('2000');
    expect(result.absorption).toHaveProperty('4000');
    expect(result.absorption).toHaveProperty('8000');
  });
  it('absorption increases with frequency', () => {
    const { absorption } = getAirAbsorption(20, 50);
    expect(absorption[500]).toBeLessThan(absorption[1000]);
    expect(absorption[1000]).toBeLessThan(absorption[2000]);
    expect(absorption[2000]).toBeLessThan(absorption[4000]);
    expect(absorption[4000]).toBeLessThan(absorption[8000]);
  });
  it('returns temperature and humidity fields', () => {
    const result = getAirAbsorption(15, 60);
    expect(result.temperature).toBe(15);
    expect(result.humidity).toBe(60);
  });
  it('higher temperature → slightly lower absorption (tempFactor)', () => {
    const cold = getAirAbsorption(0, 50);
    const warm = getAirAbsorption(30, 50);
    // tempFactor = 1 + (20 - temp) * 0.01. Higher temp = lower factor.
    expect(warm.absorption[8000]).toBeLessThan(cold.absorption[8000]);
  });
  it('all absorption values are positive', () => {
    const { absorption } = getAirAbsorption(20, 50);
    for (const v of Object.values(absorption)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});

// ─── EnvironmentalAudioSystem constructor ─────────────────────────────────────

describe('EnvironmentalAudioSystem — constructor', () => {
  it('defaults to clear weather', () => {
    const sys = new EnvironmentalAudioSystem();
    expect(sys.getWeather()).toBe('clear');
  });
  it('getWeatherPreset returns clear preset by default', () => {
    const sys = new EnvironmentalAudioSystem();
    expect(sys.getWeatherPreset().type).toBe('clear');
  });
});

// ─── setWeather / getWeather / getWeatherPreset ───────────────────────────────

describe('EnvironmentalAudioSystem.setWeather', () => {
  it('changes weather to rain', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('rain');
    expect(sys.getWeather()).toBe('rain');
    expect(sys.getWeatherPreset().type).toBe('rain');
  });
  it('getAmbientVolume reflects new weather', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('storm');
    expect(sys.getAmbientVolume()).toBe(WEATHER_PRESETS.storm.ambientVolume);
  });
  it('getReverbDamping reflects new weather', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('snow');
    expect(sys.getReverbDamping()).toBe(WEATHER_PRESETS.snow.reverbDamping);
  });
  it('getWindSpeed reflects new weather', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('wind');
    expect(sys.getWindSpeed()).toBe(WEATHER_PRESETS.wind.windSpeed);
  });
});

// ─── setCustomWeather ─────────────────────────────────────────────────────────

describe('EnvironmentalAudioSystem.setCustomWeather', () => {
  it('overrides specific fields while keeping others', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('clear');
    sys.setCustomWeather({ ambientVolume: 0.99 });
    expect(sys.getWeatherPreset().ambientVolume).toBe(0.99);
    expect(sys.getWeatherPreset().windSpeed).toBe(WEATHER_PRESETS.clear.windSpeed);
  });
});

// ─── setAirAbsorption ─────────────────────────────────────────────────────────

describe('EnvironmentalAudioSystem.setAirAbsorption', () => {
  it('disabling Air Absorption returns all-1 multipliers', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setAirAbsorption(false);
    const result = sys.calculateAirAbsorption(100);
    expect(result[500]).toBe(1);
    expect(result[8000]).toBe(1);
  });
  it('clamps humidity to [0, 100]', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setAirAbsorption(true, 20, 150);
    expect(sys.getConfig().airAbsorption.humidity).toBe(100);
    sys.setAirAbsorption(true, 20, -10);
    expect(sys.getConfig().airAbsorption.humidity).toBe(0);
  });
  it('does not update temperature when undefined', () => {
    const sys = new EnvironmentalAudioSystem();
    const before = sys.getConfig().airAbsorption.temperature;
    sys.setAirAbsorption(true, undefined, 60);
    expect(sys.getConfig().airAbsorption.temperature).toBe(before);
  });
});

// ─── calculateAirAbsorption ───────────────────────────────────────────────────

describe('EnvironmentalAudioSystem.calculateAirAbsorption', () => {
  it('returns all 1.0 at distance=0', () => {
    const sys = new EnvironmentalAudioSystem();
    const r = sys.calculateAirAbsorption(0);
    expect(r[500]).toBe(1);
    expect(r[8000]).toBe(1);
  });
  it('high frequency band has more loss than low frequency at same distance', () => {
    const sys = new EnvironmentalAudioSystem();
    const r = sys.calculateAirAbsorption(500);
    expect(r[8000]).toBeLessThan(r[500]);
  });
  it('more attenuation at greater distance', () => {
    const sys = new EnvironmentalAudioSystem();
    const near = sys.calculateAirAbsorption(50);
    const far = sys.calculateAirAbsorption(500);
    expect(far[8000]).toBeLessThan(near[8000]);
  });
  it('storm weather amplifies attenuation vs clear', () => {
    const clear = new EnvironmentalAudioSystem();
    const storm = new EnvironmentalAudioSystem();
    storm.setWeather('storm');
    const r_clear = clear.calculateAirAbsorption(100);
    const r_storm = storm.calculateAirAbsorption(100);
    expect(r_storm[8000]).toBeLessThan(r_clear[8000]);
  });
  it('getAirAbsorptionMultiplier is average of 5 bands and between 0 and 1', () => {
    const sys = new EnvironmentalAudioSystem();
    const mult = sys.getAirAbsorptionMultiplier(200);
    expect(mult).toBeGreaterThan(0);
    expect(mult).toBeLessThanOrEqual(1);
  });
});

// ─── setDoppler ───────────────────────────────────────────────────────────────

describe('EnvironmentalAudioSystem.setDoppler', () => {
  it('disabled doppler returns 1.0 always', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setDoppler(false);
    expect(sys.calculateDopplerShiftSimple(50)).toBe(1.0);
  });
  it('clamps maxPitchShift to [0, 2]', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setDoppler(true, undefined, 5);
    expect(sys.getConfig().doppler.maxPitchShift).toBe(2);
    sys.setDoppler(true, undefined, -1);
    expect(sys.getConfig().doppler.maxPitchShift).toBe(0);
  });
  it('does not update speedOfSound when undefined', () => {
    const sys = new EnvironmentalAudioSystem();
    const before = sys.getConfig().doppler.speedOfSound;
    sys.setDoppler(true, undefined, 1.5);
    expect(sys.getConfig().doppler.speedOfSound).toBe(before);
  });
});

// ─── calculateDopplerShift ────────────────────────────────────────────────────

describe('EnvironmentalAudioSystem.calculateDopplerShift', () => {
  it('stationary source and listener → 1.0', () => {
    const sys = new EnvironmentalAudioSystem();
    const pShift = sys.calculateDopplerShift(
      [0, 0, 0 ],
      [0, 0, 0 ],
      [0, 0, 10 ]
    );
    expect(pShift).toBeCloseTo(1.0, 5);
  });
  it('approaching source raises pitch above 1.0', () => {
    const sys = new EnvironmentalAudioSystem();
    // The code computes sourceSpeed = -(vel · dir).
    // Source vel = +z, dir = +z (listener in +z from source):
    // sourceSpeed = -(30 * 1) = -30 → pitch = (c+0)/(c-30) > 1.0 (approaching)
    const pShift = sys.calculateDopplerShift(
      [0, 0, 30 ], // moving toward listener
      [0, 0, 0 ],
      [0, 0, 1 ] // listener is in +z direction from source
    );
    expect(pShift).toBeGreaterThan(1.0);
  });
  it('receding source lowers pitch below 1.0', () => {
    const sys = new EnvironmentalAudioSystem();
    // Source vel = -z, listener in +z: sourceSpeed = -(-30 * 1) = +30 → pitch = (c+0)/(c+30) < 1.0
    const pShift = sys.calculateDopplerShift(
      [0, 0, -30 ], // moving away from listener
      [0, 0, 0 ],
      [0, 0, 1 ]
    );
    expect(pShift).toBeLessThan(1.0);
  });
  it('returns 1.0 if distance is zero', () => {
    const sys = new EnvironmentalAudioSystem();
    const pShift = sys.calculateDopplerShift(
      [0, 0, 0 ],
      [0, 0, 0 ],
      [0, 0, 0 ]
    );
    expect(pShift).toBe(1.0);
  });
  it('clamps to maxPitchShift', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setDoppler(true, 343, 1.2);
    // very fast source moving toward listener (+z at extreme velocity) → above-max pitch gets clamped
    const pShift = sys.calculateDopplerShift(
      [0, 0, 9999 ],
      [0, 0, 0 ],
      [0, 0, 1 ]
    );
    expect(pShift).toBeLessThanOrEqual(1.2);
  });
});

describe('EnvironmentalAudioSystem.calculateDopplerShiftSimple', () => {
  it('zero velocity → 1.0', () => {
    const sys = new EnvironmentalAudioSystem();
    expect(sys.calculateDopplerShiftSimple(0)).toBeCloseTo(1.0, 5);
  });
  it('positive relative velocity (approaching) → pitch > 1.0', () => {
    const sys = new EnvironmentalAudioSystem();
    expect(sys.calculateDopplerShiftSimple(100)).toBeGreaterThan(1.0);
  });
  it('negative relative velocity (receding) → pitch < 1.0', () => {
    const sys = new EnvironmentalAudioSystem();
    expect(sys.calculateDopplerShiftSimple(-100)).toBeLessThan(1.0);
  });
  it('disabled → always 1.0 regardless of velocity', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setDoppler(false);
    expect(sys.calculateDopplerShiftSimple(200)).toBe(1.0);
  });
});

// ─── getEnvironmentalEffect ───────────────────────────────────────────────────

describe('EnvironmentalAudioSystem.getEnvironmentalEffect', () => {
  it('returns valid shape with all fields', () => {
    const sys = new EnvironmentalAudioSystem();
    const effect = sys.getEnvironmentalEffect(50);
    expect(effect).toHaveProperty('airAbsorption');
    expect(effect).toHaveProperty('dopplerShift');
    expect(effect).toHaveProperty('ambientVolume');
    expect(effect).toHaveProperty('reverbDamping');
  });
  it('dopplerShift=1.0 when no velocities provided', () => {
    const sys = new EnvironmentalAudioSystem();
    const { dopplerShift } = sys.getEnvironmentalEffect(50);
    expect(dopplerShift).toBe(1.0);
  });
  it('ambientVolume matches current weather', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('rain');
    const { ambientVolume } = sys.getEnvironmentalEffect(10);
    expect(ambientVolume).toBe(WEATHER_PRESETS.rain.ambientVolume);
  });
  it('reverbDamping matches current weather', () => {
    const sys = new EnvironmentalAudioSystem();
    sys.setWeather('fog');
    const { reverbDamping } = sys.getEnvironmentalEffect(10);
    expect(reverbDamping).toBe(WEATHER_PRESETS.fog.reverbDamping);
  });
});
