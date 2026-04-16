import { describe, expect, test, vi } from 'vitest';
import { VRRCompiler } from '../VRRCompiler';
import type { HoloComposition, HoloWorld } from '../../parser/HoloCompositionTypes';

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

function makeWorldConfig(name: string, properties: Record<string, any>): HoloWorld {
  return {
    type: 'World',
    name,
    properties: Object.entries(properties).map(([key, value]) => ({
      type: 'WorldProperty',
      key,
      value,
    })),
  } as unknown as HoloWorld;
}

describe('VRRCompiler - World Node Support', () => {
  test('should extract world properties and apply them to Three.js scene', () => {
    const world = makeWorldConfig('PhoenixSimulation', {
      ambient_light: 0.8,
      skybox_color: 0x112233,
      gravity: -1.62, // lunar gravity
    });

    const composition: HoloComposition = {
      type: 'Composition',
      name: 'TestComp',
      worlds: [world],
      children: [],
    } as unknown as HoloComposition;

    const compiler = makeCompiler();
    const result = compiler.compile(composition, 'test-token');

    expect(result.success).toBe(true);
    // Ambient light intensity
    expect(result.code).toContain('new THREE.AmbientLight(0x404040, 0.8)');
    // Skybox color
    expect(result.code).toContain('new THREE.Color(1122867)'); // 0x112233 in decimal
    // Gravity in userData
    expect(result.code).toContain('scene.userData.gravity = -1.62');
  });

  test('should use default values when world properties are missing', () => {
    const world = makeWorldConfig('DefaultSimulation', {});

    const composition: HoloComposition = {
      type: 'Composition',
      name: 'DefaultComp',
      worlds: [world],
      children: [],
    } as unknown as HoloComposition;

    const compiler = makeCompiler();
    const result = compiler.compile(composition, 'test-token');

    expect(result.success).toBe(true);
    expect(result.code).toContain('new THREE.AmbientLight(0x404040, 0.6)'); // default
    expect(result.code).toContain('new THREE.Color(8900331)'); // 0x87ceeb in decimal
    expect(result.code).toContain('scene.userData.gravity = 9.81'); // default
  });

  test('should correctly parse World nodes into VRRCompositionData', () => {
    const world = makeWorldConfig('DataTest', { gravity: 10 });
    const composition: HoloComposition = {
      type: 'Composition',
      name: 'DataComp',
      worlds: [world],
      children: [
        {
          type: 'Object',
          name: 'box',
          traits: [{ name: 'vrr_twin', params: { mirror: true } }],
        }
      ],
    } as unknown as HoloComposition;

    const compiler = makeCompiler();
    const data = compiler.parseVRRComposition(composition);

    expect(data.worldNodes).toHaveLength(1);
    expect(data.worldNodes[0].name).toBe('DataTest');
    expect(data.twinNodes).toHaveLength(1);
  });
});
