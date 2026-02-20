/**
 * EnvironmentalAudioTrait.ts
 *
 * Environmental audio effects for realistic XR soundscapes:
 * - Weather-based audio modulation (wind, rain, thunder, fog)
 * - Air absorption (distance-based high-frequency rolloff)
 * - Doppler effect (pitch shift for moving sources)
 * - Atmospheric audio zones
 *
 * @module traits
 */

// =============================================================================
// TYPES
// =============================================================================

export type WeatherType = 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind';

export interface WeatherPreset {
  type: WeatherType;
  ambientVolume: number;       // 0-1
  reverbDamping: number;        // 0-1 (higher = more dampening)
  airAbsorptionMultiplier: number; // 0-2 (1 = normal, >1 = more absorption)
  dopplerScale: number;         // 0-2 (1 = normal)
  windSpeed: number;            // 0-100 (meters/second)
  description: string;
}

export interface AirAbsorptionCurve {
  temperature: number;          // Celsius
  humidity: number;             // 0-100%
  // Absorption per meter at different frequencies (dB/m)
  absorption: {
    500: number;    // 500 Hz
    1000: number;   // 1 kHz
    2000: number;   // 2 kHz
    4000: number;   // 4 kHz
    8000: number;   // 8 kHz
  };
}

export interface DopplerConfig {
  enabled: boolean;
  speedOfSound: number;         // m/s (default 343 at 20°C)
  maxPitchShift: number;        // 0-2 (max pitch multiplier, e.g., 1.5 = 50% higher)
}

export interface EnvironmentalAudioConfig {
  weather: WeatherType;
  airAbsorption: {
    enabled: boolean;
    temperature: number;        // Celsius
    humidity: number;           // 0-100%
  };
  doppler: DopplerConfig;
}

// =============================================================================
// WEATHER PRESETS
// =============================================================================

export const WEATHER_PRESETS: Record<WeatherType, WeatherPreset> = {
  clear: {
    type: 'clear',
    ambientVolume: 0.3,
    reverbDamping: 0.1,
    airAbsorptionMultiplier: 1.0,
    dopplerScale: 1.0,
    windSpeed: 2,
    description: 'Clear day with light breeze',
  },
  rain: {
    type: 'rain',
    ambientVolume: 0.6,
    reverbDamping: 0.5,
    airAbsorptionMultiplier: 1.3,
    dopplerScale: 0.9,
    windSpeed: 8,
    description: 'Steady rainfall with moderate dampening',
  },
  storm: {
    type: 'storm',
    ambientVolume: 0.9,
    reverbDamping: 0.7,
    airAbsorptionMultiplier: 1.8,
    dopplerScale: 0.7,
    windSpeed: 25,
    description: 'Heavy storm with high wind and rain',
  },
  snow: {
    type: 'snow',
    ambientVolume: 0.2,
    reverbDamping: 0.8,
    airAbsorptionMultiplier: 1.5,
    dopplerScale: 0.8,
    windSpeed: 5,
    description: 'Snowfall with heavy sound dampening',
  },
  fog: {
    type: 'fog',
    ambientVolume: 0.4,
    reverbDamping: 0.6,
    airAbsorptionMultiplier: 1.4,
    dopplerScale: 0.85,
    windSpeed: 3,
    description: 'Dense fog with muffled sound',
  },
  wind: {
    type: 'wind',
    ambientVolume: 0.7,
    reverbDamping: 0.3,
    airAbsorptionMultiplier: 1.1,
    dopplerScale: 1.2,
    windSpeed: 18,
    description: 'Strong wind with enhanced Doppler',
  },
};

// =============================================================================
// AIR ABSORPTION TABLES
// =============================================================================

/**
 * Get air absorption curve for given temperature and humidity.
 * Based on ISO 9613-1 atmospheric absorption.
 */
export function getAirAbsorption(temperature: number, humidity: number): AirAbsorptionCurve {
  // Simplified absorption model (real implementation would use full ISO 9613-1 tables)
  // Higher frequency = more absorption
  // Higher humidity = less absorption (water vapor absorbs less than dry air at most frequencies)
  // Higher temperature = slightly less absorption

  const tempFactor = 1 + (20 - temperature) * 0.01; // Reference: 20°C
  const humidityFactor = 1 + (50 - humidity) * 0.005; // Reference: 50%

  return {
    temperature,
    humidity,
    absorption: {
      500: 0.001 * tempFactor * humidityFactor,
      1000: 0.002 * tempFactor * humidityFactor,
      2000: 0.005 * tempFactor * humidityFactor,
      4000: 0.015 * tempFactor * humidityFactor,
      8000: 0.050 * tempFactor * humidityFactor,
    },
  };
}

