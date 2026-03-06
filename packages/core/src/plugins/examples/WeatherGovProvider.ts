/**
 * WeatherGovProvider — Example Weather.gov VRR sync provider
 *
 * Demonstrates how to implement a custom weather provider for VRR digital twins
 * using the Weather.gov API (free, no API key required for US locations).
 *
 * @version 1.0.0
 * @example Example plugin implementation
 */

import {
  BaseWeatherProvider,
  type VRRSyncProviderConfig,
} from '../HololandExtensionPoint';
import type { WeatherData } from '../HololandTypes';

/**
 * Weather.gov API response format
 */
interface WeatherGovObservation {
  properties: {
    temperature: {
      value: number; // Celsius
      unitCode: string;
    };
    relativeHumidity: {
      value: number; // percentage
    };
    windSpeed: {
      value: number; // km/h
    };
    textDescription: string;
    timestamp: string;
  };
}

/**
 * Weather.gov weather provider
 *
 * Free, no API key required for US locations.
 * Rate limit: ~5 requests per second
 *
 * @example Usage
 * ```typescript
 * import { WeatherGovProvider } from '@holoscript/plugin-weather-gov';
 * import { getHololandRegistry } from '@holoscript/core';
 *
 * const provider = new WeatherGovProvider();
 * await provider.initialize({ providerId: 'weather-gov', displayName: 'Weather.gov' });
 *
 * const registry = getHololandRegistry();
 * registry.registerWeatherProvider(provider);
 *
 * // Fetch weather for a location
 * const weather = await provider.fetchWeather('40.7128,-74.0060'); // NYC
 * console.log(weather);
 * ```
 */
export class WeatherGovProvider extends BaseWeatherProvider {
  readonly id = 'weather-gov';
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initialize the provider
   */
  async initialize(config: VRRSyncProviderConfig): Promise<void> {
    await super.initialize(config);
    console.log('[WeatherGovProvider] Initialized');
  }

  /**
   * Fetch current weather data for a location
   * @param location - Latitude,Longitude (e.g., "40.7128,-74.0060")
   */
  async fetchWeather(location: string): Promise<WeatherData> {
    const [lat, lon] = location.split(',').map((s) => s.trim());

    if (!lat || !lon) {
      throw new Error('Location must be in format: "latitude,longitude"');
    }

    try {
      // Step 1: Get grid coordinates from lat/lon
      const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointsResponse = await fetch(pointsUrl, {
        headers: {
          'User-Agent': 'HoloScript VRR Sync (contact@holoscript.net)',
        },
      });

      if (!pointsResponse.ok) {
        throw new Error(`Weather.gov API error: ${pointsResponse.status}`);
      }

      const pointsData = await pointsResponse.json();
      const observationStationsUrl = pointsData.properties.observationStations;

      // Step 2: Get nearest observation station
      const stationsResponse = await fetch(observationStationsUrl, {
        headers: {
          'User-Agent': 'HoloScript VRR Sync (contact@holoscript.net)',
        },
      });

      if (!stationsResponse.ok) {
        throw new Error(`Weather.gov stations error: ${stationsResponse.status}`);
      }

      const stationsData = await stationsResponse.json();
      const stationId = stationsData.features[0]?.properties?.stationIdentifier;

      if (!stationId) {
        throw new Error('No weather station found for location');
      }

      // Step 3: Get latest observation
      const observationUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
      const observationResponse = await fetch(observationUrl, {
        headers: {
          'User-Agent': 'HoloScript VRR Sync (contact@holoscript.net)',
        },
      });

      if (!observationResponse.ok) {
        throw new Error(`Weather.gov observation error: ${observationResponse.status}`);
      }

      const observation: WeatherGovObservation = await observationResponse.json();

      // Step 4: Convert to WeatherData format
      const weatherData = this.convertToWeatherData(observation);

      console.log(`[WeatherGovProvider] Fetched weather for ${location}`);
      return weatherData;
    } catch (error) {
      console.error('[WeatherGovProvider] Error fetching weather:', error);
      throw error;
    }
  }

  /**
   * Subscribe to weather updates for a location
   * Updates every 5 minutes by default
   */
  subscribeToWeather(
    location: string,
    callback: (weather: WeatherData) => void
  ): () => void {
    // Initial fetch
    this.fetchWeather(location)
      .then(callback)
      .catch((err) => console.error('[WeatherGovProvider] Subscription error:', err));

    // Set up polling interval (Weather.gov updates ~hourly, poll every 5 minutes)
    const intervalId = setInterval(() => {
      this.fetchWeather(location)
        .then(callback)
        .catch((err) => console.error('[WeatherGovProvider] Subscription error:', err));
    }, 5 * 60 * 1000); // 5 minutes

    this.updateIntervals.set(location, intervalId);

    // Return unsubscribe function
    return () => {
      const interval = this.updateIntervals.get(location);
      if (interval) {
        clearInterval(interval);
        this.updateIntervals.delete(location);
      }
      super.subscribeToWeather(location, callback)(); // Call base unsubscribe
    };
  }

  /**
   * Convert Weather.gov observation to WeatherData format
   */
  private convertToWeatherData(observation: WeatherGovObservation): WeatherData {
    const props = observation.properties;

    // Map text description to condition enum
    const condition = this.mapCondition(props.textDescription);

    return {
      temperature: props.temperature.value || 0,
      condition,
      humidity: props.relativeHumidity.value || 0,
      windSpeed: props.windSpeed.value || 0,
      timestamp: new Date(props.timestamp).getTime(),
    };
  }

  /**
   * Map Weather.gov text description to condition enum
   */
  private mapCondition(
    description: string
  ): 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy' {
    const desc = description.toLowerCase();

    if (desc.includes('sunny') || desc.includes('clear')) return 'sunny';
    if (desc.includes('rain') || desc.includes('shower')) return 'rainy';
    if (desc.includes('snow') || desc.includes('flurr')) return 'snowy';
    if (desc.includes('fog') || desc.includes('mist')) return 'foggy';
    if (desc.includes('storm') || desc.includes('thunder')) return 'stormy';
    if (desc.includes('cloud') || desc.includes('overcast')) return 'cloudy';

    return 'cloudy'; // default
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Clear all update intervals
    this.updateIntervals.forEach((interval) => clearInterval(interval));
    this.updateIntervals.clear();

    super.dispose();
    console.log('[WeatherGovProvider] Disposed');
  }
}

/**
 * Plugin manifest for Weather.gov provider
 */
export const weatherGovPluginManifest = {
  id: 'holoscript-weather-gov',
  name: 'Weather.gov VRR Provider',
  version: '1.0.0',
  description: 'Free weather data provider for VRR digital twins using Weather.gov API',
  author: 'HoloScript Team',
  license: 'MIT',
  main: 'WeatherGovProvider.js',
  permissions: ['vrr:sync'] as const,
  hololandFeatures: {
    vrrProviders: [
      {
        type: 'weather' as const,
        id: 'weather-gov',
        displayName: 'Weather.gov',
        description: 'Free US weather data from NOAA',
        className: 'WeatherGovProvider',
        configSchema: {
          type: 'object',
          properties: {
            updateInterval: {
              type: 'number',
              default: 300000,
              description: 'Update interval in milliseconds (default: 5 minutes)',
            },
          },
        },
      },
    ],
  },
};
