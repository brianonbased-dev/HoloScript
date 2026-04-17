import { describe, expect, test, vi } from 'vitest';
import { VRRCompiler } from '../VRRCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

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

/** Build a minimal AST with trait-annotated nodes for testing. */
function makeComposition(
  nodes: Array<{
    name: string;
    traits: Array<{ name: string; params: Record<string, unknown> }>;
    children?: Array<{
      name: string;
      traits: Array<{ name: string; params: Record<string, unknown> }>;
    }>;
  }>
): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestComposition',
    children: nodes.map((n) => ({
      type: 'Object',
      name: n.name,
      traits: n.traits,
      children: n.children || [],
    })),
  } as unknown as HoloComposition;
}

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

    const parseResult = parser.parse(input);
    expect(parseResult.ast).toBeDefined();
    expect(parseResult.ast!.type).toBe('Composition');
    const compiler = makeCompiler({
      api_integrations: { weather: { provider: 'weather.gov' } },
    });
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.target).toBe('threejs');
    expect(result.errors).toEqual([]);
    expect(result.code).toContain('const scene = new THREE.Scene();');
    expect(result.code).toContain('const vrr = new VRRRuntime({');
    expect(result.code).toContain('"provider": "weather.gov"');
    expect(result.code).toContain('globalWorldContext');
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

    const parseResult = parser.parse(input);
    expect(parseResult.ast).toBeDefined();
    expect(parseResult.ast!.type).toBe('Composition');
    const compiler = makeCompiler({
      api_integrations: { events: { provider: 'eventbrite', api_key: 'test' } },
    });
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.code).toContain('eventbrite');
  });

  // ─── parseVRRComposition ────────────────────────────────────────────

  test('parseVRRComposition extracts all VRR trait categories', () => {
    const comp = makeComposition([
      {
        name: 'downtown',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'phoenix' } },
          { name: 'geo_anchor', params: { lat: 33.4484, lng: -112.074 } },
          { name: 'weather_sync', params: { provider: 'weather.gov' } },
          { name: 'event_sync', params: { provider: 'eventbrite' } },
        ],
      },
      {
        name: 'shop',
        traits: [
          { name: 'inventory_sync', params: { provider: 'square_pos' } },
          { name: 'quest_hub', params: { quests: ['latte_legend'] } },
          { name: 'x402_paywall', params: { price: 5, asset: 'USDC', network: 'base' } },
        ],
      },
      {
        name: 'portal',
        traits: [{ name: 'layer_shift', params: { from: 'ar', to: 'vrr' } }],
      },
    ]);

    const compiler = makeCompiler();
    const data = compiler.parseVRRComposition(comp);

    expect(data.twinNodes).toHaveLength(1);
    expect(data.geoAnchorNodes).toHaveLength(1);
    expect(data.weatherNodes).toHaveLength(1);
    expect(data.eventNodes).toHaveLength(1);
    expect(data.inventoryNodes).toHaveLength(1);
    expect(data.questNodes).toHaveLength(1);
    expect(data.paywallNodes).toHaveLength(1);
    expect(data.layerShiftNodes).toHaveLength(1);
  });

  test('parseVRRComposition warns on invalid trait params', () => {
    const comp = makeComposition([
      {
        name: 'bad_anchor',
        traits: [{ name: 'geo_anchor', params: { lat: 999, lng: 0 } }],
      },
    ]);

    const compiler = makeCompiler();
    // Access warnings via compile result since parseVRRComposition populates this.warnings
    const result = compiler.compile(comp, 'test-token');
    expect(result.warnings).toContain('@geo_anchor on "bad_anchor" has invalid params');
  });

  // ─── compileToThreeJS ───────────────────────────────────────────────

  test('compileToThreeJS generates lighting, ground, camera, and render loop', () => {
    const comp = makeComposition([
      {
        name: 'zone',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'test' } },
          { name: 'geo_anchor', params: { lat: 33.44, lng: -112.07 } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('AmbientLight');
    expect(result.code).toContain('DirectionalLight');
    expect(result.code).toContain('PlaneGeometry');
    expect(result.code).toContain('camera.position.set');
    expect(result.code).toContain('requestAnimationFrame(animate)');
    expect(result.code).toContain('vrr.geoToSceneCoords(33.44, -112.07)');
  });

  // ─── generateWeatherSync ────────────────────────────────────────────

  test('generateWeatherSync creates rain particles and weather callbacks', () => {
    const comp = makeComposition([
      {
        name: 'downtown',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'phx' } },
          { name: 'weather_sync', params: { provider: 'weather.gov', refresh: '5_minutes' } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('createWeatherSync');
    expect(result.code).toContain('rainSystem');
    expect(result.code).toContain('weather.precipitation');
    expect(result.code).toContain('weather.cloud_cover');
    expect(result.code).toContain('weather.temperature_f');
  });

  // ─── generateEventSync ──────────────────────────────────────────────

  test('generateEventSync creates event markers and NPC crowds', () => {
    const comp = makeComposition([
      {
        name: 'plaza',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'plaza' } },
          { name: 'event_sync', params: { provider: 'ticketmaster' } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('createEventSync');
    expect(result.code).toContain('ticketmaster');
    expect(result.code).toContain('eventMarkers_');
    expect(result.code).toContain('spawnNPCCrowd');
    expect(result.code).toContain('evt.expected_attendance');
  });

  // ─── generateInventorySync ──────────────────────────────────────────

  test('generateInventorySync creates inventory badges with stock colors', () => {
    const comp = makeComposition([
      {
        name: 'brew_shop',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'brew' } },
          { name: 'inventory_sync', params: { provider: 'shopify', websocket: true } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('createInventorySync');
    expect(result.code).toContain('shopify');
    expect(result.code).toContain('websocket: true');
    expect(result.code).toContain('item.quantity > 10');
    expect(result.code).toContain('0x00ff00'); // green = in stock
    expect(result.code).toContain('0xff0000'); // red = out of stock
  });

  // ─── generateQuestLogic ─────────────────────────────────────────────

  test('generateQuestLogic creates quest hubs with state machine', () => {
    const comp = makeComposition([
      {
        name: 'cafe',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'cafe' } },
          { name: 'quest_hub', params: { quests: ['latte_legend', 'espresso_dash'] } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('createQuestHub');
    expect(result.code).toContain('latte_legend');
    expect(result.code).toContain('espresso_dash');
    expect(result.code).toContain('onQuestStart');
    expect(result.code).toContain('onStepComplete');
    expect(result.code).toContain('onQuestComplete');
    expect(result.code).toContain('grantReward');
    expect(result.code).toContain('quest_progress_');
  });

  // ─── generateLayerShift ─────────────────────────────────────────────

  test('generateLayerShift generates transition handlers with state persistence', () => {
    const comp = makeComposition([
      {
        name: 'ar_portal',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'portal' } },
          { name: 'layer_shift', params: { from: 'ar', to: 'vrr', price: 5, persist_state: true } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('registerLayerShift');
    expect(result.code).toContain("from: 'ar'");
    expect(result.code).toContain("to: 'vrr'");
    expect(result.code).toContain('price: 5');
    expect(result.code).toContain('persist_state: true');
    expect(result.code).toContain('getIndexedDB');
    expect(result.code).toContain('syncToServer');
    expect(result.code).toContain('requirePayment');
    expect(result.code).toContain('transitionToLayer');
    expect(result.code).toContain('restoreQuestProgress');
  });

  test('generateLayerShift skips payment when price is 0', () => {
    const comp = makeComposition([
      {
        name: 'free_portal',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'free' } },
          { name: 'layer_shift', params: { from: 'vrr', to: 'vr', price: 0 } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('registerLayerShift');
    expect(result.code).not.toContain('requirePayment');
  });

  // ─── generateX402Paywall ────────────────────────────────────────────

  test('generateX402Paywall generates 402 response and payment verification', () => {
    const comp = makeComposition([
      {
        name: 'premium_zone',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'premium' } },
          { name: 'x402_paywall', params: { price: 10, asset: 'USDC', network: 'base' } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.code).toContain('createPaywall');
    expect(result.code).toContain('price: 10');
    expect(result.code).toContain("asset: 'USDC'");
    expect(result.code).toContain("network: 'base'");
    expect(result.code).toContain('status: 402');
    expect(result.code).toContain('X-Payment-Required');
    expect(result.code).toContain('onPaymentVerified');
    expect(result.code).toContain('onPaymentFailed');
    expect(result.code).toContain('unlockContent');
    expect(result.code).toContain('showPaywallUI');
  });

  // ─── Full pipeline ──────────────────────────────────────────────────

  test('compile produces valid output with all trait types combined', () => {
    const comp = makeComposition([
      {
        name: 'phoenix_downtown',
        traits: [
          { name: 'vrr_twin', params: { mirror: 'phoenix_downtown' } },
          { name: 'geo_anchor', params: { lat: 33.4484, lng: -112.074 } },
          { name: 'weather_sync', params: { provider: 'weather.gov' } },
          { name: 'event_sync', params: { provider: 'eventbrite' } },
          { name: 'inventory_sync', params: { provider: 'square_pos' } },
          { name: 'quest_hub', params: { quests: ['latte_legend'] } },
          { name: 'layer_shift', params: { from: 'ar', to: 'vrr' } },
          { name: 'x402_paywall', params: { price: 5, asset: 'USDC', network: 'base' } },
        ],
      },
    ]);

    const result = makeCompiler().compile(comp, 'test-token');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    // All major sections present
    expect(result.code).toContain('THREE.Scene');
    expect(result.code).toContain('VRRRuntime');
    expect(result.code).toContain('AmbientLight');
    expect(result.code).toContain('createWeatherSync');
    expect(result.code).toContain('createEventSync');
    expect(result.code).toContain('createInventorySync');
    expect(result.code).toContain('createQuestHub');
    expect(result.code).toContain('registerLayerShift');
    expect(result.code).toContain('createPaywall');
    expect(result.code).toContain('scene.add(phoenix_downtown)');
  });

  test('compile returns error for invalid composition', () => {
    const result = makeCompiler().compile(null as unknown as HoloComposition, 'test-token');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Invalid composition tree');
  });

  test('uses top-level composition.worlds state for VRR runtime simulation_state', () => {
    const comp = {
      type: 'Composition',
      name: 'WorldStateComp',
      children: [
        {
          type: 'Object',
          name: 'downtownTwin',
          traits: [{ name: 'vrr_twin', params: { mirror: 'downtown' } }],
        },
      ],
      worlds: [{ type: 'world', name: 'globalWorld', state: { weather: 'storm', hour: 21 } }],
    } as unknown as HoloComposition;

    const result = makeCompiler().compile(comp, 'test-token');
    expect(result.success).toBe(true);
    expect(result.code).toContain('simulation_state: {"weather":"storm","hour":21}');
  });

  test('falls back to top-level world child state when composition.worlds is absent', () => {
    const comp = {
      type: 'Composition',
      name: 'WorldChildComp',
      children: [
        {
          type: 'world',
          name: 'childWorld',
          state: { activeQuest: 'LatteLegend', weather: 'clear' },
          traits: [{ name: 'vrr_twin', params: { mirror: 'child_world' } }],
        },
      ],
    } as unknown as HoloComposition;

    const result = makeCompiler().compile(comp, 'test-token');
    expect(result.success).toBe(true);
    expect(result.code).toContain(
      'simulation_state: {"activeQuest":"LatteLegend","weather":"clear"}'
    );
  });
});
