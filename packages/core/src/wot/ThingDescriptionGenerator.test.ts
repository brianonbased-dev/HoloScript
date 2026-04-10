/**
 * W3C WoT Thing Description Generator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThingDescriptionGenerator,
  generateThingDescription,
  generateAllThingDescriptions,
  serializeThingDescription,
  validateThingDescription,
  type ThingDescription,
} from './ThingDescriptionGenerator';
import type { HSPlusNode, HSPlusDirective } from '../types/AdvancedTypeSystem';

describe('ThingDescriptionGenerator', () => {
  let generator: ThingDescriptionGenerator;

  beforeEach(() => {
    generator = new ThingDescriptionGenerator({
      baseUrl: 'http://localhost:8080',
      defaultObservable: true,
    });
  });

  describe('generate()', () => {
    it('should return null for nodes without @wot_thing trait', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'testObject',
        properties: {},
        directives: [],
      };

      const result = generator.generate(node);
      expect(result).toBeNull();
    });

    it('should generate TD for node with @wot_thing trait', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'thermostat',
        properties: {},
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: {
              title: 'Smart Thermostat',
              description: 'A connected thermostat',
              security: 'nosec',
            },
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result).not.toBeNull();
      expect(result!['@context']).toBe('https://www.w3.org/2022/wot/td/v1.1');
      expect(result!.title).toBe('Smart Thermostat');
      expect(result!.description).toBe('A connected thermostat');
      expect(result!.security).toBe('default');
      expect(result!.securityDefinitions.default.scheme).toBe('nosec');
    });

    it('should generate properties from @state directive', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'sensor',
        properties: {},
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Temperature Sensor', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'directive',
            name: 'state',
            body: {
              temperature: 22.5,
              humidity: 45,
              active: true,
              location: 'living_room',
            },
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result).not.toBeNull();
      expect(result!.properties).toBeDefined();
      expect(result!.properties!.temperature).toBeDefined();
      expect(result!.properties!.temperature.type).toBe('number');
      expect(result!.properties!.temperature.default).toBe(22.5);
      expect(result!.properties!.temperature.observable).toBe(true);

      expect(result!.properties!.humidity.type).toBe('integer');
      expect(result!.properties!.active.type).toBe('boolean');
      expect(result!.properties!.location.type).toBe('string');
    });

    it('should generate actions from @on_* handlers', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'device',
        properties: {},
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Smart Device', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'hook',
            hook: 'on_click',
            args: {},
            body: 'toggleState()',
          } as HSPlusDirective,
          {
            type: 'hook',
            hook: 'on_grab',
            args: { hand: 'right' },
            body: 'pickup()',
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result).not.toBeNull();
      expect(result!.actions).toBeDefined();
      expect(result!.actions!.click).toBeDefined();
      expect(result!.actions!.click.title).toBe('Click');
      expect(result!.actions!.click.forms![0].href).toContain('/actions/click');

      expect(result!.actions!.grab).toBeDefined();
      expect(result!.actions!.grab.input).toBeDefined();
    });

    it('should generate events from @observable directives', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'sensor',
        properties: {},
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Motion Sensor', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'directive',
            name: 'observable',
            args: { name: 'motion_detected' },
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result).not.toBeNull();
      expect(result!.events).toBeDefined();
      expect(result!.events!.motion_detected).toBeDefined();
      expect(result!.events!.motion_detected.title).toBe('Motion Detected');
      expect(result!.events!.motion_detected.forms![0].subprotocol).toBe('sse');
    });

    it('should handle different security schemes', () => {
      const securityTypes: Array<'nosec' | 'basic' | 'bearer' | 'oauth2' | 'apikey'> = [
        'nosec',
        'basic',
        'bearer',
        'oauth2',
        'apikey',
      ];

      for (const security of securityTypes) {
        const node: HSPlusNode = {
          type: 'object',
          name: 'device',
          directives: [
            {
              type: 'trait',
              name: 'wot_thing',
              args: { title: 'Test Device', security },
            } as HSPlusDirective,
          ],
        };

        const result = generator.generate(node);
        expect(result).not.toBeNull();
        expect(result!.securityDefinitions.default.scheme).toBe(security);
      }
    });

    it('should use custom base URL in forms', () => {
      const customGenerator = new ThingDescriptionGenerator({
        baseUrl: 'https://api.example.com/things',
      });

      const node: HSPlusNode = {
        type: 'object',
        name: 'device',
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Device', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'directive',
            name: 'state',
            body: { value: 100 },
          } as HSPlusDirective,
        ],
      };

      const result = customGenerator.generate(node);

      expect(result!.properties!.value.forms![0].href).toBe(
        'https://api.example.com/things/properties/value'
      );
    });
  });

  describe('generateAll()', () => {
    it('should generate TDs for all nodes with @wot_thing trait', () => {
      const nodes: HSPlusNode[] = [
        {
          type: 'object',
          name: 'sensor1',
          directives: [
            {
              type: 'trait',
              name: 'wot_thing',
              args: { title: 'Sensor 1', security: 'nosec' },
            } as HSPlusDirective,
          ],
        },
        {
          type: 'object',
          name: 'regularObject',
          directives: [],
        },
        {
          type: 'object',
          name: 'sensor2',
          directives: [
            {
              type: 'trait',
              name: 'wot_thing',
              args: { title: 'Sensor 2', security: 'basic' },
            } as HSPlusDirective,
          ],
        },
      ];

      const results = generator.generateAll(nodes);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Sensor 1');
      expect(results[1].title).toBe('Sensor 2');
    });

    it('should process nested children recursively', () => {
      const nodes: HSPlusNode[] = [
        {
          type: 'object',
          name: 'parent',
          directives: [],
          children: [
            {
              type: 'object',
              name: 'child',
              directives: [
                {
                  type: 'trait',
                  name: 'wot_thing',
                  args: { title: 'Child Thing', security: 'nosec' },
                } as HSPlusDirective,
              ],
            },
          ],
        },
      ];

      const results = generator.generateAll(nodes);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Child Thing');
    });
  });

  describe('validateThingDescription()', () => {
    it('should validate a complete TD', () => {
      const td: ThingDescription = {
        '@context': 'https://www.w3.org/2022/wot/td/v1.1',
        title: 'Test Thing',
        security: 'default',
        securityDefinitions: {
          default: { scheme: 'nosec' },
        },
      };

      const result = validateThingDescription(td);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required fields', () => {
      const td = {
        title: 'Test Thing',
        security: 'default',
        securityDefinitions: {
          default: { scheme: 'nosec' },
        },
      } as unknown as ThingDescription;

      const result = validateThingDescription(td);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field '@context'");
    });

    it('should validate security references', () => {
      const td: ThingDescription = {
        '@context': 'https://www.w3.org/2022/wot/td/v1.1',
        title: 'Test Thing',
        security: 'nonexistent',
        securityDefinitions: {
          default: { scheme: 'nosec' },
        },
      };

      const result = validateThingDescription(td);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Security definition 'nonexistent' not found in securityDefinitions"
      );
    });

    it('should validate form hrefs', () => {
      const td: ThingDescription = {
        '@context': 'https://www.w3.org/2022/wot/td/v1.1',
        title: 'Test Thing',
        security: 'default',
        securityDefinitions: {
          default: { scheme: 'nosec' },
        },
        properties: {
          value: {
            type: 'number',
            forms: [{ href: '' }],
          },
        },
      };

      const result = validateThingDescription(td);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Form missing required href');
    });
  });

  describe('serializeThingDescription()', () => {
    it('should serialize TD to pretty JSON', () => {
      const td: ThingDescription = {
        '@context': 'https://www.w3.org/2022/wot/td/v1.1',
        title: 'Test',
        security: 'default',
        securityDefinitions: { default: { scheme: 'nosec' } },
      };

      const json = serializeThingDescription(td, true);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
      expect(JSON.parse(json)).toEqual(td);
    });

    it('should serialize TD to compact JSON', () => {
      const td: ThingDescription = {
        '@context': 'https://www.w3.org/2022/wot/td/v1.1',
        title: 'Test',
        security: 'default',
        securityDefinitions: { default: { scheme: 'nosec' } },
      };

      const json = serializeThingDescription(td, false);

      expect(json).not.toContain('\n');
      expect(JSON.parse(json)).toEqual(td);
    });
  });

  describe('convenience functions', () => {
    it('generateThingDescription() should create generator and generate', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'test',
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Test', security: 'nosec' },
          } as HSPlusDirective,
        ],
      };

      const result = generateThingDescription(node);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test');
    });

    it('generateAllThingDescriptions() should process array', () => {
      const nodes: HSPlusNode[] = [
        {
          type: 'object',
          name: 'a',
          directives: [
            {
              type: 'trait',
              name: 'wot_thing',
              args: { title: 'A', security: 'nosec' },
            } as HSPlusDirective,
          ],
        },
      ];

      const results = generateAllThingDescriptions(nodes);

      expect(results).toHaveLength(1);
    });
  });

  describe('type inference', () => {
    it('should correctly infer types from values', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'test',
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Type Test', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'directive',
            name: 'state',
            body: {
              boolProp: false,
              intProp: 42,
              floatProp: 3.14,
              stringProp: 'hello',
              arrayProp: [1, 2, 3],
              objectProp: { nested: 'value' },
              nullProp: null,
            },
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result!.properties!.boolProp.type).toBe('boolean');
      expect(result!.properties!.intProp.type).toBe('integer');
      expect(result!.properties!.floatProp.type).toBe('number');
      expect(result!.properties!.stringProp.type).toBe('string');
      expect(result!.properties!.arrayProp.type).toBe('array');
      expect(result!.properties!.objectProp.type).toBe('object');
      expect(result!.properties!.nullProp.type).toBe('null');
    });

    it('should handle array items schema', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'test',
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Array Test', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'directive',
            name: 'state',
            body: {
              numbers: [1, 2, 3],
              strings: ['a', 'b'],
            },
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result!.properties!.numbers.items!.type).toBe('integer');
      expect(result!.properties!.strings.items!.type).toBe('string');
    });

    it('should handle nested object schema', () => {
      const node: HSPlusNode = {
        type: 'object',
        name: 'test',
        directives: [
          {
            type: 'trait',
            name: 'wot_thing',
            args: { title: 'Nested Test', security: 'nosec' },
          } as HSPlusDirective,
          {
            type: 'directive',
            name: 'state',
            body: {
              config: {
                enabled: true,
                threshold: 50,
                name: 'default',
              },
            },
          } as HSPlusDirective,
        ],
      };

      const result = generator.generate(node);

      expect(result!.properties!.config.type).toBe('object');
      expect(result!.properties!.config.properties!.enabled.type).toBe('boolean');
      expect(result!.properties!.config.properties!.threshold.type).toBe('integer');
      expect(result!.properties!.config.properties!.name.type).toBe('string');
    });
  });
});
