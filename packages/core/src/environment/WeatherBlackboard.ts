/**
 * WeatherBlackboard — Singleton shared state for @weather hub trait.
 *
 * The @weather trait owns this blackboard and writes to it each frame.
 * Consumer traits (@volumetric_clouds, @cloth, @fluid, @physics, @erosion,
 * @god_rays, @particle_system) read from it. This creates environmental
 * coherence without trait-to-trait coupling.
 *
 * Pattern: P.GAPS.10 (Hub Trait Architecture)
 *
 * @module environment
 */

// =============================================================================
// Types
// =============================================================================

export type PrecipitationType = 'none' | 'rain' | 'snow' | 'hail';

export interface WeatherBlackboardState {
  // --- Core state (written by @weather hub) ---

  /** Wind direction and magnitude as a 3D vector */
  wind_vector: [number, number, number];

  /** Precipitation intensity 0-1 */
  precipitation: number;

  /** Type of precipitation */
  precipitation_type: PrecipitationType;

  /** Ambient temperature in Celsius */
  temperature: number;

  /** Relative humidity 0-1 */
  humidity: number;

  /** Normalized sun direction vector (from surface toward sun) */
  sun_position: [number, number, number];

  /** Sun light intensity 0-1 (0 at night) */
  sun_intensity: number;

  /** Cloud coverage density 0-1 */
  cloud_density: number;

  /** Cloud layer altitude in meters */
  cloud_altitude: number;

  /** Fog density 0-1 */
  fog_density: number;

  /** Time of day in hours 0-24 (fractional) */
  time_of_day: number;

  // --- Derived state (computed from core) ---

  /** True when sun_intensity < 0.1 */
  is_night: boolean;

  /** Accumulated surface moisture from rain 0-1 (decays when not raining) */
  surface_wetness: number;

  /** Wind speed (magnitude of wind_vector) */
  wind_speed: number;

  /** Visibility range in meters (affected by fog + precipitation) */
  visibility_range: number;

  /** Frame counter — incremented each @weather update */
  frame: number;
}

// =============================================================================
// Default State
// =============================================================================

const DEFAULT_STATE: WeatherBlackboardState = {
  wind_vector: [0, 0, 0],
  precipitation: 0,
  precipitation_type: 'none',
  temperature: 20,
  humidity: 0.5,
  sun_position: [0.5, 0.866, 0],  // ~60 degree elevation, noon
  sun_intensity: 1.0,
  cloud_density: 0.3,
  cloud_altitude: 2000,
  fog_density: 0,
  time_of_day: 12,
  is_night: false,
  surface_wetness: 0,
  wind_speed: 0,
  visibility_range: 10000,
  frame: 0,
};

// =============================================================================
// Blackboard Singleton
// =============================================================================

/**
 * Global weather blackboard.
 *
 * WRITE: Only the @weather hub trait should write to this.
 * READ: Any consumer trait can read from this each frame.
 *
 * The blackboard is a plain object — reads are zero-cost.
 * The @weather trait must run FIRST in the trait update loop
 * so consumers see the latest state.
 */
export const weatherBlackboard: WeatherBlackboardState = { ...DEFAULT_STATE };

/**
 * Update the blackboard with new values. Recomputes derived fields.
 * Called by WeatherHubTrait.onUpdate() each frame.
 */
export function updateWeatherBlackboard(
  partial: Partial<Omit<WeatherBlackboardState, 'is_night' | 'surface_wetness' | 'wind_speed' | 'visibility_range' | 'frame'>>
): void {
  // Apply core state updates
  Object.assign(weatherBlackboard, partial);

  // Recompute derived state
  const wv = weatherBlackboard.wind_vector;
  weatherBlackboard.wind_speed = Math.sqrt(wv[0] * wv[0] + wv[1] * wv[1] + wv[2] * wv[2]);
  weatherBlackboard.is_night = weatherBlackboard.sun_intensity < 0.1;

  // Visibility: base 10km, reduced by fog and precipitation
  weatherBlackboard.visibility_range =
    10000 * (1 - weatherBlackboard.fog_density * 0.9) * (1 - weatherBlackboard.precipitation * 0.5);

  // Surface wetness: accumulates when raining, decays otherwise
  if (weatherBlackboard.precipitation > 0 && weatherBlackboard.precipitation_type === 'rain') {
    weatherBlackboard.surface_wetness = Math.min(
      1.0,
      weatherBlackboard.surface_wetness + weatherBlackboard.precipitation * 0.01,
    );
  } else {
    weatherBlackboard.surface_wetness = Math.max(
      0,
      weatherBlackboard.surface_wetness - 0.001,
    );
  }

  weatherBlackboard.frame++;
}

/**
 * Reset blackboard to default state. Used in testing.
 */
export function resetWeatherBlackboard(): void {
  Object.assign(weatherBlackboard, DEFAULT_STATE);
  weatherBlackboard.frame = 0;
}

/**
 * Compute sun position from time of day and latitude.
 *
 * Returns normalized direction vector pointing from surface toward sun.
 * At midnight (0/24), sun is directly below horizon.
 * At noon (12), sun is at maximum elevation.
 *
 * @param timeOfDay - Hours 0-24
 * @param latitude - Degrees, default 45 (mid-latitude)
 * @returns [x, y, z] normalized sun direction
 */
export function computeSunPosition(
  timeOfDay: number,
  latitude: number = 45,
): [number, number, number] {
  const hourAngle = (timeOfDay - 12) * (Math.PI / 12); // -PI to PI
  const latRad = latitude * (Math.PI / 180);
  const maxElevation = Math.PI / 2 - Math.abs(latRad - 23.5 * Math.PI / 180);

  const elevation = Math.sin(Math.PI * timeOfDay / 24) * maxElevation;

  const x = Math.cos(hourAngle) * Math.cos(elevation);
  const y = Math.sin(elevation);
  const z = Math.sin(hourAngle) * Math.cos(elevation);

  // Normalize
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 0.001) return [0, -1, 0]; // Below horizon

  return [x / len, y / len, z / len];
}

/**
 * Compute sun intensity from elevation angle.
 * Smooth ramp: 0 at horizon, 1 at max elevation, with atmospheric scattering falloff.
 */
export function computeSunIntensity(sunY: number): number {
  if (sunY <= 0) return 0;
  // Smooth ramp with atmospheric scattering falloff near horizon
  return Math.min(1.0, sunY * 2.0) * Math.min(1.0, sunY * 5.0);
}
