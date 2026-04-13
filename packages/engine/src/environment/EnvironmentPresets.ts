/**
 * EnvironmentPresets.ts
 *
 * Pre-built environment configurations for skybox, lighting, fog, and atmosphere.
 * Provides time-of-day and weather systems.
 *
 * @module environment
 */

import { IVector3 } from '../physics/PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface SkyboxConfig {
  type: 'color' | 'gradient' | 'hdri' | 'procedural';
  topColor: string;
  bottomColor: string;
  horizonColor?: string;
  hdriAsset?: string;
  turbidity?: number; // Atmospheric scattering (procedural sky)
  rayleigh?: number; // Rayleigh scattering coefficient
  sunPosition?: IVector3;
}

export interface LightConfig {
  type: 'directional' | 'ambient' | 'point' | 'spot';
  color: string;
  intensity: number;
  direction?: IVector3;
  position?: IVector3;
  castShadows?: boolean;
  shadowMapSize?: number;
}

export interface FogConfig {
  type: 'none' | 'linear' | 'exponential' | 'exponential2';
  color: string;
  near?: number;
  far?: number;
  density?: number;
}

export interface AtmosphereConfig {
  ambientOcclusion: boolean;
  bloom: boolean;
  bloomIntensity: number;
  bloomThreshold: number;
  toneMappingExposure: number;
  colorGrading?: { saturation: number; contrast: number; temperature: number };
}

export interface EnvironmentConfig {
  id: string;
  name: string;
  skybox: SkyboxConfig;
  lights: LightConfig[];
  fog: FogConfig;
  atmosphere: AtmosphereConfig;
}

export interface TimeOfDayConfig {
  sunriseHour: number;
  sunsetHour: number;
  currentHour: number;
  daySpeed: number; // Multiplier (1 = real-time, 60 = 1 min = 1 hr)
}

export interface WeatherState {
  type: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
  intensity: number; // 0-1
  windDirection: IVector3;
  windSpeed: number;
  transitionProgress: number; // 0-1 (blending between states)
}

// =============================================================================
// PRESETS
// =============================================================================

export const PRESET_SUNNY_DAY: EnvironmentConfig = {
  id: 'sunny_day',
  name: 'Sunny Day',
  skybox: {
    type: 'gradient',
    topColor: '#1e90ff',
    bottomColor: '#87ceeb',
    horizonColor: '#f0f8ff',
    sunPosition: { x: 0.5, y: 0.8, z: 0.2 },
  },
  lights: [
    {
      type: 'directional',
      color: '#fff5e6',
      intensity: 1.2,
      direction: { x: -0.5, y: -0.8, z: -0.2 },
      castShadows: true,
      shadowMapSize: 2048,
    },
    { type: 'ambient', color: '#87ceeb', intensity: 0.4 },
  ],
  fog: { type: 'exponential2', color: '#c8dff5', density: 0.0008 },
  atmosphere: {
    ambientOcclusion: true,
    bloom: true,
    bloomIntensity: 0.5,
    bloomThreshold: 0.8,
    toneMappingExposure: 1.0,
    colorGrading: { saturation: 1.1, contrast: 1.05, temperature: 6500 },
  },
};

export const PRESET_SUNSET: EnvironmentConfig = {
  id: 'sunset',
  name: 'Golden Sunset',
  skybox: {
    type: 'gradient',
    topColor: '#1a0533',
    bottomColor: '#ff6b35',
    horizonColor: '#ff4500',
    sunPosition: { x: 0.9, y: 0.1, z: 0 },
  },
  lights: [
    {
      type: 'directional',
      color: '#ff8c42',
      intensity: 0.8,
      direction: { x: -0.9, y: -0.1, z: 0 },
      castShadows: true,
      shadowMapSize: 2048,
    },
    { type: 'ambient', color: '#4a2040', intensity: 0.3 },
  ],
  fog: { type: 'exponential2', color: '#ff8c6b', density: 0.001 },
  atmosphere: {
    ambientOcclusion: true,
    bloom: true,
    bloomIntensity: 1.0,
    bloomThreshold: 0.6,
    toneMappingExposure: 1.2,
    colorGrading: { saturation: 1.3, contrast: 1.1, temperature: 4000 },
  },
};

