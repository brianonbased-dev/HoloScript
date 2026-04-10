/**
 * @fileoverview VRR (Virtual Reality Reality) Performance Benchmark Specification
 * @module @holoscript/core/compiler/__tests__
 *
 * Benchmarks the VRRCompiler across 8 dimensions:
 * - Twin Sync: concurrent twin compilation throughput
 * - Multiplayer: player-heavy composition scalability
 * - API Sync: weather/event/inventory trait compilation speed
 * - State Persistence: layer_shift + quest compilation overhead
 * - Geo: geo_anchor coordinate processing throughput
 * - Memory: heap stability across repeated compilations
 * - Rendering: generated code size and structure under load
 * - Network: resilience trait compilation with offline fallbacks
 */

import { describe, it, expect, vi } from 'vitest';
import { VRRCompiler } from '../VRRCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // @ts-expect-error During migration
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────

function makeCompiler(overrides: Partial<ConstructorParameters<typeof VRRCompiler>[0]> = {}) {
  return new VRRCompiler({
    target: 'threejs',
    minify: false,
    source_maps: false,
    api_integrations: {},
    performance: { target_fps: 60, max_players: 1000, lazy_loading: true },
    ...overrides,
  });
}

interface TraitSpec {
  name: string;
  params: Record<string, unknown>;
}

interface NodeSpec {
  name: string;
  traits: TraitSpec[];
  children?: NodeSpec[];
}

function makeComposition(nodes: NodeSpec[]): HoloComposition {
  return {
    type: 'Composition',
    name: 'BenchComposition',
    children: nodes.map((n) => ({
      type: 'Object',
      name: n.name,
      traits: n.traits,
      children: n.children || [],
    })),
  } as unknown as HoloComposition;
}

function makeTwinNode(index: number): NodeSpec {
  return {
    name: `twin_${index}`,
    traits: [
      { name: 'vrr_twin', params: { mirror: `city_${index}` } },
      {
        name: 'geo_anchor',
        params: {
          lat: 33.4484 + (index % 90) * 0.001,
          lng: -112.074 + (index % 180) * 0.001,
        },
      },
    ],
  };
}

function makeFullTwinNode(index: number): NodeSpec {
  return {
    name: `full_twin_${index}`,
    traits: [
      { name: 'vrr_twin', params: { mirror: `city_full_${index}` } },
      {
        name: 'geo_anchor',
        params: {
          lat: 33.4484 + (index % 90) * 0.001,
          lng: -112.074 + (index % 180) * 0.001,
        },
      },
      { name: 'weather_sync', params: { provider: 'weather.gov' } },
      { name: 'event_sync', params: { provider: 'eventbrite' } },
      { name: 'inventory_sync', params: { provider: 'square_pos', websocket: true } },
      { name: 'quest_hub', params: { quests: ['quest_a', 'quest_b'] } },
      { name: 'layer_shift', params: { from: 'ar', to: 'vrr', price: 5, persist_state: true } },
      { name: 'x402_paywall', params: { price: 10, asset: 'USDC', network: 'base' } },
    ],
  };
}

