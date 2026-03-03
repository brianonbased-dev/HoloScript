import { describe, it, expect, beforeEach, vi} from 'vitest';
import { DTDLCompiler, DTDL_TRAIT_COMPONENTS } from '../DTDLCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


// Helper to build a minimal composition
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    ...overrides,
  } as HoloComposition;
}

describe('DTDLCompiler', () => {
  let compiler: DTDLCompiler;

  beforeEach(() => {
    compiler = new DTDLCompiler();
  });

  // =========== Constructor / options ===========

  it('uses default options', () => {
    const result = JSON.parse(compiler.compile(makeComposition(), 'test-token'));
    expect(result[0]['@context']).toBe('dtmi:dtdl:context;3');
    expect(result[0]['@id']).toContain('dtmi:holoscript:');
  });

  it('respects dtdlVersion 2', () => {
    const c = new DTDLCompiler({ dtdlVersion: 2 });
    const result = JSON.parse(c.compile(makeComposition(), 'test-token'));
    expect(result[0]['@context']).toBe('dtmi:dtdl:context;2');
  });

  it('respects custom namespace and version', () => {
    const c = new DTDLCompiler({ namespace: 'dtmi:myapp', modelVersion: 5 });
    const result = JSON.parse(c.compile(makeComposition(), 'test-token'));
    expect(result[0]['@id']).toContain('dtmi:myapp:');
    expect(result[0]['@id']).toContain(';5');
  });

  // =========== compile: minimal composition ===========

  it('compiles minimal composition to valid JSON', () => {
    const json = compiler.compile(makeComposition(), 'test-token');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[0]['@type']).toBe('Interface');
  });

  it('composition interface has displayName', () => {
    const result = JSON.parse(compiler.compile(makeComposition({ name: 'MyRoom' }), 'test-token'));
    expect(result[0].displayName).toBe('MyRoom');
  });

  it('includes description when option enabled', () => {
    const result = JSON.parse(compiler.compile(makeComposition(), 'test-token'));
    expect(result[0].description).toContain('Generated from HoloScript');
  });

  it('omits description when disabled', () => {
    const c = new DTDLCompiler({ includeDescriptions: false });
    const result = JSON.parse(c.compile(makeComposition(), 'test-token'));
    expect(result[0].description).toBeUndefined();
  });

  // =========== State → Properties ===========

  it('compiles state properties', () => {
    const comp = makeComposition({
      state: {
        properties: [
          { key: 'count', value: 0 },
          { key: 'active', value: true },
          { key: 'label', value: 'hello' },
        ],
      },
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const main = result[result.length - 1]; // last is main interface for minimal
    // Find amongst all interfaces
    const allContents = result.flatMap((i: any) => i.contents || []);
    const props = allContents.filter((c: any) => c['@type'] === 'Property' || (Array.isArray(c['@type']) && c['@type'].includes('Property')));
    expect(props.length).toBeGreaterThanOrEqual(3);
  });

  // =========== Schema inference ===========

  it('infers integer schema', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'n', value: 42 }] },
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const props = result.flatMap((i: any) => i.contents || []).filter((c: any) => c.name === 'n');
    expect(props[0].schema).toBe('integer');
  });

  it('infers double schema', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'ratio', value: 3.14 }] },
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const props = result.flatMap((i: any) => i.contents || []).filter((c: any) => c.name === 'ratio');
    expect(props[0].schema).toBe('double');
  });

  it('infers boolean schema', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'flag', value: false }] },
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const props = result.flatMap((i: any) => i.contents || []).filter((c: any) => c.name === 'flag');
    expect(props[0].schema).toBe('boolean');
  });

  it('infers array schema', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'items', value: [1, 2, 3] }] },
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const props = result.flatMap((i: any) => i.contents || []).filter((c: any) => c.name === 'items');
    expect(props[0].schema['@type']).toBe('Array');
  });

  it('infers object schema', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'pos', value: { x: 1, y: 2 } }] },
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const props = result.flatMap((i: any) => i.contents || []).filter((c: any) => c.name === 'pos');
    expect(props[0].schema['@type']).toBe('Object');
    expect(props[0].schema.fields).toHaveLength(2);
  });

  // =========== Logic → Commands ===========

  it('compiles on_* handlers to Commands', () => {
    const comp = makeComposition({
      logic: {
        handlers: [
          { event: 'on_click', actions: [] },
          { event: 'on_hover', actions: [] },
          { event: 'update', actions: [] }, // not on_*
        ],
      } as any,
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const commands = result.flatMap((i: any) => i.contents || []).filter((c: any) => c['@type'] === 'Command');
    expect(commands).toHaveLength(2);
    expect(commands[0].name).toBe('click');
    expect(commands[1].name).toBe('hover');
  });

  // =========== Objects → Relationships ===========

  it('creates relationships for objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'my_cube', properties: [{ key: 'color', value: 'red' }], traits: [] },
      ] as any,
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const rels = result.flatMap((i: any) => i.contents || []).filter((c: any) => c['@type'] === 'Relationship');
    expect(rels.length).toBeGreaterThanOrEqual(1);
    expect(rels[0].name).toBe('hasMyCube');
  });

  // =========== Object with sensor trait gets telemetry + interface ===========

  it('sensor trait adds telemetry and generates separate interface', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'tempSensor',
          properties: [{ key: 'state', value: { temp: 0 } }],
          traits: ['sensor'],
        },
      ] as any,
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    // Should have more than just main interface (sensor object gets its own)
    expect(result.length).toBeGreaterThan(1);
    // Find the sensor interface
    const sensorIface = result.find((i: any) => i.displayName === 'tempSensor');
    expect(sensorIface).toBeDefined();
    const telemetry = sensorIface.contents.filter((c: any) => c['@type'] === 'Telemetry');
    expect(telemetry.length).toBeGreaterThanOrEqual(1);
  });

  // =========== Templates ===========

  it('compiles templates to interfaces', () => {
    const comp = makeComposition({
      templates: [
        { name: 'BaseObject', state: { properties: [{ key: 'hp', value: 100 }] }, traits: ['physics'] },
      ],
    } as any);
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const tmpl = result.find((i: any) => i.displayName === 'BaseObject');
    expect(tmpl).toBeDefined();
    expect(tmpl['@type']).toBe('Interface');
  });

  it('template with traits adds components', () => {
    const comp = makeComposition({
      templates: [
        { name: 'PhysObj', traits: ['physics', 'grabbable'] },
      ],
    } as any);
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const tmpl = result.find((i: any) => i.displayName === 'PhysObj');
    const components = tmpl.contents.filter((c: any) => c['@type'] === 'Component');
    expect(components).toHaveLength(2);
  });

  // =========== Environment properties ===========

  it('compiles environment skybox/ambient', () => {
    const comp = makeComposition({
      environment: { skybox: 'sunset', ambient_light: 0.7 } as any,
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const props = result.flatMap((i: any) => i.contents || []).filter((c: any) => c.name === 'skybox' || c.name === 'ambientLight');
    expect(props.length).toBeGreaterThanOrEqual(2);
  });

  // =========== Spatial groups → relationships ===========

  it('creates relationships for spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [{ name: 'group1', objects: [] }] as any,
    });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    const rels = result.flatMap((i: any) => i.contents || []).filter((c: any) => c['@type'] === 'Relationship');
    expect(rels.some((r: any) => r.name === 'group1')).toBe(true);
  });

  // =========== Name sanitization ===========

  it('sanitizes special characters in names', () => {
    const comp = makeComposition({ name: 'my scene!@#$%' });
    const result = JSON.parse(compiler.compile(comp, 'test-token'));
    expect(result[0]['@id']).toMatch(/^dtmi:holoscript:my_scene;/);
  });

  // =========== DTDL_TRAIT_COMPONENTS export ===========

  it('exports predefined trait component interfaces', () => {
    expect(DTDL_TRAIT_COMPONENTS).toHaveLength(4);
    expect(DTDL_TRAIT_COMPONENTS[0].displayName).toBe('Grabbable');
    expect(DTDL_TRAIT_COMPONENTS[1].displayName).toBe('Networked');
  });
});
