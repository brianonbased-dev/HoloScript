import { describe, expect, test } from 'vitest';
import { VRRCompiler } from '../VRRCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

describe('VRRCompiler', () => {
  const parser = new HoloCompositionParser();

  test('should generate Three.js setup for a basic VRR composition', () => {
    const input = `
      composition "PhoenixTwin" {
        zone#downtown @vrr_twin @geo_sync("phoenix_az_center") {
          geo_coords: { lat: 33.4484, lng: -112.0740 }
          weather_sync: { provider: "weather.gov", refresh: 10 }
        }
      }
    `;

    const ast = parser.parse(input);
    const compiler = new VRRCompiler({ target: 'threejs', api_integrations: { weather: { provider: 'weather.gov' } }, minify: false, source_maps: false, performance: { target_fps: 60, max_players: 1000, lazy_loading: true } });
    const result = compiler.compile(ast);

    expect(result.target).toBe('threejs');
    expect(result.code).toContain('const scene = new THREE.Scene();');
    expect(result.code).toContain('const vrr = new VRRRuntime({');
    expect(result.code).toContain('"provider": "weather.gov"');
    expect(result.code).toContain('phoenix_downtown');
  });

  test('should include API integration generation for event syncs', () => {
    const input = `
      composition "EventZoneTwin" {
        zone#plaza @vrr_twin {
          geo_coords: { lat: 0, lng: 0 }
          event_sync: { provider: "eventbrite", refresh: 5 }
        }
      }
    `;

    const ast = parser.parse(input);
    const compiler = new VRRCompiler({ target: 'threejs', api_integrations: { events: { provider: 'eventbrite', api_key: 'test' } }, minify: false, source_maps: false, performance: { target_fps: 60, max_players: 1000, lazy_loading: true } });
    const result = compiler.compile(ast);

    expect(result.code).toContain('eventbrite');
  });
});