export const PRESET_NIGHT: EnvironmentConfig = {
  id: 'night',
  name: 'Moonlit Night',
  skybox: {
    type: 'gradient',
    topColor: '#0a0a1a',
    bottomColor: '#14142b',
    horizonColor: '#1a1a3e',
    sunPosition: { x: -0.3, y: 0.6, z: 0.5 }, // Moon position
  },
  lights: [
    {
      type: 'directional',
      color: '#b0c4de',
      intensity: 0.15,
      direction: { x: 0.3, y: -0.6, z: -0.5 },
      castShadows: true,
      shadowMapSize: 1024,
    },
    { type: 'ambient', color: '#0a0a2e', intensity: 0.1 },
  ],
  fog: { type: 'exponential2', color: '#0a0a1a', density: 0.002 },
  atmosphere: {
    ambientOcclusion: true,
    bloom: true,
    bloomIntensity: 0.8,
    bloomThreshold: 0.4,
    toneMappingExposure: 0.5,
    colorGrading: { saturation: 0.7, contrast: 1.2, temperature: 8000 },
  },
};

export const PRESET_OVERCAST: EnvironmentConfig = {
  id: 'overcast',
  name: 'Overcast',
  skybox: {
    type: 'gradient',
    topColor: '#808890',
    bottomColor: '#a0a8b0',
    horizonColor: '#b0b8c0',
  },
  lights: [
    {
      type: 'directional',
      color: '#c0c0c0',
      intensity: 0.5,
      direction: { x: -0.3, y: -0.8, z: -0.2 },
      castShadows: true,
      shadowMapSize: 1024,
    },
    { type: 'ambient', color: '#909090', intensity: 0.5 },
  ],
  fog: { type: 'exponential2', color: '#a0a8b0', density: 0.0015 },
  atmosphere: {
    ambientOcclusion: true,
    bloom: false,
    bloomIntensity: 0,
    bloomThreshold: 1.0,
    toneMappingExposure: 0.8,
    colorGrading: { saturation: 0.8, contrast: 0.95, temperature: 6800 },
  },
};

export const PRESET_SCIFI: EnvironmentConfig = {
  id: 'scifi',
  name: 'Sci-Fi Neon',
  skybox: {
    type: 'gradient',
    topColor: '#0a001a',
    bottomColor: '#1a0033',
    horizonColor: '#330066',
  },
  lights: [
    {
      type: 'directional',
      color: '#00ffff',
      intensity: 0.3,
      direction: { x: 0, y: -1, z: 0 },
      castShadows: true,
      shadowMapSize: 2048,
    },
    { type: 'ambient', color: '#1a003a', intensity: 0.2 },
    { type: 'point', color: '#ff00ff', intensity: 2.0, position: [0, 10, 0] },
  ],
  fog: { type: 'exponential2', color: '#0a001a', density: 0.003 },
  atmosphere: {
    ambientOcclusion: true,
    bloom: true,
    bloomIntensity: 2.0,
    bloomThreshold: 0.3,
    toneMappingExposure: 1.5,
    colorGrading: { saturation: 1.5, contrast: 1.3, temperature: 3500 },
  },
};

// =============================================================================
// ALL PRESETS
// =============================================================================

export const ALL_PRESETS: EnvironmentConfig[] = [
  PRESET_SUNNY_DAY,
  PRESET_SUNSET,
  PRESET_NIGHT,
  PRESET_OVERCAST,
  PRESET_SCIFI,
];

// =============================================================================
// ENVIRONMENT MANAGER
// =============================================================================

export class EnvironmentManager {
  private currentEnv: EnvironmentConfig;
  private timeOfDay: TimeOfDayConfig;
  private weather: WeatherState;

