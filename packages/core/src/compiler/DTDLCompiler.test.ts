/**
 * DTDLCompiler Tests
 *
 * Tests for the HoloScript → DTDL (Azure Digital Twin Definition Language) compiler.
 * Verifies correct JSON generation for Azure Digital Twins.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DTDLCompiler,
  DTDL_TRAIT_COMPONENTS,
  type DTDLCompilerOptions,
  type DTDLInterface,
} from './DTDLCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloTemplate,
  HoloState,
  HoloLogic,
} from '../parser/HoloCompositionTypes';

describe('DTDLCompiler', () => {
  let compiler: DTDLCompiler;

  beforeEach(() => {
    compiler = new DTDLCompiler();
  });

  // Helper to create a minimal composition
  function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
    return {
      type: 'Composition',
      name: 'TestComposition',
      objects: [],
      templates: [],
      spatialGroups: [],
      lights: [],
      imports: [],
      timelines: [],
      audio: [],
      zones: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
      ...overrides,
    };
  }

  // Helper to create an object declaration
  function createObject(overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
    return {
      name: 'TestObject',
      properties: [],
      traits: [],
      ...overrides,
    } as HoloObjectDecl;
  }

  // Helper to create a template
  function createTemplate(overrides: Partial<HoloTemplate> = {}): HoloTemplate {
    return {
      name: 'TestTemplate',
      properties: [],
      traits: [],
      ...overrides,
    } as HoloTemplate;
  }

  // Helper to parse DTDL output
  function parseDTDL(output: string): DTDLInterface[] {
    return JSON.parse(output);
  }

  describe('Basic Compilation', () => {
    it('should generate valid DTDL JSON array', () => {
      const composition = createComposition();
      const output = compiler.compile(composition);

      expect(() => JSON.parse(output)).not.toThrow();
      const interfaces = parseDTDL(output);
      expect(Array.isArray(interfaces)).toBe(true);
    });

    it('should generate main composition interface', () => {
      const composition = createComposition({ name: 'MyDigitalTwin' });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces.find((i) => i.displayName === 'MyDigitalTwin');
      expect(mainInterface).toBeDefined();
      expect(mainInterface?.['@type']).toBe('Interface');
    });

    it('should use DTDL v3 context by default', () => {
      const composition = createComposition();
      const interfaces = parseDTDL(compiler.compile(composition));

      expect(interfaces[0]['@context']).toBe('dtmi:dtdl:context;3');
    });

    it('should generate model IDs with namespace', () => {
      const composition = createComposition({ name: 'TestTwin' });
      const interfaces = parseDTDL(compiler.compile(composition));

      expect(interfaces[0]['@id']).toContain('dtmi:holoscript');
      expect(interfaces[0]['@id']).toContain('TestTwin');
    });

    it('should include description when enabled', () => {
      const composition = createComposition({ name: 'DescribedTwin' });
      const interfaces = parseDTDL(compiler.compile(composition));

      expect(interfaces[0].description).toContain('Generated from HoloScript');
    });
  });

  describe('Custom Options', () => {
    it('should use custom namespace', () => {
      const customCompiler = new DTDLCompiler({ namespace: 'dtmi:mycompany:twins' });
      const composition = createComposition({ name: 'CustomTwin' });
      const interfaces = parseDTDL(customCompiler.compile(composition));

      expect(interfaces[0]['@id']).toContain('dtmi:mycompany:twins');
    });

    it('should use DTDL v2 context when specified', () => {
      const customCompiler = new DTDLCompiler({ dtdlVersion: 2 });
      const composition = createComposition();
      const interfaces = parseDTDL(customCompiler.compile(composition));

      expect(interfaces[0]['@context']).toBe('dtmi:dtdl:context;2');
    });

    it('should use custom model version', () => {
      const customCompiler = new DTDLCompiler({ modelVersion: 5 });
      const composition = createComposition({ name: 'VersionedTwin' });
      const interfaces = parseDTDL(customCompiler.compile(composition));

      expect(interfaces[0]['@id']).toContain(';5');
    });

    it('should exclude descriptions when disabled', () => {
      const customCompiler = new DTDLCompiler({ includeDescriptions: false });
      const composition = createComposition();
      const interfaces = parseDTDL(customCompiler.compile(composition));

      expect(interfaces[0].description).toBeUndefined();
    });

    it('should exclude trait components when disabled', () => {
      const customCompiler = new DTDLCompiler({ includeTraitComponents: false });
      const composition = createComposition({
        objects: [
          createObject({
            name: 'PhysicsObject',
            traits: ['physics', 'grabbable'],
            properties: [{ key: 'state', value: {} }], // Make it need interface
          }),
        ],
      });
      const interfaces = parseDTDL(customCompiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'PhysicsObject');
      const components = objInterface?.contents?.filter((c) => c['@type'] === 'Component');
      expect(components?.length || 0).toBe(0);
    });
  });

  describe('Template Processing', () => {
    it('should generate interface for each template', () => {
      const composition = createComposition({
        templates: [
          createTemplate({ name: 'BaseTemplate' }),
          createTemplate({ name: 'DerivedTemplate' }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const baseTemplate = interfaces.find((i) => i.displayName === 'BaseTemplate');
      const derivedTemplate = interfaces.find((i) => i.displayName === 'DerivedTemplate');

      expect(baseTemplate).toBeDefined();
      expect(derivedTemplate).toBeDefined();
    });

    it('should handle template inheritance with extends', () => {
      const composition = createComposition({
        templates: [
          createTemplate({ name: 'BaseTemplate' }),
          createTemplate({ name: 'DerivedTemplate', extends: 'BaseTemplate' }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const derivedTemplate = interfaces.find((i) => i.displayName === 'DerivedTemplate');
      // DTDL extends uses full model IDs (dtmi:holoscript:BaseTemplate;1)
      expect(derivedTemplate?.extends?.some((e: string) => e.includes('BaseTemplate'))).toBe(true);
    });

    it('should add template state as properties', () => {
      const composition = createComposition({
        templates: [
          createTemplate({
            name: 'StatefulTemplate',
            state: {
              properties: [
                { key: 'counter', value: 0 },
                { key: 'active', value: true },
              ],
            } as HoloState,
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const template = interfaces.find((i) => i.displayName === 'StatefulTemplate');
      const counterProp = template?.contents?.find((c) => c.name === 'counter');
      const activeProp = template?.contents?.find((c) => c.name === 'active');

      expect(counterProp).toBeDefined();
      expect(activeProp).toBeDefined();
    });

    it('should add template actions as commands', () => {
      const composition = createComposition({
        templates: [
          createTemplate({
            name: 'ActionTemplate',
            actions: [{ name: 'activate' }, { name: 'deactivate' }] as any[],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const template = interfaces.find((i) => i.displayName === 'ActionTemplate');
      const commands = template?.contents?.filter((c) => c['@type'] === 'Command');

      expect(commands?.length).toBe(2);
    });

    it('should add template traits as components', () => {
      const composition = createComposition({
        templates: [
          createTemplate({
            name: 'TraitTemplate',
            traits: ['physics', 'grabbable'],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const template = interfaces.find((i) => i.displayName === 'TraitTemplate');
      const components = template?.contents?.filter((c) => c['@type'] === 'Component');

      expect(components?.some((c) => c.name === 'physics')).toBe(true);
      expect(components?.some((c) => c.name === 'grabbable')).toBe(true);
    });
  });

  describe('Object Processing', () => {
    it('should create relationship for each object', () => {
      const composition = createComposition({
        objects: [createObject({ name: 'Object1' }), createObject({ name: 'Object2' })],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces.find((i) => i.displayName === 'TestComposition');
      const relationships = mainInterface?.contents?.filter((c) => c['@type'] === 'Relationship');

      expect(relationships?.length).toBe(2);
    });

    it('should generate interface for objects with state', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'StatefulObject',
            properties: [{ key: 'state', value: { count: 0 } }],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'StatefulObject');
      expect(objInterface).toBeDefined();
    });

    it('should generate interface for objects with sensor trait', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'SensorObject',
            traits: ['sensor'],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'SensorObject');
      expect(objInterface).toBeDefined();
    });

    it('should add telemetry for sensor objects', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'SensorObject',
            traits: ['sensor'],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'SensorObject');
      const telemetry = objInterface?.contents?.find((c) => c['@type'] === 'Telemetry');

      expect(telemetry).toBeDefined();
      expect(telemetry?.name).toBe('sensorReading');
    });

    it('should add position as Location property', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'PositionedObject',
            properties: [
              { key: 'position', value: [1, 2, 3] },
              { key: 'state', value: {} }, // Make it need interface
            ],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'PositionedObject');
      const posProp = objInterface?.contents?.find((c) => c.name === 'position');

      expect(posProp).toBeDefined();
      expect(posProp?.['@type']).toContain('Location');
    });

    it('should handle object template extension', () => {
      const composition = createComposition({
        templates: [createTemplate({ name: 'BaseObject' })],
        objects: [
          createObject({
            name: 'ExtendedObject',
            template: 'BaseObject',
            properties: [{ key: 'state', value: {} }],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'ExtendedObject');
      expect(objInterface?.extends).toContain('BaseObject');
    });
  });

  describe('Environment Properties', () => {
    it('should add skybox property', () => {
      const composition = createComposition({
        environment: { skybox: 'sunset' },
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      const skyboxProp = mainInterface.contents?.find((c) => c.name === 'skybox');

      expect(skyboxProp).toBeDefined();
      expect(skyboxProp?.['@type']).toBe('Property');
      expect(skyboxProp?.schema).toBe('string');
    });

    it('should add ambient light property', () => {
      const composition = createComposition({
        environment: { ambient_light: 0.5 },
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      const ambientProp = mainInterface.contents?.find((c) => c.name === 'ambientLight');

      expect(ambientProp).toBeDefined();
      expect(ambientProp?.schema).toBe('double');
    });

    it('should add fog property', () => {
      const composition = createComposition({
        environment: { fog: true },
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      const fogProp = mainInterface.contents?.find((c) => c.name === 'fogEnabled');

      expect(fogProp).toBeDefined();
      expect(fogProp?.schema).toBe('boolean');
    });
  });

  describe('State Properties', () => {
    it('should compile state properties', () => {
      const composition = createComposition({
        state: {
          properties: [
            { key: 'count', value: 0 },
            { key: 'name', value: 'test' },
            { key: 'active', value: true },
          ],
        } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      expect(mainInterface.contents?.some((c) => c.name === 'count')).toBe(true);
      expect(mainInterface.contents?.some((c) => c.name === 'name')).toBe(true);
      expect(mainInterface.contents?.some((c) => c.name === 'active')).toBe(true);
    });

    it('should mark properties as writable', () => {
      const composition = createComposition({
        state: {
          properties: [{ key: 'counter', value: 0 }],
        } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'counter');
      expect(prop?.writable).toBe(true);
    });
  });

  describe('Logic Commands', () => {
    it('should compile event handlers as commands', () => {
      const composition = createComposition({
        logic: {
          rules: [
            { event: 'on_click', actions: [] },
            { event: 'on_grab', actions: [] },
          ],
        } as unknown as HoloLogic,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      const commands = mainInterface.contents?.filter((c) => c['@type'] === 'Command');

      expect(commands?.some((c) => c.name === 'click')).toBe(true);
      expect(commands?.some((c) => c.name === 'grab')).toBe(true);
    });

    it('should format command display names', () => {
      const composition = createComposition({
        logic: {
          rules: [{ event: 'on_user_enter', actions: [] }],
        } as unknown as HoloLogic,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const command = interfaces[0].contents?.find((c) => c.name === 'user_enter');
      expect(command?.displayName).toBe('User enter');
    });
  });

  describe('Spatial Groups', () => {
    it('should create relationship for spatial groups', () => {
      const composition = createComposition({
        spatialGroups: [
          { name: 'GroupA', objects: [] },
          { name: 'GroupB', objects: [createObject({ name: 'Obj1' })] },
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      const relationships = mainInterface.contents?.filter(
        (c) => c['@type'] === 'Relationship' && (c.name === 'GroupA' || c.name === 'GroupB')
      );

      expect(relationships?.length).toBe(2);
    });

    it('should include object count in description', () => {
      const composition = createComposition({
        spatialGroups: [
          {
            name: 'MyGroup',
            objects: [createObject({ name: 'O1' }), createObject({ name: 'O2' })],
          },
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const mainInterface = interfaces[0];
      const relationship = mainInterface.contents?.find((c) => c.name === 'MyGroup');

      expect(relationship?.description).toContain('2 objects');
    });
  });

  describe('Schema Inference', () => {
    it('should infer boolean schema', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'enabled', value: true }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'enabled');
      expect(prop?.schema).toBe('boolean');
    });

    it('should infer integer schema', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'count', value: 42 }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'count');
      expect(prop?.schema).toBe('integer');
    });

    it('should infer double schema', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'temperature', value: 23.5 }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'temperature');
      expect(prop?.schema).toBe('double');
    });

    it('should infer string schema', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'label', value: 'hello' }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'label');
      expect(prop?.schema).toBe('string');
    });

    it('should infer array schema', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'values', value: [1, 2, 3] }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'values');
      expect(prop?.schema).toEqual({
        '@type': 'Array',
        elementSchema: 'integer',
      });
    });

    it('should infer object schema', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'config', value: { x: 1, y: 2 } }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'config');
      expect(prop?.schema).toMatchObject({
        '@type': 'Object',
        fields: expect.arrayContaining([
          { name: 'x', schema: 'integer' },
          { name: 'y', schema: 'integer' },
        ]),
      });
    });

    it('should handle empty arrays', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'items', value: [] }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'items');
      expect(prop?.schema).toEqual({
        '@type': 'Array',
        elementSchema: 'double',
      });
    });
  });

  describe('Trait Components', () => {
    it('should map grabbable trait to component', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'GrabbableObject',
            traits: ['grabbable'],
            properties: [{ key: 'state', value: {} }],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'GrabbableObject');
      const component = objInterface?.contents?.find((c) => c.name === 'grabbable');

      expect(component).toBeDefined();
      expect(component?.['@type']).toBe('Component');
    });

    it('should map networked trait to component', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'NetworkedObject',
            traits: ['networked'],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const objInterface = interfaces.find((i) => i.displayName === 'NetworkedObject');
      const component = objInterface?.contents?.find((c) => c.name === 'networked');

      expect(component).toBeDefined();
    });

    it('should map physics trait to component', () => {
      const composition = createComposition({
        templates: [
          createTemplate({
            name: 'PhysicsTemplate',
            traits: ['physics'],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const template = interfaces.find((i) => i.displayName === 'PhysicsTemplate');
      const component = template?.contents?.find((c) => c.name === 'physics');

      expect(component).toBeDefined();
    });

    it('should ignore unknown traits', () => {
      const composition = createComposition({
        templates: [
          createTemplate({
            name: 'UnknownTraitTemplate',
            traits: ['unknown_trait', 'another_unknown'],
          }),
        ],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const template = interfaces.find((i) => i.displayName === 'UnknownTraitTemplate');
      const components = template?.contents?.filter((c) => c['@type'] === 'Component');

      expect(components?.length || 0).toBe(0);
    });
  });

  describe('Name Formatting', () => {
    it('should sanitize names with special characters', () => {
      const composition = createComposition({ name: 'My Twin #1!' });
      const interfaces = parseDTDL(compiler.compile(composition));

      expect(interfaces[0]['@id']).not.toContain('#');
      expect(interfaces[0]['@id']).not.toContain('!');
      expect(interfaces[0]['@id']).not.toContain(' ');
    });

    it('should format display names from snake_case', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'my_property_name', value: 0 }] } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'my_property_name');
      expect(prop?.displayName).toBe('My property name');
    });

    it('should generate PascalCase relationship names', () => {
      const composition = createComposition({
        objects: [createObject({ name: 'myObject' })],
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const relationship = interfaces[0].contents?.find((c) => c['@type'] === 'Relationship');
      expect(relationship?.name).toBe('hasMyobject');
    });
  });

  describe('Pre-defined Trait Component Interfaces', () => {
    it('should export grabbable component interface', () => {
      const grabbable = DTDL_TRAIT_COMPONENTS.find((i) => i.displayName === 'Grabbable');

      expect(grabbable).toBeDefined();
      expect(grabbable?.contents?.some((c) => c.name === 'isGrabbed')).toBe(true);
      expect(grabbable?.contents?.some((c) => c.name === 'grabDistance')).toBe(true);
    });

    it('should export networked component interface', () => {
      const networked = DTDL_TRAIT_COMPONENTS.find((i) => i.displayName === 'Networked');

      expect(networked).toBeDefined();
      expect(networked?.contents?.some((c) => c.name === 'networkId')).toBe(true);
      expect(networked?.contents?.some((c) => c.name === 'syncRate')).toBe(true);
    });

    it('should export physics component interface', () => {
      const physics = DTDL_TRAIT_COMPONENTS.find((i) => i.displayName === 'Physics');

      expect(physics).toBeDefined();
      expect(physics?.contents?.some((c) => c.name === 'mass')).toBe(true);
      expect(physics?.contents?.some((c) => c.name === 'friction')).toBe(true);
    });

    it('should export sensor component interface', () => {
      const sensor = DTDL_TRAIT_COMPONENTS.find((i) => i.displayName === 'Sensor');

      expect(sensor).toBeDefined();
      expect(sensor?.contents?.some((c) => c['@type'] === 'Telemetry')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty composition', () => {
      const composition = createComposition();
      const output = compiler.compile(composition);

      expect(() => JSON.parse(output)).not.toThrow();
      const interfaces = parseDTDL(output);
      expect(interfaces.length).toBeGreaterThan(0);
    });

    it('should handle null values', () => {
      const composition = createComposition({
        state: { properties: [{ key: 'nullValue', value: null as any }] } as HoloState,
      });

      expect(() => compiler.compile(composition)).not.toThrow();
    });

    it('should handle deeply nested objects', () => {
      const composition = createComposition({
        state: {
          properties: [
            {
              key: 'nested',
              value: { level1: { level2: { level3: { value: 42 } } } },
            },
          ],
        } as HoloState,
      });
      const interfaces = parseDTDL(compiler.compile(composition));

      const prop = interfaces[0].contents?.find((c) => c.name === 'nested');
      expect(prop?.schema).toMatchObject({ '@type': 'Object' });
    });

    it('should handle objects without traits', () => {
      const composition = createComposition({
        objects: [
          createObject({
            name: 'NoTraits',
            properties: [],
            traits: undefined as any,
          }),
        ],
      });

      expect(() => compiler.compile(composition)).not.toThrow();
    });
  });

  describe('Integration', () => {
    it('should compile a complete IoT digital twin', () => {
      const composition = createComposition({
        name: 'SmartBuildingFloor',
        environment: {
          skybox: 'day',
          ambient_light: 0.7,
        },
        templates: [
          createTemplate({
            name: 'SensorDevice',
            traits: ['sensor', 'networked'],
            state: { properties: [{ key: 'lastReading', value: 0 }] } as HoloState,
          }),
        ],
        objects: [
          createObject({
            name: 'TemperatureSensor1',
            template: 'SensorDevice',
            properties: [
              { key: 'position', value: [1, 0, 2] },
              { key: 'state', value: { temperature: 22.5, unit: 'celsius' } },
            ],
            traits: ['sensor', 'observable'],
          }),
          createObject({
            name: 'HVACUnit',
            properties: [
              { key: 'position', value: [5, 0, 5] },
              { key: 'power', value: 1000 },
              { key: 'state', value: { mode: 'auto', setpoint: 21 } },
            ],
            traits: ['networked'],
          }),
        ],
        spatialGroups: [
          {
            name: 'ZoneA',
            objects: [createObject({ name: 'Light1' }), createObject({ name: 'Light2' })],
          },
        ],
        state: {
          properties: [
            { key: 'occupancy', value: 0 },
            { key: 'energyUsage', value: 0.0 },
          ],
        } as HoloState,
        logic: {
          rules: [
            { event: 'on_occupancy_change', actions: [] },
            { event: 'on_temperature_alert', actions: [] },
          ],
        } as unknown as HoloLogic,
      });

      const customCompiler = new DTDLCompiler({
        namespace: 'dtmi:smartbuilding',
        modelVersion: 2,
      });
      const output = customCompiler.compile(composition);
      const interfaces = parseDTDL(output);

      // Verify main interface
      const mainInterface = interfaces.find((i) => i.displayName === 'SmartBuildingFloor');
      expect(mainInterface).toBeDefined();
      expect(mainInterface?.['@id']).toBe('dtmi:smartbuilding:SmartBuildingFloor;2');

      // Verify environment properties
      expect(mainInterface?.contents?.some((c) => c.name === 'skybox')).toBe(true);
      expect(mainInterface?.contents?.some((c) => c.name === 'ambientLight')).toBe(true);

      // Verify state properties
      expect(mainInterface?.contents?.some((c) => c.name === 'occupancy')).toBe(true);
      expect(mainInterface?.contents?.some((c) => c.name === 'energyUsage')).toBe(true);

      // Verify commands
      expect(mainInterface?.contents?.some((c) => c.name === 'occupancy_change')).toBe(true);
      expect(mainInterface?.contents?.some((c) => c.name === 'temperature_alert')).toBe(true);

      // Verify template
      const sensorTemplate = interfaces.find((i) => i.displayName === 'SensorDevice');
      expect(sensorTemplate).toBeDefined();
      expect(sensorTemplate?.contents?.some((c) => c['@type'] === 'Component')).toBe(true);

      // Verify sensor object with telemetry
      const tempSensor = interfaces.find((i) => i.displayName === 'TemperatureSensor1');
      expect(tempSensor).toBeDefined();
      expect(tempSensor?.extends).toContain('SensorDevice');
      expect(tempSensor?.contents?.some((c) => c['@type'] === 'Telemetry')).toBe(true);

      // Verify relationships (name is hasTemperaturesensor1 due to PascalCase conversion)
      expect(
        mainInterface?.contents?.some(
          (c) => c['@type'] === 'Relationship' && c.displayName === 'TemperatureSensor1'
        )
      ).toBe(true);
      expect(
        mainInterface?.contents?.some(
          (c) => c['@type'] === 'Relationship' && c.displayName === 'ZoneA'
        )
      ).toBe(true);
    });
  });
});
