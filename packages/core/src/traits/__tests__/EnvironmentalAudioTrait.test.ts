import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnvironmentalAudioSystem,
  WEATHER_PRESETS,
  getAirAbsorption,
  type WeatherType,
} from '../EnvironmentalAudioTrait';

describe('EnvironmentalAudioTrait', () => {
  let system: EnvironmentalAudioSystem;

  beforeEach(() => {
    system = new EnvironmentalAudioSystem();
  });

  // ==========================================================================
  // WEATHER PRESETS
  // ==========================================================================

  describe('Weather Presets', () => {
    it('has all required weather types', () => {
      const weatherTypes: WeatherType[] = ['clear', 'rain', 'storm', 'snow', 'fog', 'wind'];
      for (const type of weatherTypes) {
        expect(WEATHER_PRESETS[type]).toBeDefined();
        expect(WEATHER_PRESETS[type].type).toBe(type);
      }
    });

    it('storm has highest ambient volume', () => {
      expect(WEATHER_PRESETS.storm.ambientVolume).toBeGreaterThanOrEqual(
        WEATHER_PRESETS.clear.ambientVolume
      );
      expect(WEATHER_PRESETS.storm.ambientVolume).toBeGreaterThanOrEqual(
        WEATHER_PRESETS.rain.ambientVolume
      );
    });

    it('snow has highest reverb damping', () => {
      expect(WEATHER_PRESETS.snow.reverbDamping).toBeGreaterThanOrEqual(
        WEATHER_PRESETS.clear.reverbDamping
      );
      expect(WEATHER_PRESETS.snow.reverbDamping).toBeGreaterThanOrEqual(
        WEATHER_PRESETS.rain.reverbDamping
      );
    });

    it('clear has lowest air absorption', () => {
      expect(WEATHER_PRESETS.clear.airAbsorptionMultiplier).toBeLessThanOrEqual(
        WEATHER_PRESETS.storm.airAbsorptionMultiplier
      );
    });

    it('storm has highest wind speed', () => {
      expect(WEATHER_PRESETS.storm.windSpeed).toBeGreaterThan(WEATHER_PRESETS.clear.windSpeed);
      expect(WEATHER_PRESETS.storm.windSpeed).toBeGreaterThan(WEATHER_PRESETS.rain.windSpeed);
    });
  });

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  describe('Configuration', () => {
    it('initializes with clear weather', () => {
      expect(system.getWeather()).toBe('clear');
      const preset = system.getWeatherPreset();
      expect(preset.type).toBe('clear');
    });

    it('changes weather type', () => {
      system.setWeather('rain');
      expect(system.getWeather()).toBe('rain');
      expect(system.getWeatherPreset().type).toBe('rain');
    });

    it('applies custom weather modifications', () => {
      system.setWeather('clear');
      system.setCustomWeather({ ambientVolume: 0.9 });

      const preset = system.getWeatherPreset();
      expect(preset.ambientVolume).toBe(0.9);
    });

    it('enables and disables air absorption', () => {
      system.setAirAbsorption(false);
      expect(system.getConfig().airAbsorption.enabled).toBe(false);

      system.setAirAbsorption(true);
      expect(system.getConfig().airAbsorption.enabled).toBe(true);
    });

    it('sets air absorption parameters', () => {
      system.setAirAbsorption(true, 25, 70);
      const config = system.getConfig();
      expect(config.airAbsorption.temperature).toBe(25);
      expect(config.airAbsorption.humidity).toBe(70);
    });

    it('clamps humidity to 0-100 range', () => {
      system.setAirAbsorption(true, 20, 150);
      expect(system.getConfig().airAbsorption.humidity).toBe(100);

      system.setAirAbsorption(true, 20, -10);
      expect(system.getConfig().airAbsorption.humidity).toBe(0);
    });

    it('enables and disables Doppler effect', () => {
      system.setDoppler(false);
      expect(system.getConfig().doppler.enabled).toBe(false);

      system.setDoppler(true);
      expect(system.getConfig().doppler.enabled).toBe(true);
    });

    it('sets Doppler parameters', () => {
      system.setDoppler(true, 340, 1.8);
      const config = system.getConfig();
      expect(config.doppler.speedOfSound).toBe(340);
      expect(config.doppler.maxPitchShift).toBe(1.8);
    });

    it('clamps max pitch shift to 0-2 range', () => {
      system.setDoppler(true, 343, 3.0);
      expect(system.getConfig().doppler.maxPitchShift).toBe(2.0);

      system.setDoppler(true, 343, -0.5);
      expect(system.getConfig().doppler.maxPitchShift).toBe(0);
    });
  });

  // ==========================================================================
  // AIR ABSORPTION
  // ==========================================================================

  describe('Air Absorption', () => {
    it('calculates air absorption for standard conditions', () => {
      const absorption = getAirAbsorption(20, 50);
      expect(absorption.temperature).toBe(20);
      expect(absorption.humidity).toBe(50);
      expect(absorption.absorption[8000]).toBeGreaterThan(absorption.absorption[500]);
    });

    it('higher frequency has more absorption', () => {
      const absorption = getAirAbsorption(20, 50);
      expect(absorption.absorption[8000]).toBeGreaterThan(absorption.absorption[4000]);
      expect(absorption.absorption[4000]).toBeGreaterThan(absorption.absorption[2000]);
      expect(absorption.absorption[2000]).toBeGreaterThan(absorption.absorption[1000]);
      expect(absorption.absorption[1000]).toBeGreaterThan(absorption.absorption[500]);
    });

    it('returns no absorption at zero distance', () => {
      const result = system.calculateAirAbsorption(0);
      expect(result[500]).toBe(1);
      expect(result[1000]).toBe(1);
      expect(result[8000]).toBe(1);
    });

    it('absorption increases with distance', () => {
      const short = system.calculateAirAbsorption(10);
      const long = system.calculateAirAbsorption(100);

      expect(long[8000]).toBeLessThan(short[8000]);
      expect(long[4000]).toBeLessThan(short[4000]);
    });

    it('high frequencies absorb more than low frequencies', () => {
      const result = system.calculateAirAbsorption(100);
      expect(result[8000]).toBeLessThan(result[4000]);
      expect(result[4000]).toBeLessThan(result[2000]);
      expect(result[2000]).toBeLessThan(result[1000]);
      expect(result[1000]).toBeLessThan(result[500]);
    });

    it('returns 1.0 when air absorption is disabled', () => {
      system.setAirAbsorption(false);
      const result = system.calculateAirAbsorption(100);
      expect(result[500]).toBe(1);
      expect(result[8000]).toBe(1);
    });

    it('weather affects air absorption', () => {
      system.setWeather('clear');
      const clearAbsorption = system.getAirAbsorptionMultiplier(100);

      system.setWeather('storm');
      const stormAbsorption = system.getAirAbsorptionMultiplier(100);

      // Storm has higher absorption multiplier
      expect(stormAbsorption).toBeLessThan(clearAbsorption);
    });

    it('overall multiplier is average of frequency bands', () => {
      const multiplier = system.getAirAbsorptionMultiplier(100);
      const detailed = system.calculateAirAbsorption(100);

      const average =
        (detailed[500] + detailed[1000] + detailed[2000] + detailed[4000] + detailed[8000]) / 5;
      expect(multiplier).toBeCloseTo(average, 5);
    });
  });

  // ==========================================================================
  // DOPPLER EFFECT
  // ==========================================================================

  describe('Doppler Effect', () => {
    it('returns 1.0 for stationary source and listener', () => {
      const shift = system.calculateDopplerShift(
        { x: 0, y: 0, z: 0 }, // source velocity
        { x: 0, y: 0, z: 0 }, // listener velocity
        { x: 10, y: 0, z: 0 } // source to listener
      );
      expect(shift).toBeCloseTo(1.0, 2);
    });

    it('increases pitch when source approaches listener', () => {
      const shift = system.calculateDopplerShift(
        { x: 10, y: 0, z: 0 }, // source moving toward listener (positive x)
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 } // listener at +x
      );
      expect(shift).toBeGreaterThan(1.0);
    });

    it('decreases pitch when source moves away', () => {
      const shift = system.calculateDopplerShift(
        { x: -10, y: 0, z: 0 }, // source moving away (negative x)
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );
      expect(shift).toBeLessThan(1.0);
    });

    it('returns 1.0 when Doppler is disabled', () => {
      system.setDoppler(false);
      const shift = system.calculateDopplerShift(
        { x: 50, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );
      expect(shift).toBe(1.0);
    });

    it('clamps pitch shift to max', () => {
      system.setDoppler(true, 343, 1.3);
      const shift = system.calculateDopplerShift(
        { x: 200, y: 0, z: 0 }, // Very fast approach
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );
      expect(shift).toBeLessThanOrEqual(1.3);
    });

    it('simple Doppler with positive velocity increases pitch', () => {
      const shift = system.calculateDopplerShiftSimple(10); // approaching
      expect(shift).toBeGreaterThan(1.0);
    });

    it('simple Doppler with negative velocity decreases pitch', () => {
      const shift = system.calculateDopplerShiftSimple(-10); // receding
      expect(shift).toBeLessThan(1.0);
    });

    it('weather affects Doppler scale', () => {
      system.setWeather('wind'); // Higher Doppler scale
      const windShift = system.calculateDopplerShift(
        { x: 20, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );

      system.setWeather('storm'); // Lower Doppler scale
      const stormShift = system.calculateDopplerShift(
        { x: 20, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );

      // Wind should have stronger Doppler effect
      expect(Math.abs(windShift - 1.0)).toBeGreaterThan(Math.abs(stormShift - 1.0));
    });

    it('returns 1.0 for zero distance', () => {
      const shift = system.calculateDopplerShift(
        { x: 10, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 } // Zero distance
      );
      expect(shift).toBe(1.0);
    });
  });

  // ==========================================================================
  // WEATHER EFFECTS
  // ==========================================================================

  describe('Weather Effects', () => {
    it('returns correct ambient volume for weather', () => {
      system.setWeather('storm');
      expect(system.getAmbientVolume()).toBe(WEATHER_PRESETS.storm.ambientVolume);

      system.setWeather('clear');
      expect(system.getAmbientVolume()).toBe(WEATHER_PRESETS.clear.ambientVolume);
    });

    it('returns correct reverb damping for weather', () => {
      system.setWeather('snow');
      expect(system.getReverbDamping()).toBe(WEATHER_PRESETS.snow.reverbDamping);
    });

    it('returns correct wind speed for weather', () => {
      system.setWeather('storm');
      expect(system.getWindSpeed()).toBe(WEATHER_PRESETS.storm.windSpeed);
    });
  });

  // ==========================================================================
  // COMPREHENSIVE ENVIRONMENTAL EFFECT
  // ==========================================================================

  describe('Comprehensive Environmental Effect', () => {
    it('returns all environmental parameters', () => {
      const effect = system.getEnvironmentalEffect(100);

      expect(effect.airAbsorption).toBeDefined();
      expect(effect.dopplerShift).toBe(1.0); // No velocity provided
      expect(effect.ambientVolume).toBeDefined();
      expect(effect.reverbDamping).toBeDefined();
    });

    it('includes Doppler when velocities provided', () => {
      const effect = system.getEnvironmentalEffect(
        100,
        { x: 10, y: 0, z: 0 }, // source velocity
        { x: 0, y: 0, z: 0 }, // listener velocity
        { x: 100, y: 0, z: 0 } // source to listener
      );

      expect(effect.dopplerShift).toBeGreaterThan(1.0);
    });

    it('air absorption decreases with distance', () => {
      const near = system.getEnvironmentalEffect(10);
      const far = system.getEnvironmentalEffect(200);

      expect(far.airAbsorption).toBeLessThan(near.airAbsorption);
    });

    it('weather affects all parameters', () => {
      system.setWeather('storm');
      const storm = system.getEnvironmentalEffect(100);

      system.setWeather('clear');
      const clear = system.getEnvironmentalEffect(100);

      expect(storm.ambientVolume).toBeGreaterThan(clear.ambientVolume);
      expect(storm.reverbDamping).toBeGreaterThan(clear.reverbDamping);
      expect(storm.airAbsorption).toBeLessThan(clear.airAbsorption); // More absorption in storm
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles negative distance gracefully', () => {
      const result = system.calculateAirAbsorption(-10);
      expect(result[500]).toBe(1);
      expect(result[8000]).toBe(1);
    });

    it('handles extreme temperatures', () => {
      system.setAirAbsorption(true, -40, 50);
      const cold = system.calculateAirAbsorption(100);

      system.setAirAbsorption(true, 50, 50);
      const hot = system.calculateAirAbsorption(100);

      expect(cold).toBeDefined();
      expect(hot).toBeDefined();
    });

    it('handles extreme humidity', () => {
      system.setAirAbsorption(true, 20, 0);
      const dry = system.calculateAirAbsorption(100);

      system.setAirAbsorption(true, 20, 100);
      const humid = system.calculateAirAbsorption(100);

      expect(dry).toBeDefined();
      expect(humid).toBeDefined();
    });

    it('handles very high velocities', () => {
      const shift = system.calculateDopplerShiftSimple(300); // Near speed of sound
      expect(shift).toBeGreaterThan(1.0);
      expect(shift).toBeLessThanOrEqual(system.getConfig().doppler.maxPitchShift);
    });
  });
});