  constructor(preset: EnvironmentConfig = PRESET_SUNNY_DAY) {
    this.currentEnv = { ...preset };
    this.timeOfDay = {
      sunriseHour: 6,
      sunsetHour: 18,
      currentHour: 12,
      daySpeed: 1,
    };
    this.weather = {
      type: 'clear',
      intensity: 0,
      windDirection: { x: 1, y: 0, z: 0 },
      windSpeed: 2,
      transitionProgress: 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Environment
  // ---------------------------------------------------------------------------

  setEnvironment(config: EnvironmentConfig): void {
    this.currentEnv = { ...config };
  }

  getEnvironment(): EnvironmentConfig {
    return { ...this.currentEnv };
  }

  setPreset(presetId: string): boolean {
    const preset = ALL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return false;
    this.currentEnv = { ...preset };
    return true;
  }

  getPresetIds(): string[] {
    return ALL_PRESETS.map((p) => p.id);
  }

  // ---------------------------------------------------------------------------
  // Time of Day
  // ---------------------------------------------------------------------------

  setTimeOfDay(hour: number): void {
    this.timeOfDay.currentHour = hour % 24;
    this.updateSunFromTime();
  }

  advanceTime(deltaSeconds: number): void {
    const hoursElapsed = (deltaSeconds / 3600) * this.timeOfDay.daySpeed;
    this.timeOfDay.currentHour = (this.timeOfDay.currentHour + hoursElapsed) % 24;
    this.updateSunFromTime();
  }

  getTimeOfDay(): TimeOfDayConfig {
    return { ...this.timeOfDay };
  }

  private updateSunFromTime(): void {
    const hour = this.timeOfDay.currentHour;
    const dayLength = this.timeOfDay.sunsetHour - this.timeOfDay.sunriseHour;
    const isDay = hour >= this.timeOfDay.sunriseHour && hour <= this.timeOfDay.sunsetHour;

    if (isDay) {
      const progress = (hour - this.timeOfDay.sunriseHour) / dayLength;
      const angle = progress * Math.PI; // 0 → π over the day
      this.currentEnv.skybox.sunPosition = {
        x: Math.cos(angle) * 0.5,
        y: Math.sin(angle),
        z: 0.2,
      };
      // Interpolate light intensity: peaks at noon
      const sunIntensity = Math.sin(angle);
      if (this.currentEnv.lights[0]) {
        this.currentEnv.lights[0].intensity = 0.3 + sunIntensity * 0.9;
      }
    } else {
      // Night
      this.currentEnv.skybox.sunPosition = { x: 0, y: -0.5, z: 0 };
      if (this.currentEnv.lights[0]) {
        this.currentEnv.lights[0].intensity = 0.1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Weather
  // ---------------------------------------------------------------------------

  setWeather(type: WeatherState['type'], intensity: number = 0.5): void {
    this.weather = {
      ...this.weather,
      type,
      intensity: Math.max(0, Math.min(1, intensity)),
      transitionProgress: 0,
    };

    // Adjust fog based on weather
    switch (type) {
      case 'fog':
        this.currentEnv.fog = {
          type: 'exponential2',
          color: '#c0c0c0',
          density: 0.005 * intensity,
        };
        break;
      case 'rain':
      case 'storm':
        this.currentEnv.fog = {
          type: 'exponential2',
          color: '#808080',
          density: 0.002 * intensity,
        };
        break;
      case 'snow':
        this.currentEnv.fog = {
          type: 'exponential2',
          color: '#e0e0e0',
          density: 0.003 * intensity,
        };
        break;
      default:
        break;
    }
  }

  getWeather(): WeatherState {
    return { ...this.weather };
  }

  updateWeatherTransition(dt: number): void {
    if (this.weather.transitionProgress < 1) {
      this.weather.transitionProgress = Math.min(1, this.weather.transitionProgress + dt * 0.5);
    }
  }
}