// =============================================================================
// ENVIRONMENTAL AUDIO TRAIT
// =============================================================================

export interface EnvironmentalAudioTrait {
  trait_type: 'environmental_audio';

  // Weather configuration
  weather: WeatherType;
  custom_weather?: Partial<WeatherPreset>;

  // Air absorption configuration
  air_absorption_enabled: boolean;
  temperature: number;          // Celsius
  humidity: number;             // 0-100%

  // Doppler configuration
  doppler_enabled: boolean;
  doppler_speed_of_sound: number; // m/s
  doppler_max_pitch_shift: number; // 0-2

  // Atmospheric zones (optional)
  atmosphere_zones?: Array<{
    zone_id: string;
    weather: WeatherType;
    temperature: number;
    humidity: number;
  }>;
}

// =============================================================================
// ENVIRONMENTAL AUDIO SYSTEM
// =============================================================================

export class EnvironmentalAudioSystem {
  private config: EnvironmentalAudioConfig;
  private currentWeather: WeatherPreset;

  constructor() {
    this.config = {
      weather: 'clear',
      airAbsorption: {
        enabled: true,
        temperature: 20,
        humidity: 50,
      },
      doppler: {
        enabled: true,
        speedOfSound: 343,
        maxPitchShift: 1.5,
      },
    };
    this.currentWeather = WEATHER_PRESETS['clear'];
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setWeather(weather: WeatherType): void {
    this.config.weather = weather;
    this.currentWeather = WEATHER_PRESETS[weather];
  }

  getWeather(): WeatherType {
    return this.config.weather;
  }

  getWeatherPreset(): WeatherPreset {
    return { ...this.currentWeather };
  }

  setCustomWeather(preset: Partial<WeatherPreset>): void {
    this.currentWeather = { ...this.currentWeather, ...preset };
  }

  setAirAbsorption(enabled: boolean, temperature?: number, humidity?: number): void {
    this.config.airAbsorption.enabled = enabled;
    if (temperature !== undefined) {
      this.config.airAbsorption.temperature = temperature;
    }
    if (humidity !== undefined) {
      this.config.airAbsorption.humidity = Math.max(0, Math.min(100, humidity));
    }
  }

  setDoppler(enabled: boolean, speedOfSound?: number, maxPitchShift?: number): void {
    this.config.doppler.enabled = enabled;
    if (speedOfSound !== undefined) {
      this.config.doppler.speedOfSound = speedOfSound;
    }
    if (maxPitchShift !== undefined) {
      this.config.doppler.maxPitchShift = Math.max(0, Math.min(2, maxPitchShift));
    }
  }

  getConfig(): EnvironmentalAudioConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Air Absorption
  // ---------------------------------------------------------------------------

  /**
   * Calculate volume attenuation due to air absorption at a given distance.
   * Returns a multiplier (0-1) for different frequency bands.
   */
  calculateAirAbsorption(distance: number): {
    500: number;
    1000: number;
    2000: number;
    4000: number;
    8000: number;
  } {
    if (!this.config.airAbsorption.enabled || distance <= 0) {
      return { 500: 1, 1000: 1, 2000: 1, 4000: 1, 8000: 1 };
    }

    const absorption = getAirAbsorption(
      this.config.airAbsorption.temperature,
      this.config.airAbsorption.humidity,
    );

    const weatherMultiplier = this.currentWeather.airAbsorptionMultiplier;

    // Convert dB/m absorption to linear multiplier
    const result = {
      500: Math.pow(10, -(absorption.absorption[500] * weatherMultiplier * distance) / 20),
      1000: Math.pow(10, -(absorption.absorption[1000] * weatherMultiplier * distance) / 20),
      2000: Math.pow(10, -(absorption.absorption[2000] * weatherMultiplier * distance) / 20),
      4000: Math.pow(10, -(absorption.absorption[4000] * weatherMultiplier * distance) / 20),
      8000: Math.pow(10, -(absorption.absorption[8000] * weatherMultiplier * distance) / 20),
    };

    return result;
  }

  /**
   * Get overall volume attenuation for a given distance (average across frequencies).
   */
  getAirAbsorptionMultiplier(distance: number): number {
    const absorption = this.calculateAirAbsorption(distance);
    return (absorption[500] + absorption[1000] + absorption[2000] + absorption[4000] + absorption[8000]) / 5;
  }

  // ---------------------------------------------------------------------------
  // Doppler Effect
  // ---------------------------------------------------------------------------

  /**
   * Calculate Doppler pitch shift for a moving source.
   *
   * @param sourceVelocity - Velocity of the source (m/s, positive = approaching)
   * @param listenerVelocity - Velocity of the listener (m/s, positive = approaching source)
   * @returns Pitch multiplier (1.0 = no change, >1 = higher pitch, <1 = lower pitch)
   */
  calculateDopplerShift(
    sourceVelocity: { x: number; y: number; z: number },
    listenerVelocity: { x: number; y: number; z: number },
    sourceToListener: { x: number; y: number; z: number },
  ): number {
    if (!this.config.doppler.enabled) {
      return 1.0;
    }

    // Normalize direction vector
    const dist = Math.sqrt(
      sourceToListener.x ** 2 + sourceToListener.y ** 2 + sourceToListener.z ** 2,
    );

    if (dist === 0) return 1.0;

    const dir = {
      x: sourceToListener.x / dist,
      y: sourceToListener.y / dist,
      z: sourceToListener.z / dist,
    };

    // Project velocities onto direction vector
    const sourceSpeed = -(sourceVelocity.x * dir.x + sourceVelocity.y * dir.y + sourceVelocity.z * dir.z);
    const listenerSpeed = listenerVelocity.x * dir.x + listenerVelocity.y * dir.y + listenerVelocity.z * dir.z;

    // Apply weather-based Doppler scaling
    const dopplerScale = this.currentWeather.dopplerScale;
    const c = this.config.doppler.speedOfSound;

    // Doppler formula: f' = f * (c + vl) / (c + vs)
    // where vl = listener velocity toward source, vs = source velocity away from listener
    const pitchShift = ((c + listenerSpeed * dopplerScale) / (c + sourceSpeed * dopplerScale));

    // Clamp to max pitch shift
    const maxShift = this.config.doppler.maxPitchShift;
    return Math.max(1 / maxShift, Math.min(maxShift, pitchShift));
  }

  /**
   * Simplified Doppler calculation with scalar velocities.
   */
  calculateDopplerShiftSimple(relativeVelocity: number): number {
    if (!this.config.doppler.enabled) {
      return 1.0;
    }

    const c = this.config.doppler.speedOfSound;
    const dopplerScale = this.currentWeather.dopplerScale;
    const pitchShift = c / (c - relativeVelocity * dopplerScale);

    const maxShift = this.config.doppler.maxPitchShift;
    return Math.max(1 / maxShift, Math.min(maxShift, pitchShift));
  }

  // ---------------------------------------------------------------------------
  // Weather Effects
  // ---------------------------------------------------------------------------

  /**
   * Get ambient volume based on current weather.
   */
  getAmbientVolume(): number {
    return this.currentWeather.ambientVolume;
  }

  /**
   * Get reverb damping based on current weather.
   */
  getReverbDamping(): number {
    return this.currentWeather.reverbDamping;
  }

  /**
   * Get wind speed based on current weather.
   */
  getWindSpeed(): number {
    return this.currentWeather.windSpeed;
  }

  /**
   * Get comprehensive environmental audio parameters for a source at a given distance.
   */
  getEnvironmentalEffect(
    distance: number,
    sourceVelocity?: { x: number; y: number; z: number },
    listenerVelocity?: { x: number; y: number; z: number },
    sourceToListener?: { x: number; y: number; z: number },
  ): {
    airAbsorption: number;
    dopplerShift: number;
    ambientVolume: number;
    reverbDamping: number;
  } {
    const airAbsorption = this.getAirAbsorptionMultiplier(distance);

    let dopplerShift = 1.0;
    if (sourceVelocity && listenerVelocity && sourceToListener) {
      dopplerShift = this.calculateDopplerShift(sourceVelocity, listenerVelocity, sourceToListener);
    }

    return {
      airAbsorption,
      dopplerShift,
      ambientVolume: this.currentWeather.ambientVolume,
      reverbDamping: this.currentWeather.reverbDamping,
    };
  }
}
