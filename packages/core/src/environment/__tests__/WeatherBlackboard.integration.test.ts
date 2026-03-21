/**
 * WeatherBlackboard — Integration tests for hub-trait blackboard pattern.
 *
 * Tests the singleton blackboard state management, derived field computation,
 * sun position calculations, and consumer trait coupling patterns.
 *
 * @module environment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  weatherBlackboard,
  updateWeatherBlackboard,
  resetWeatherBlackboard,
  computeSunPosition,
  computeSunIntensity,
} from '../WeatherBlackboard';

describe('WeatherBlackboard', () => {
  beforeEach(() => {
    resetWeatherBlackboard();
  });

  // ── Default State ─────────────────────────────────────────────────────

  describe('default state', () => {
    it('has correct initial values', () => {
      expect(weatherBlackboard.wind_vector).toEqual([0, 0, 0]);
      expect(weatherBlackboard.precipitation).toBe(0);
      expect(weatherBlackboard.precipitation_type).toBe('none');
      expect(weatherBlackboard.temperature).toBe(20);
      expect(weatherBlackboard.humidity).toBe(0.5);
      expect(weatherBlackboard.sun_position).toEqual([0.5, 0.866, 0]);
      expect(weatherBlackboard.sun_intensity).toBe(1.0);
      expect(weatherBlackboard.cloud_density).toBe(0.3);
      expect(weatherBlackboard.cloud_altitude).toBe(2000);
      expect(weatherBlackboard.fog_density).toBe(0);
      expect(weatherBlackboard.time_of_day).toBe(12);
    });

    it('derived fields are correct at defaults', () => {
      expect(weatherBlackboard.is_night).toBe(false);
      expect(weatherBlackboard.surface_wetness).toBe(0);
      expect(weatherBlackboard.wind_speed).toBe(0);
      expect(weatherBlackboard.visibility_range).toBe(10000);
      expect(weatherBlackboard.frame).toBe(0);
    });
  });

  // ── Singleton Pattern ─────────────────────────────────────────────────

  describe('singleton', () => {
    it('weatherBlackboard is a plain object (zero-cost reads)', () => {
      expect(typeof weatherBlackboard).toBe('object');
      expect(weatherBlackboard).not.toBeNull();
    });

    it('modifications persist across reads (shared reference)', () => {
      updateWeatherBlackboard({ temperature: 35 });
      expect(weatherBlackboard.temperature).toBe(35);
    });
  });

  // ── Partial Updates ───────────────────────────────────────────────────

  describe('updateWeatherBlackboard', () => {
    it('applies partial updates', () => {
      updateWeatherBlackboard({
        wind_vector: [5, 0, 3],
        precipitation: 0.7,
        precipitation_type: 'rain',
      });
      expect(weatherBlackboard.wind_vector).toEqual([5, 0, 3]);
      expect(weatherBlackboard.precipitation).toBe(0.7);
      expect(weatherBlackboard.precipitation_type).toBe('rain');
    });

    it('preserves unspecified fields', () => {
      updateWeatherBlackboard({ temperature: 30 });
      expect(weatherBlackboard.humidity).toBe(0.5);
      expect(weatherBlackboard.cloud_density).toBe(0.3);
    });

    it('increments frame counter each call', () => {
      expect(weatherBlackboard.frame).toBe(0);
      updateWeatherBlackboard({});
      expect(weatherBlackboard.frame).toBe(1);
      updateWeatherBlackboard({});
      expect(weatherBlackboard.frame).toBe(2);
      updateWeatherBlackboard({ temperature: 25 });
      expect(weatherBlackboard.frame).toBe(3);
    });
  });

  // ── Derived State: Wind Speed ─────────────────────────────────────────

  describe('derived: wind_speed', () => {
    it('computes magnitude of wind_vector', () => {
      updateWeatherBlackboard({ wind_vector: [3, 4, 0] });
      expect(weatherBlackboard.wind_speed).toBeCloseTo(5, 5);
    });

    it('is 0 for zero wind', () => {
      updateWeatherBlackboard({ wind_vector: [0, 0, 0] });
      expect(weatherBlackboard.wind_speed).toBe(0);
    });

    it('handles 3D wind vector', () => {
      updateWeatherBlackboard({ wind_vector: [1, 2, 2] });
      expect(weatherBlackboard.wind_speed).toBeCloseTo(3, 5);
    });
  });

  // ── Derived State: is_night ───────────────────────────────────────────

  describe('derived: is_night', () => {
    it('is false when sun_intensity >= 0.1', () => {
      updateWeatherBlackboard({ sun_intensity: 0.5 });
      expect(weatherBlackboard.is_night).toBe(false);
    });

    it('is true when sun_intensity < 0.1', () => {
      updateWeatherBlackboard({ sun_intensity: 0.05 });
      expect(weatherBlackboard.is_night).toBe(true);
    });

    it('boundary: exactly 0.1 is daytime', () => {
      updateWeatherBlackboard({ sun_intensity: 0.1 });
      expect(weatherBlackboard.is_night).toBe(false);
    });

    it('boundary: 0.099 is night', () => {
      updateWeatherBlackboard({ sun_intensity: 0.099 });
      expect(weatherBlackboard.is_night).toBe(true);
    });
  });

  // ── Derived State: visibility_range ───────────────────────────────────

  describe('derived: visibility_range', () => {
    it('is 10km with no fog or precipitation', () => {
      updateWeatherBlackboard({ fog_density: 0, precipitation: 0 });
      expect(weatherBlackboard.visibility_range).toBe(10000);
    });

    it('fog reduces visibility up to 90%', () => {
      updateWeatherBlackboard({ fog_density: 1.0, precipitation: 0 });
      expect(weatherBlackboard.visibility_range).toBeCloseTo(1000, 0);
    });

    it('precipitation reduces visibility up to 50%', () => {
      updateWeatherBlackboard({ fog_density: 0, precipitation: 1.0 });
      expect(weatherBlackboard.visibility_range).toBeCloseTo(5000, 0);
    });

    it('fog + precipitation combine multiplicatively', () => {
      updateWeatherBlackboard({ fog_density: 1.0, precipitation: 1.0 });
      // 10000 * (1 - 0.9) * (1 - 0.5) = 10000 * 0.1 * 0.5 = 500
      expect(weatherBlackboard.visibility_range).toBeCloseTo(500, 0);
    });

    it('partial fog partial rain', () => {
      updateWeatherBlackboard({ fog_density: 0.5, precipitation: 0.5 });
      // 10000 * (1 - 0.45) * (1 - 0.25) = 10000 * 0.55 * 0.75 = 4125
      expect(weatherBlackboard.visibility_range).toBeCloseTo(4125, 0);
    });
  });

  // ── Derived State: surface_wetness ────────────────────────────────────

  describe('derived: surface_wetness', () => {
    it('accumulates when raining', () => {
      updateWeatherBlackboard({ precipitation: 1.0, precipitation_type: 'rain' });
      expect(weatherBlackboard.surface_wetness).toBe(0.01);
    });

    it('accumulates proportional to precipitation intensity', () => {
      updateWeatherBlackboard({ precipitation: 0.5, precipitation_type: 'rain' });
      expect(weatherBlackboard.surface_wetness).toBe(0.005);
    });

    it('does not accumulate for snow', () => {
      updateWeatherBlackboard({ precipitation: 1.0, precipitation_type: 'snow' });
      // No accumulation, but decay applies
      expect(weatherBlackboard.surface_wetness).toBe(0);
    });

    it('does not accumulate for hail', () => {
      updateWeatherBlackboard({ precipitation: 1.0, precipitation_type: 'hail' });
      expect(weatherBlackboard.surface_wetness).toBe(0);
    });

    it('decays when not raining', () => {
      // First make it wet
      for (let i = 0; i < 50; i++) {
        updateWeatherBlackboard({ precipitation: 1.0, precipitation_type: 'rain' });
      }
      const wetAfterRain = weatherBlackboard.surface_wetness;
      expect(wetAfterRain).toBeGreaterThan(0);

      // Now stop rain and let it decay
      updateWeatherBlackboard({ precipitation: 0, precipitation_type: 'none' });
      expect(weatherBlackboard.surface_wetness).toBeLessThan(wetAfterRain);
    });

    it('clamps to [0, 1]', () => {
      // Rain for many frames
      for (let i = 0; i < 200; i++) {
        updateWeatherBlackboard({ precipitation: 1.0, precipitation_type: 'rain' });
      }
      expect(weatherBlackboard.surface_wetness).toBeLessThanOrEqual(1.0);
      expect(weatherBlackboard.surface_wetness).toBeGreaterThanOrEqual(0);
    });

    it('does not go below 0 after long dry period', () => {
      for (let i = 0; i < 1000; i++) {
        updateWeatherBlackboard({ precipitation: 0, precipitation_type: 'none' });
      }
      expect(weatherBlackboard.surface_wetness).toBe(0);
    });
  });

  // ── Reset ─────────────────────────────────────────────────────────────

  describe('resetWeatherBlackboard', () => {
    it('restores all fields to defaults', () => {
      updateWeatherBlackboard({
        wind_vector: [10, 5, 3],
        precipitation: 1.0,
        precipitation_type: 'hail',
        temperature: -10,
        fog_density: 0.8,
      });

      resetWeatherBlackboard();

      expect(weatherBlackboard.wind_vector).toEqual([0, 0, 0]);
      expect(weatherBlackboard.precipitation).toBe(0);
      expect(weatherBlackboard.precipitation_type).toBe('none');
      expect(weatherBlackboard.temperature).toBe(20);
      expect(weatherBlackboard.fog_density).toBe(0);
    });

    it('resets frame counter to 0', () => {
      for (let i = 0; i < 10; i++) updateWeatherBlackboard({});
      expect(weatherBlackboard.frame).toBe(10);
      resetWeatherBlackboard();
      expect(weatherBlackboard.frame).toBe(0);
    });

    it('resets derived state', () => {
      updateWeatherBlackboard({ sun_intensity: 0, fog_density: 1.0 });
      resetWeatherBlackboard();
      expect(weatherBlackboard.is_night).toBe(false);
      expect(weatherBlackboard.visibility_range).toBe(10000);
      expect(weatherBlackboard.surface_wetness).toBe(0);
    });
  });

  // ── Sun Position ──────────────────────────────────────────────────────

  describe('computeSunPosition', () => {
    it('at noon (12h), sun Y is positive (above horizon)', () => {
      const [, y] = computeSunPosition(12);
      expect(y).toBeGreaterThan(0);
    });

    it('at midnight (0h), sun Y is near 0 or below', () => {
      const [, y] = computeSunPosition(0);
      expect(y).toBeLessThanOrEqual(0.01);
    });

    it('at midnight (24h), same as 0h', () => {
      const pos0 = computeSunPosition(0);
      const pos24 = computeSunPosition(24);
      expect(pos0[1]).toBeCloseTo(pos24[1], 2);
    });

    it('returns normalized vector', () => {
      const [x, y, z] = computeSunPosition(12);
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(len).toBeCloseTo(1, 2);
    });

    it('morning (6h) sun is lower than noon', () => {
      const [, yMorning] = computeSunPosition(6);
      const [, yNoon] = computeSunPosition(12);
      expect(yMorning).toBeLessThan(yNoon);
    });

    it('different latitudes yield different positions', () => {
      const posEquator = computeSunPosition(12, 0);
      const posArctic = computeSunPosition(12, 66);
      // Different latitude = different sun elevation
      expect(posEquator[1]).not.toBeCloseTo(posArctic[1], 1);
    });

    it('default latitude is 45 degrees', () => {
      const posDefault = computeSunPosition(12);
      const pos45 = computeSunPosition(12, 45);
      expect(posDefault[0]).toBeCloseTo(pos45[0], 5);
      expect(posDefault[1]).toBeCloseTo(pos45[1], 5);
      expect(posDefault[2]).toBeCloseTo(pos45[2], 5);
    });
  });

  // ── Sun Intensity ─────────────────────────────────────────────────────

  describe('computeSunIntensity', () => {
    it('is 0 when sun is at or below horizon', () => {
      expect(computeSunIntensity(0)).toBe(0);
      expect(computeSunIntensity(-0.5)).toBe(0);
    });

    it('increases with elevation', () => {
      const low = computeSunIntensity(0.1);
      const high = computeSunIntensity(0.5);
      expect(high).toBeGreaterThan(low);
    });

    it('reaches 1.0 at full elevation', () => {
      expect(computeSunIntensity(1.0)).toBe(1.0);
    });

    it('clamps to max 1.0', () => {
      expect(computeSunIntensity(2.0)).toBeLessThanOrEqual(1.0);
    });

    it('has smooth ramp near horizon (atmospheric scattering)', () => {
      const justAbove = computeSunIntensity(0.01);
      // Very low elevation should give very low intensity
      expect(justAbove).toBeLessThan(0.1);
      expect(justAbove).toBeGreaterThan(0);
    });
  });

  // ── Consumer Trait Coupling ───────────────────────────────────────────

  describe('consumer trait coupling', () => {
    it('@cloth can read wind_vector for fabric simulation', () => {
      updateWeatherBlackboard({ wind_vector: [8, 0, 2] });
      // Cloth trait reads wind
      const wind = weatherBlackboard.wind_vector;
      expect(wind[0]).toBe(8);
      expect(wind[2]).toBe(2);
    });

    it('@volumetric_clouds can read cloud_density', () => {
      updateWeatherBlackboard({ cloud_density: 0.8 });
      expect(weatherBlackboard.cloud_density).toBe(0.8);
    });

    it('@god_rays reads sun_position and sun_intensity', () => {
      updateWeatherBlackboard({
        sun_position: [0.3, 0.7, 0.1],
        sun_intensity: 0.9,
      });
      expect(weatherBlackboard.sun_position).toEqual([0.3, 0.7, 0.1]);
      expect(weatherBlackboard.sun_intensity).toBe(0.9);
    });

    it('@fluid reads wind and precipitation', () => {
      updateWeatherBlackboard({
        wind_vector: [2, 0, 1],
        precipitation: 0.5,
      });
      expect(weatherBlackboard.wind_speed).toBeCloseTo(Math.sqrt(5), 5);
      expect(weatherBlackboard.precipitation).toBe(0.5);
    });

    it('@erosion reads precipitation and humidity', () => {
      updateWeatherBlackboard({ precipitation: 0.3, humidity: 0.8 });
      expect(weatherBlackboard.precipitation).toBe(0.3);
      expect(weatherBlackboard.humidity).toBe(0.8);
    });

    it('full weather cycle: dawn → noon → dusk → night', () => {
      // Dawn
      updateWeatherBlackboard({
        time_of_day: 6,
        sun_intensity: computeSunIntensity(computeSunPosition(6)[1]),
        sun_position: computeSunPosition(6),
      });
      expect(weatherBlackboard.is_night).toBe(false);
      const dawnIntensity = weatherBlackboard.sun_intensity;

      // Noon
      updateWeatherBlackboard({
        time_of_day: 12,
        sun_intensity: computeSunIntensity(computeSunPosition(12)[1]),
        sun_position: computeSunPosition(12),
      });
      expect(weatherBlackboard.sun_intensity).toBeGreaterThanOrEqual(dawnIntensity);

      // Dusk
      updateWeatherBlackboard({
        time_of_day: 18,
        sun_intensity: computeSunIntensity(computeSunPosition(18)[1]),
        sun_position: computeSunPosition(18),
      });

      // Night
      updateWeatherBlackboard({
        time_of_day: 0,
        sun_intensity: 0,
        sun_position: [0, -1, 0],
      });
      expect(weatherBlackboard.is_night).toBe(true);
    });
  });
});