function timeExecution(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ─── 1. Concurrent Twin Synchronization ─────────────────────────────────

describe('VRR Performance Benchmarks', () => {
  describe('Concurrent Twin Synchronization', () => {
    it('should compile 100 concurrent twins under 2 seconds', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => makeTwinNode(i));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
      });

      expect(elapsed).toBeLessThan(2000);
    });

    it('should maintain consistent compile times across repeated runs', () => {
      const nodes = Array.from({ length: 50 }, (_, i) => makeTwinNode(i));
      const composition = makeComposition(nodes);

      const times: number[] = [];
      for (let run = 0; run < 10; run++) {
        const compiler = makeCompiler();
        const elapsed = timeExecution(() => {
          compiler.compile(composition, 'test-token');
        });
        times.push(elapsed);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const jitter = maxTime - avg;

      // Jitter should be less than 3x the average (stable performance)
      expect(jitter).toBeLessThan(avg * 3);
      // Average should be reasonable
      expect(avg).toBeLessThan(1000);
    });
  });

  // ─── 2. Multiplayer Scalability ─────────────────────────────────────────

  describe('Multiplayer Scalability', () => {
    it('should compile a twin with 1000-player capacity config under 500ms', () => {
      const nodes: NodeSpec[] = [
        {
          name: 'multiplayer_zone',
          traits: [
            { name: 'vrr_twin', params: { mirror: 'phoenix_downtown' } },
            {
              name: 'geo_anchor',
              params: { lat: 33.4484, lng: -112.074 },
            },
          ],
        },
      ];
      const composition = makeComposition(nodes);
      const compiler = makeCompiler({
        performance: { target_fps: 60, max_players: 1000, lazy_loading: true },
      });

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        expect(result.code).toContain('max_players: 1000');
      });

      expect(elapsed).toBeLessThan(500);
    });

    it('should support spatial partitioning via multiple geo-anchored zones', () => {
      // 100 zones simulating spatial cells
      const zones: NodeSpec[] = Array.from({ length: 100 }, (_, i) => ({
        name: `cell_${Math.floor(i / 10)}_${i % 10}`,
        traits: [
          { name: 'vrr_twin', params: { mirror: `cell_${i}` } },
          {
            name: 'geo_anchor',
            params: {
              lat: 33.44 + Math.floor(i / 10) * 0.01,
              lng: -112.07 + (i % 10) * 0.01,
            },
          },
        ],
      }));
      const composition = makeComposition(zones);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        // All 100 zones should produce geo coordinate code
        expect(result.code).toContain('geoToSceneCoords');
      });

      expect(elapsed).toBeLessThan(2000);
    });
  });

  // ─── 3. Real-Time API Synchronization ───────────────────────────────────

  describe('Real-Time API Synchronization', () => {
    it('should compile weather sync traits under 200ms', () => {
      const nodes: NodeSpec[] = Array.from({ length: 20 }, (_, i) => ({
        name: `weather_zone_${i}`,
        traits: [
          { name: 'vrr_twin', params: { mirror: `wz_${i}` } },
          { name: 'weather_sync', params: { provider: 'weather.gov', refresh: '5_minutes' } },
        ],
      }));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler({
        api_integrations: { weather: { provider: 'weather.gov' } },
      });

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        expect(result.code).toContain('createWeatherSync');
        expect(result.code).toContain('rainSystem');
        expect(result.code).toContain('weather.precipitation');
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should compile inventory WebSocket sync with correct tick config', () => {
      const nodes: NodeSpec[] = Array.from({ length: 10 }, (_, i) => ({
        name: `shop_${i}`,
        traits: [
          { name: 'vrr_twin', params: { mirror: `shop_${i}` } },
          { name: 'inventory_sync', params: { provider: 'square_pos', websocket: true } },
        ],
      }));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        expect(result.code).toContain('createInventorySync');
        expect(result.code).toContain('websocket: true');
        // Stock color indicators
        expect(result.code).toContain('0x00ff00');
        expect(result.code).toContain('0xff0000');
      });

      expect(elapsed).toBeLessThan(200);
    });
  });

  // ─── 4. State Persistence Performance ───────────────────────────────────

  describe('State Persistence Performance', () => {
    it('should compile layer_shift with IndexedDB persistence under 200ms', () => {
      const nodes: NodeSpec[] = [
        {
          name: 'ar_portal',
          traits: [
            { name: 'vrr_twin', params: { mirror: 'portal' } },
            { name: 'layer_shift', params: { from: 'ar', to: 'vrr', price: 5, persist_state: true } },
          ],
        },
        {
          name: 'vr_portal',
          traits: [
            { name: 'vrr_twin', params: { mirror: 'vr_portal' } },
            { name: 'layer_shift', params: { from: 'vrr', to: 'vr', price: 0 } },
          ],
        },
      ];
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        expect(result.code).toContain('getIndexedDB');
        expect(result.code).toContain('syncToServer');
        expect(result.code).toContain('restoreQuestProgress');
        expect(result.code).toContain('transitionToLayer');
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should compile quest progress persistence across multiple hubs', () => {
      const nodes: NodeSpec[] = Array.from({ length: 15 }, (_, i) => ({
        name: `business_${i}`,
        traits: [
          { name: 'vrr_twin', params: { mirror: `biz_${i}` } },
          { name: 'quest_hub', params: { quests: [`quest_${i}_a`, `quest_${i}_b`, `quest_${i}_c`] } },
        ],
      }));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        expect(result.code).toContain('createQuestHub');
        expect(result.code).toContain('onQuestStart');
        expect(result.code).toContain('onStepComplete');
        expect(result.code).toContain('onQuestComplete');
        expect(result.code).toContain('grantReward');
        expect(result.code).toContain('quest_progress_');
      });

      expect(elapsed).toBeLessThan(500);
    });
  });

  // ─── 5. Geo-Location Performance ───────────────────────────────────────

  describe('Geo-Location Performance', () => {
    it('should compile 1000 geo_anchor conversions under 3 seconds', () => {
      const nodes: NodeSpec[] = Array.from({ length: 1000 }, (_, i) => ({
        name: `geo_point_${i}`,
        traits: [
          { name: 'vrr_twin', params: { mirror: `gp_${i}` } },
          {
            name: 'geo_anchor',
            params: {
              lat: -90 + (i / 1000) * 180,
              lng: -180 + (i / 1000) * 360,
            },
          },
        ],
      }));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        // Verify geo conversion calls are present
        expect(result.code).toContain('geoToSceneCoords');
      });

      // Under 3ms per geo point on average
      expect(elapsed).toBeLessThan(3000);
    });

    it('should parseVRRComposition extract geo anchors in under 50ms for 500 nodes', () => {
      const nodes: NodeSpec[] = Array.from({ length: 500 }, (_, i) => ({
        name: `anchor_${i}`,
        traits: [
          {
            name: 'geo_anchor',
            params: {
              lat: 33.4484 + (i % 90) * 0.001,
              lng: -112.074 + (i % 180) * 0.001,
            },
          },
        ],
      }));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      let geoCount = 0;
      const elapsed = timeExecution(() => {
        const data = compiler.parseVRRComposition(composition);
        geoCount = data.geoAnchorNodes.length;
      });

      expect(geoCount).toBe(500);
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ─── 6. Memory Usage ───────────────────────────────────────────────────

  describe('Memory Usage', () => {
    it('should not leak memory after 200 compilation cycles', () => {
      const nodes = Array.from({ length: 10 }, (_, i) => makeFullTwinNode(i));
      const composition = makeComposition(nodes);

      // Warm up
      const warmCompiler = makeCompiler();
      warmCompiler.compile(composition, 'test-token');

      const initialMemory = process.memoryUsage().heapUsed;

      for (let cycle = 0; cycle < 200; cycle++) {
        const compiler = makeCompiler();
        compiler.compile(composition, 'test-token');
      }

      // Allow GC if available
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const growthRatio = (finalMemory - initialMemory) / initialMemory;

      // Less than 50% heap growth after 200 compilations (generous for GC timing)
      expect(growthRatio).toBeLessThan(0.5);
    });

    it('should handle 100 full-featured twins within reasonable memory', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => makeFullTwinNode(i));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const beforeMemory = process.memoryUsage().heapUsed;
      const result = compiler.compile(composition, 'test-token');
      const afterMemory = process.memoryUsage().heapUsed;

      expect(result.success).toBe(true);

      const usedMB = (afterMemory - beforeMemory) / (1024 * 1024);
      // Single compilation with 100 full twins should use less than 256MB
      expect(usedMB).toBeLessThan(256);
    });
  });

  // ─── 7. Rendering Performance ──────────────────────────────────────────

  describe('Rendering Performance', () => {
    it('should generate render loop and lighting for mobile-class output', () => {
      const nodes: NodeSpec[] = [
        {
          name: 'mobile_scene',
          traits: [
            { name: 'vrr_twin', params: { mirror: 'mobile_twin' } },
            { name: 'geo_anchor', params: { lat: 33.4484, lng: -112.074 } },
            { name: 'weather_sync', params: { provider: 'weather.gov' } },
          ],
        },
      ];
      const composition = makeComposition(nodes);
      const compiler = makeCompiler({
        performance: { target_fps: 60, max_players: 100, lazy_loading: true },
      });

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        // Verify complete render pipeline
        expect(result.code).toContain('requestAnimationFrame(animate)');
        expect(result.code).toContain('AmbientLight');
        expect(result.code).toContain('DirectionalLight');
        expect(result.code).toContain('renderer.render(scene, camera)');
        expect(result.code).toContain('shadowMap');
        expect(result.code).toContain('PlaneGeometry');
      });

      expect(elapsed).toBeLessThan(100);
    });

    it('should produce compact code for desktop 90+ FPS target', () => {
      const nodes = Array.from({ length: 50 }, (_, i) => makeFullTwinNode(i));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler({
        performance: { target_fps: 90, max_players: 1000, lazy_loading: true },
      });

      const result = compiler.compile(composition, 'test-token');
      expect(result.success).toBe(true);

      // Generated code should be substantial but bounded
      const codeLines = result.code.split('\n').length;
      expect(codeLines).toBeGreaterThan(100);
      // Even with 50 full twins, code should stay under 50K lines
      expect(codeLines).toBeLessThan(50000);

      // Verify structure completeness
      expect(result.code).toContain('THREE.Scene');
      expect(result.code).toContain('VRRRuntime');
      expect(result.code).toContain('createWeatherSync');
      expect(result.code).toContain('createEventSync');
      expect(result.code).toContain('createInventorySync');
      expect(result.code).toContain('createQuestHub');
      expect(result.code).toContain('registerLayerShift');
      expect(result.code).toContain('createPaywall');
    });
  });

  // ─── 8. Network Resilience ─────────────────────────────────────────────

  describe('Network Resilience', () => {
    it('should compile offline-capable state persistence handlers', () => {
      const nodes: NodeSpec[] = [
        {
          name: 'offline_zone',
          traits: [
            { name: 'vrr_twin', params: { mirror: 'offline_twin' } },
            { name: 'layer_shift', params: { from: 'ar', to: 'vrr', persist_state: true } },
            { name: 'quest_hub', params: { quests: ['offline_quest'] } },
          ],
        },
      ];
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        // Client-side persistence (IndexedDB for offline)
        expect(result.code).toContain('getIndexedDB');
        // Server-side sync (when online)
        expect(result.code).toContain('syncToServer');
        // State restoration after reconnect
        expect(result.code).toContain('restoreQuestProgress');
        // State persistence for quest progress
        expect(result.code).toContain('persistState');
        // Layer state management
        expect(result.code).toContain("client: 'indexeddb'");
      });

      expect(elapsed).toBeLessThan(200);
    });

    it('should compile queued update patterns for offline sync', () => {
      // Multiple layer shifts with state persistence create the queue pattern
      const nodes: NodeSpec[] = Array.from({ length: 5 }, (_, i) => ({
        name: `portal_${i}`,
        traits: [
          { name: 'vrr_twin', params: { mirror: `portal_mirror_${i}` } },
          {
            name: 'layer_shift',
            params: {
              from: i % 2 === 0 ? 'ar' : 'vrr',
              to: i % 2 === 0 ? 'vrr' : 'vr',
              persist_state: true,
            },
          },
          { name: 'x402_paywall', params: { price: i + 1, asset: 'USDC', network: 'base' } },
        ],
      }));
      const composition = makeComposition(nodes);
      const compiler = makeCompiler();

      const elapsed = timeExecution(() => {
        const result = compiler.compile(composition, 'test-token');
        expect(result.success).toBe(true);
        // Multiple layer shifts compiled
        expect(result.code).toContain('registerLayerShift');
        // Payment gates compiled
        expect(result.code).toContain('createPaywall');
        expect(result.code).toContain('X-Payment-Required');
        // Offline persistence compiled
        expect(result.code).toContain('getIndexedDB');
        expect(result.code).toContain('syncToServer');
        // All 5 portals present
        expect(result.code).toContain('portal_0');
        expect(result.code).toContain('portal_4');
      });

      expect(elapsed).toBeLessThan(500);
    });
  });
});
