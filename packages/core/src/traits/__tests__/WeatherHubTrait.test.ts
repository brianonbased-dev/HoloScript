/**
 * WeatherHubTrait — comprehensive test suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WeatherType, WeatherState } from '@holoscript/engine/environment/WeatherSystem';

// ---------------------------------------------------------------------------
// Hoisted mock variables (must precede vi.mock calls which are hoisted)
// ---------------------------------------------------------------------------

const {
  mockSetWeather,
  mockSetImmediate,
  mockSetWind,
  mockUpdate,
  mockGetType,
  mockGetState,
  mockUpdateWeatherBlackboard,
  mockComputeSunPosition,
  mockComputeSunIntensity,
} = vi.hoisted(() => {
  return {
    mockSetWeather: vi.fn(),
    mockSetImmediate: vi.fn(),
    mockSetWind: vi.fn(),
    mockUpdate: vi.fn(),
    mockGetType: vi.fn<[], WeatherType>().mockReturnValue('clear'),
    mockGetState: vi.fn<[], WeatherState>(),
    mockUpdateWeatherBlackboard: vi.fn(),
    mockComputeSunPosition: vi.fn<[number, number?], [number, number, number]>().mockReturnValue([0.5, 0.866, 0]),
    mockComputeSunIntensity: vi.fn<[number], number>().mockReturnValue(1.0),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@holoscript/engine/environment/WeatherSystem', () => ({
  WeatherSystem: vi.fn().mockImplementation(function (initial: WeatherType) {
    mockGetType.mockReturnValue(initial ?? 'clear');
    // Do NOT override mockGetState here — tests set up their own return values
    // via beforeEach or individual test setup. The beforeEach default covers
    // most tests; special tests override before calling onAttach.
    return {
      setWeather: mockSetWeather,
      setImmediate: mockSetImmediate,
      setWind: mockSetWind,
      update: mockUpdate,
      getType: mockGetType,
      getState: mockGetState,
    };
  }),
}));

vi.mock('@holoscript/engine/environment/WeatherBlackboard', () => ({
  weatherBlackboard: {
    wind_vector: [0, 0, 0],
    precipitation: 0,
    precipitation_type: 'none',
    temperature: 20,
    humidity: 0.5,
    sun_position: [0.5, 0.866, 0],
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
  },
  updateWeatherBlackboard: mockUpdateWeatherBlackboard,
  computeSunPosition: mockComputeSunPosition,
  computeSunIntensity: mockComputeSunIntensity,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { weatherHubHandler } from '../WeatherHubTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockNode = Record<string, unknown>;

function makeNode(): MockNode {
  return {};
}

const defaultConfig = weatherHubHandler.defaultConfig!;

function makeConfig(overrides: Partial<typeof defaultConfig> = {}): typeof defaultConfig {
  return { ...defaultConfig, ...overrides };
}

const noopContext = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WeatherHubTrait', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset getState default — wind must include numeric indices (0,1,2) to match
    // WeatherSystem.setWind which uses Object.assign({x,y,z,speed},{0:x,1:y,2:z})
    mockGetState.mockReturnValue({
      type: 'clear',
      intensity: 0,
      wind: Object.assign({ x: 1, y: 0, z: 0.3, speed: 2 }, { 0: 1, 1: 0, 2: 0.3 }),
      temperature: 20,
      humidity: 0.5,
      visibility: 1,
      precipitation: 0,
    } as WeatherState);
    mockGetType.mockReturnValue('clear');
    mockComputeSunPosition.mockReturnValue([0.5, 0.866, 0] as [number, number, number]);
    mockComputeSunIntensity.mockReturnValue(1.0);
  });

  // -------------------------------------------------------------------------
  // defaultConfig
  // -------------------------------------------------------------------------
  describe('defaultConfig', () => {
    it('has expected default values', () => {
      expect(defaultConfig.day_length_seconds).toBe(1200);
      expect(defaultConfig.start_time).toBe(12);
      expect(defaultConfig.latitude).toBe(45);
      expect(defaultConfig.initial_weather).toBe('clear');
      expect(defaultConfig.auto_cycle).toBe(true);
      expect(defaultConfig.cycle_min_duration).toBe(120);
      expect(defaultConfig.cycle_max_duration).toBe(600);
      expect(defaultConfig.transition_duration).toBe(10);
      expect(defaultConfig.wind_physics_scale).toBe(1.0);
      expect(defaultConfig.wetness_friction_modifier).toBe(0.7);
      expect(defaultConfig.wind_direction).toEqual([1, 0, 0.3]);
      expect(defaultConfig.wind_speed).toBe(2.0);
    });
  });

  // -------------------------------------------------------------------------
  // onAttach
  // -------------------------------------------------------------------------
  describe('onAttach', () => {
    it('creates __weatherHubState on the node', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      expect(node.__weatherHubState).toBeDefined();
    });

    it('sets timeOfDay from start_time', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, makeConfig({ start_time: 8 }), noopContext);
      const state = node.__weatherHubState as { timeOfDay: number };
      expect(state.timeOfDay).toBe(8);
    });

    it('sets cycleTimer to 0', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const state = node.__weatherHubState as { cycleTimer: number };
      expect(state.cycleTimer).toBe(0);
    });

    it('sets nextCycleDuration within [cycle_min_duration, cycle_max_duration]', () => {
      const cfg = makeConfig({ cycle_min_duration: 100, cycle_max_duration: 200 });
      for (let i = 0; i < 20; i++) {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, cfg, noopContext);
        const state = node.__weatherHubState as { nextCycleDuration: number };
        expect(state.nextCycleDuration).toBeGreaterThanOrEqual(100);
        expect(state.nextCycleDuration).toBeLessThanOrEqual(200);
      }
    });

    it('calls WeatherSystem constructor with initial_weather', async () => {
      const { WeatherSystem } = await import('@holoscript/engine/environment/WeatherSystem');
      const node = makeNode();
      weatherHubHandler.onAttach!(node, makeConfig({ initial_weather: 'rain' }), noopContext);
      expect(WeatherSystem).toHaveBeenCalledWith('rain');
    });

    it('calls setWind with normalized direction scaled by wind_speed', () => {
      const cfg = makeConfig({
        wind_direction: [3, 0, 4], // len=5, normalized=[0.6,0,0.8]
        wind_speed: 10,
      });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      expect(mockSetWind).toHaveBeenCalledWith(
        expect.closeTo(0.6 * 10, 5),
        expect.closeTo(0 * 10, 5),
        expect.closeTo(0.8 * 10, 5),
        10
      );
    });

    it('handles zero-length wind_direction without divide-by-zero', () => {
      const cfg = makeConfig({ wind_direction: [0, 0, 0], wind_speed: 5 });
      const node = makeNode();
      expect(() => weatherHubHandler.onAttach!(node, cfg, noopContext)).not.toThrow();
      // len=0, fallback len=1, so components stay 0
      expect(mockSetWind).toHaveBeenCalledWith(0, 0, 0, 5);
    });

    it('writes initial blackboard via updateWeatherBlackboard', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      expect(mockUpdateWeatherBlackboard).toHaveBeenCalled();
    });

    it('passes time_of_day to blackboard write', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, makeConfig({ start_time: 6 }), noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls[0][0] as Record<string, unknown>;
      expect(call.time_of_day).toBe(6);
    });
  });

  // -------------------------------------------------------------------------
  // onDetach
  // -------------------------------------------------------------------------
  describe('onDetach', () => {
    it('deletes __weatherHubState', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      expect(node.__weatherHubState).toBeDefined();
      weatherHubHandler.onDetach!(node, defaultConfig, noopContext);
      expect(node.__weatherHubState).toBeUndefined();
    });

    it('does not throw if state was never attached', () => {
      const node = makeNode();
      expect(() => weatherHubHandler.onDetach!(node, defaultConfig, noopContext)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // onUpdate
  // -------------------------------------------------------------------------
  describe('onUpdate', () => {
    it('advances timeOfDay by (24/day_length_seconds)*delta', () => {
      const cfg = makeConfig({ day_length_seconds: 240, start_time: 0 });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      weatherHubHandler.onUpdate!(node, cfg, noopContext, 10); // 10s → 24/240*10=1 hour
      const state = node.__weatherHubState as { timeOfDay: number };
      expect(state.timeOfDay).toBeCloseTo(1, 5);
    });

    it('wraps timeOfDay at 24', () => {
      const cfg = makeConfig({ day_length_seconds: 24, start_time: 23 });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      weatherHubHandler.onUpdate!(node, cfg, noopContext, 2); // 2s → 2 hours past midnight
      const state = node.__weatherHubState as { timeOfDay: number };
      expect(state.timeOfDay).toBeCloseTo(1, 5); // (23+2)%24=1
    });

    it('calls system.update with delta', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      mockUpdate.mockClear();
      weatherHubHandler.onUpdate!(node, defaultConfig, noopContext, 0.016);
      expect(mockUpdate).toHaveBeenCalledWith(0.016);
    });

    it('increments cycleTimer each update', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      weatherHubHandler.onUpdate!(node, defaultConfig, noopContext, 5);
      const state = node.__weatherHubState as { cycleTimer: number };
      expect(state.cycleTimer).toBeGreaterThan(0);
    });

    it('triggers auto-cycle when cycleTimer exceeds nextCycleDuration', () => {
      const cfg = makeConfig({
        auto_cycle: true,
        cycle_min_duration: 10,
        cycle_max_duration: 10, // fixed for determinism
        transition_duration: 5,
      });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      mockSetWeather.mockClear();
      // Large delta to exceed duration
      weatherHubHandler.onUpdate!(node, cfg, noopContext, 20);
      expect(mockSetWeather).toHaveBeenCalledWith(expect.any(String), 5);
    });

    it('resets cycleTimer after auto-cycle', () => {
      const cfg = makeConfig({
        auto_cycle: true,
        cycle_min_duration: 10,
        cycle_max_duration: 10,
      });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      weatherHubHandler.onUpdate!(node, cfg, noopContext, 20);
      const state = node.__weatherHubState as { cycleTimer: number };
      expect(state.cycleTimer).toBe(0);
    });

    it('picks a different weather type on auto-cycle', () => {
      const cfg = makeConfig({
        auto_cycle: true,
        cycle_min_duration: 5,
        cycle_max_duration: 5,
      });
      mockGetType.mockReturnValue('clear');
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      mockSetWeather.mockClear();
      weatherHubHandler.onUpdate!(node, cfg, noopContext, 10);
      if (mockSetWeather.mock.calls.length > 0) {
        const nextType = mockSetWeather.mock.calls[0][0];
        expect(nextType).not.toBe('clear');
      }
    });

    it('does NOT auto-cycle when auto_cycle is false', () => {
      const cfg = makeConfig({
        auto_cycle: false,
        cycle_min_duration: 1,
        cycle_max_duration: 1,
      });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      mockSetWeather.mockClear();
      weatherHubHandler.onUpdate!(node, cfg, noopContext, 100);
      expect(mockSetWeather).not.toHaveBeenCalled();
    });

    it('writes blackboard on every update', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const callsBefore = mockUpdateWeatherBlackboard.mock.calls.length;
      weatherHubHandler.onUpdate!(node, defaultConfig, noopContext, 0.016);
      expect(mockUpdateWeatherBlackboard.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('is a no-op when state is missing', () => {
      const node = makeNode();
      expect(() => weatherHubHandler.onUpdate!(node, defaultConfig, noopContext, 1)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // onEvent
  // -------------------------------------------------------------------------
  describe('onEvent', () => {
    it('ignores events if state is missing', () => {
      const node = makeNode();
      expect(() =>
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, { type: 'weather_set', weather: 'rain' })
      ).not.toThrow();
    });

    describe('weather_set', () => {
      it('calls system.setWeather with type and transition', () => {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        mockSetWeather.mockClear();
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, {
          type: 'weather_set',
          weather: 'storm',
          transition: 30,
        });
        expect(mockSetWeather).toHaveBeenCalledWith('storm', 30);
      });

      it('uses config.transition_duration when transition not provided', () => {
        const cfg = makeConfig({ transition_duration: 15 });
        const node = makeNode();
        weatherHubHandler.onAttach!(node, cfg, noopContext);
        mockSetWeather.mockClear();
        weatherHubHandler.onEvent!(node, cfg, noopContext, {
          type: 'weather_set',
          weather: 'snow',
        });
        expect(mockSetWeather).toHaveBeenCalledWith('snow', 15);
      });
    });

    describe('weather_set_immediate', () => {
      it('calls system.setImmediate with weather type', () => {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, {
          type: 'weather_set_immediate',
          weather: 'fog',
        });
        expect(mockSetImmediate).toHaveBeenCalledWith('fog');
      });
    });

    describe('weather_set_wind', () => {
      it('normalizes direction and calls setWind with speed-scaled components', () => {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        mockSetWind.mockClear();
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, {
          type: 'weather_set_wind',
          speed: 10,
          direction: [0, 0, 1] as [number, number, number], // already unit
        });
        expect(mockSetWind).toHaveBeenCalledWith(
          expect.closeTo(0, 5),
          expect.closeTo(0, 5),
          expect.closeTo(10, 5),
          10
        );
      });

      it('normalizes a non-unit direction vector', () => {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        mockSetWind.mockClear();
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, {
          type: 'weather_set_wind',
          speed: 6,
          direction: [3, 4, 0] as [number, number, number], // len=5
        });
        expect(mockSetWind).toHaveBeenCalledWith(
          expect.closeTo(3 / 5 * 6, 4),
          expect.closeTo(4 / 5 * 6, 4),
          expect.closeTo(0, 5),
          6
        );
      });

      it('handles zero-length direction without crash', () => {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        expect(() =>
          weatherHubHandler.onEvent!(node, defaultConfig, noopContext, {
            type: 'weather_set_wind',
            speed: 5,
            direction: [0, 0, 0] as [number, number, number],
          })
        ).not.toThrow();
      });
    });

    describe('weather_set_time', () => {
      it('sets state.timeOfDay to the given time', () => {
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, {
          type: 'weather_set_time',
          time: 18.5,
        });
        const state = node.__weatherHubState as { timeOfDay: number };
        expect(state.timeOfDay).toBe(18.5);
      });
    });

    it('ignores unknown event types gracefully', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      expect(() =>
        weatherHubHandler.onEvent!(node, defaultConfig, noopContext, { type: 'unknown_event' })
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Blackboard writes — writeBlackboard internal logic
  // -------------------------------------------------------------------------
  describe('blackboard writes', () => {
    it('scales wind_vector by wind_physics_scale', () => {
      mockGetState.mockReturnValue({
        type: 'clear',
        intensity: 0,
        wind: Object.assign({ x: 2, y: 0, z: 1, speed: 2 }, { 0: 2, 1: 0, 2: 1 }),
        temperature: 20,
        humidity: 0.3,
        visibility: 1,
        precipitation: 0,
      } as WeatherState);
      const cfg = makeConfig({ wind_physics_scale: 3 });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      const wv = call.wind_vector as [number, number, number];
      expect(wv[0]).toBeCloseTo(6, 4);
      expect(wv[1]).toBeCloseTo(0, 4);
      expect(wv[2]).toBeCloseTo(3, 4);
    });

    it('passes temperature and humidity from weather state', () => {
      mockGetState.mockReturnValue({
        type: 'clear',
        intensity: 0,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 35,
        humidity: 0.85,
        visibility: 1,
        precipitation: 0,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.temperature).toBe(35);
      expect(call.humidity).toBe(0.85);
    });

    it('passes precipitation from weather state', () => {
      mockGetState.mockReturnValue({
        type: 'rain',
        intensity: 0.6,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 15,
        humidity: 0.8,
        visibility: 0.6,
        precipitation: 0.7,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.precipitation).toBe(0.7);
    });

    // Precipitation type mapping
    it.each([
      ['rain', 'rain'],
      ['storm', 'rain'],
      ['snow', 'snow'],
      ['clear', 'none'],
      ['cloudy', 'none'],
      ['fog', 'none'],
    ] as Array<[WeatherType, string]>)(
      'maps weather type %s to precipitation_type %s',
      (wType, expectedPrecip) => {
        mockGetState.mockReturnValue({
          type: wType,
          intensity: 0.5,
          wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
          temperature: 10,
          humidity: 0.5,
          visibility: 1,
          precipitation: 0.5,
        } as WeatherState);
        const node = makeNode();
        weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
        const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
        expect(call.precipitation_type).toBe(expectedPrecip);
      }
    );

    // Cloud density
    it('sets cloud_density to intensity for cloudy weather', () => {
      mockGetState.mockReturnValue({
        type: 'cloudy',
        intensity: 0.4,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 15,
        humidity: 0.5,
        visibility: 0.9,
        precipitation: 0,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.cloud_density).toBe(0.4);
    });

    it('sets cloud_density to 0.8 for fog', () => {
      mockGetState.mockReturnValue({
        type: 'fog',
        intensity: 0.4,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 10,
        humidity: 0.9,
        visibility: 0.2,
        precipitation: 0,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.cloud_density).toBe(0.8);
    });

    it('sets cloud_density to 0.1 for clear', () => {
      mockGetState.mockReturnValue({
        type: 'clear',
        intensity: 0,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 25,
        humidity: 0.3,
        visibility: 1,
        precipitation: 0,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.cloud_density).toBe(0.1);
    });

    it('sets cloud_density to intensity for storm', () => {
      mockGetState.mockReturnValue({
        type: 'storm',
        intensity: 1,
        wind: Object.assign({ x: 5, y: 0, z: 0, speed: 5 }, { 0: 5, 1: 0, 2: 0 }),
        temperature: 10,
        humidity: 0.95,
        visibility: 0.3,
        precipitation: 1,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.cloud_density).toBe(1);
    });

    // Fog density
    it('sets fog_density to intensity for fog weather', () => {
      mockGetState.mockReturnValue({
        type: 'fog',
        intensity: 0.6,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 10,
        humidity: 0.9,
        visibility: 0.2,
        precipitation: 0,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.fog_density).toBe(0.6);
    });

    it('sets fog_density to 0.3 for storm', () => {
      mockGetState.mockReturnValue({
        type: 'storm',
        intensity: 1,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 5 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 10,
        humidity: 0.95,
        visibility: 0.3,
        precipitation: 1,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.fog_density).toBe(0.3);
    });

    it('sets fog_density to 0 for non-fog non-storm weather', () => {
      mockGetState.mockReturnValue({
        type: 'rain',
        intensity: 0.6,
        wind: Object.assign({ x: 0, y: 0, z: 0, speed: 0 }, { 0: 0, 1: 0, 2: 0 }),
        temperature: 15,
        humidity: 0.8,
        visibility: 0.6,
        precipitation: 0.7,
      } as WeatherState);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.fog_density).toBe(0);
    });

    it('uses computeSunPosition for sun_position', () => {
      mockComputeSunPosition.mockReturnValue([0.3, 0.8, 0.1] as [number, number, number]);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, makeConfig({ start_time: 14, latitude: 50 }), noopContext);
      expect(mockComputeSunPosition).toHaveBeenCalledWith(14, 50);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.sun_position).toEqual([0.3, 0.8, 0.1]);
    });

    it('uses computeSunIntensity with the y component of sun_position', () => {
      mockComputeSunPosition.mockReturnValue([0, 0.7, 0] as [number, number, number]);
      mockComputeSunIntensity.mockReturnValue(0.85);
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      expect(mockComputeSunIntensity).toHaveBeenCalledWith(0.7);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.sun_intensity).toBe(0.85);
    });

    it('always passes cloud_altitude as 2000', () => {
      const node = makeNode();
      weatherHubHandler.onAttach!(node, defaultConfig, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.cloud_altitude).toBe(2000);
    });

    it('passes time_of_day reflecting current state.timeOfDay', () => {
      const cfg = makeConfig({ start_time: 20 });
      const node = makeNode();
      weatherHubHandler.onAttach!(node, cfg, noopContext);
      const call = mockUpdateWeatherBlackboard.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(call.time_of_day).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // name
  // -------------------------------------------------------------------------
  describe('name', () => {
    it('is "weather"', () => {
      expect(weatherHubHandler.name).toBe('weather');
    });
  });
});
