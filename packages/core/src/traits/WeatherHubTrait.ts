/**
 * @weather Hub Trait — World Simulation Driver
 *
 * Owns a blackboard state that consumer traits read from each frame:
 *   @volumetric_clouds, @god_rays, @fluid, @cloth, @physics,
 *   @particle_system, @erosion
 *
 * Wraps the existing WeatherSystem class and adds:
 *   - Day-night cycle with sun position
 *   - Physics coupling parameters (wind scale, wetness friction)
 *   - Blackboard writes for consumer traits
 *   - Optional CRDT persistence
 *
 * Pattern: P.GAPS.10 (Hub Trait Architecture)
 *
 * @example
 * ```holoscript
 * world MyWorld {
 *   @weather {
 *     day_length_seconds: 600
 *     start_time: 8
 *     initial_weather: "clear"
 *     auto_cycle: true
 *     wind_physics_scale: 1.5
 *   }
 * }
 * ```
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import { WeatherSystem, type WeatherType } from '@holoscript/engine/environment/WeatherSystem';
import {
  weatherBlackboard,
  updateWeatherBlackboard,
  computeSunPosition,
  computeSunIntensity,
  type PrecipitationType,
} from '@holoscript/engine/environment/WeatherBlackboard';

// =============================================================================
// Config
// =============================================================================

export interface WeatherHubConfig {
  /** Real seconds per in-game day (default: 1200 = 20 minutes) */
  day_length_seconds: number;

  /** Starting time of day, 0-24 (default: 12 = noon) */
  start_time: number;

  /** Latitude for sun path calculation, degrees (default: 45) */
  latitude: number;

  /** Starting weather condition */
  initial_weather: WeatherType;

  /** Automatically cycle between weather types */
  auto_cycle: boolean;

  /** Minimum seconds per weather state during auto-cycle */
  cycle_min_duration: number;

  /** Maximum seconds per weather state during auto-cycle */
  cycle_max_duration: number;

  /** Weather transition duration in seconds */
  transition_duration: number;

  /** Scale factor for wind -> physics force (default: 1.0) */
  wind_physics_scale: number;

  /** Friction modifier when surface is wet (default: 0.7 = 30% less friction) */
  wetness_friction_modifier: number;

  /** Default wind direction and speed */
  wind_direction: [number, number, number];

  /** Default wind speed in m/s */
  wind_speed: number;
}

// =============================================================================
// Internal State
// =============================================================================

interface WeatherHubState {
  system: WeatherSystem;
  timeOfDay: number;
  cycleTimer: number;
  nextCycleDuration: number;
}

// =============================================================================
// Weather type -> precipitation type mapping
// =============================================================================

function toPrecipitationType(type: WeatherType): PrecipitationType {
  switch (type) {
    case 'rain':
    case 'storm':
      return 'rain';
    case 'snow':
      return 'snow';
    default:
      return 'none';
  }
}

// Available weather types for random cycling
const CYCLE_WEATHER_TYPES: WeatherType[] = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

// =============================================================================
// Trait Handler
// =============================================================================

export const weatherHubHandler: TraitHandler<WeatherHubConfig> = {
  name: 'weather',

  defaultConfig: {
    day_length_seconds: 1200,
    start_time: 12,
    latitude: 45,
    initial_weather: 'clear',
    auto_cycle: true,
    cycle_min_duration: 120,
    cycle_max_duration: 600,
    transition_duration: 10,
    wind_physics_scale: 1.0,
    wetness_friction_modifier: 0.7,
    wind_direction: [1, 0, 0.3],
    wind_speed: 2.0,
  },

  onAttach(node, config) {
    const system = new WeatherSystem(config.initial_weather);

    // Set initial wind
    const wd = config.wind_direction;
    const len = Math.sqrt(wd[0] * wd[0] + wd[1] * wd[1] + wd[2] * wd[2]) || 1;
    system.setWind(
      (wd[0] / len) * config.wind_speed,
      (wd[1] / len) * config.wind_speed,
      (wd[2] / len) * config.wind_speed,
      config.wind_speed
    );

    const state: WeatherHubState = {
      system,
      timeOfDay: config.start_time,
      cycleTimer: 0,
      nextCycleDuration: randomRange(config.cycle_min_duration, config.cycle_max_duration),
    };

    node.__weatherHubState = state;

    // Write initial blackboard state
    writeBlackboard(state, config);
  },

  onUpdate(node, config, _context, delta) {
    const state = node.__weatherHubState as WeatherHubState | undefined;
    if (!state) return;

    // Advance day-night cycle
    const hoursPerSecond = 24 / config.day_length_seconds;
    state.timeOfDay = (state.timeOfDay + delta * hoursPerSecond) % 24;

    // Update weather system transitions
    state.system.update(delta);

    // Auto-cycle weather
    if (config.auto_cycle) {
      state.cycleTimer += delta;
      if (state.cycleTimer >= state.nextCycleDuration) {
        state.cycleTimer = 0;
        state.nextCycleDuration = randomRange(config.cycle_min_duration, config.cycle_max_duration);

        // Pick a different weather type
        const current = state.system.getType();
        const candidates = CYCLE_WEATHER_TYPES.filter((t) => t !== current);
        const next = candidates[Math.floor(Math.random() * candidates.length)];
        state.system.setWeather(next, config.transition_duration);
      }
    }

    // Write to blackboard for all consumer traits
    writeBlackboard(state, config);
  },

  onDetach(node) {
    delete node.__weatherHubState;
  },

  onEvent(node, config, _context, event) {
    const state = node.__weatherHubState as WeatherHubState | undefined;
    if (!state) return;

    // Allow external control of weather
    if (event.type === 'weather_set') {
      const type = event.weather as WeatherType;
      const duration = (event.transition as number) ?? config.transition_duration;
      state.system.setWeather(type, duration);
    } else if (event.type === 'weather_set_immediate') {
      state.system.setImmediate(event.weather as WeatherType);
    } else if (event.type === 'weather_set_wind') {
      const speed = event.speed as number;
      const dir = event.direction as [number, number, number];
      const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
      state.system.setWind(
        (dir[0] / len) * speed,
        (dir[1] / len) * speed,
        (dir[2] / len) * speed,
        speed
      );
    } else if (event.type === 'weather_set_time') {
      state.timeOfDay = event.time as number;
    }
  },
};

// =============================================================================
// Helpers
// =============================================================================

function writeBlackboard(state: WeatherHubState, config: WeatherHubConfig): void {
  const ws = state.system.getState();

  const sunPos = computeSunPosition(state.timeOfDay, config.latitude);
  const sunIntensity = computeSunIntensity(sunPos[1]);

  // Scale wind by physics coupling factor
  const scale = config.wind_physics_scale;

  updateWeatherBlackboard({
    wind_vector: [ws.wind[0] * scale, ws.wind[1] * scale, ws.wind[2] * scale],
    precipitation: ws.precipitation,
    precipitation_type: toPrecipitationType(ws.type),
    temperature: ws.temperature,
    humidity: ws.humidity,
    sun_position: sunPos,
    sun_intensity: sunIntensity,
    cloud_density:
      ws.type === 'cloudy' || ws.type === 'rain' || ws.type === 'storm'
        ? ws.intensity
        : ws.type === 'fog'
          ? 0.8
          : 0.1,
    cloud_altitude: 2000,
    fog_density: ws.type === 'fog' ? ws.intensity : ws.type === 'storm' ? 0.3 : 0,
    time_of_day: state.timeOfDay,
  });
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export default weatherHubHandler;
