/**
 * ThingDescriptionGenerator Production Tests
 *
 * Tests W3C WoT TD generation from HoloScript nodes with @wot_thing trait.
 * Covers generate, generateAll, validate, serialize, security definitions,
 * property/action/event extraction, inferType, toTitleCase.
 */

import { describe, it, expect } from 'vitest';
import {
  ThingDescriptionGenerator,
  generateThingDescription,
  generateAllThingDescriptions,
  serializeThingDescription,
  validateThingDescription,
} from '../ThingDescriptionGenerator';
import type { HSPlusNode } from '../../types/AdvancedTypeSystem';

function makeNode(overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    id: 'n1',
    type: 'entity',
    name: 'TestThing',
    children: [],
    properties: {},
    directives: [],
    ...overrides,
  } as HSPlusNode;
}

const wotDirective = (args: Record<string, unknown> = {}) => ({
  type: 'trait' as const,
  name: 'wot_thing',
  args: { title: 'My Lamp', security: 'nosec', ...args },
});

describe('ThingDescriptionGenerator — Production', () => {
  const gen = new ThingDescriptionGenerator({ baseUrl: 'http://example.com' });

  // ─── generate ──────────────────────────────────────────────────────────────

  it('returns null for node without wot_thing', () => {
    const node = makeNode();
    expect(gen.generate(node)).toBeNull();
  });

  it('generates basic TD with @context and security', () => {
    const node = makeNode({ directives: [wotDirective()] });
    const td = gen.generate(node)!;
    expect(td['@context']).toBe('https://www.w3.org/2022/wot/td/v1.1');
    expect(td.title).toBe('My Lamp');
    expect(td.security).toBe('default');
    expect(td.securityDefinitions.default.scheme).toBe('nosec');
  });

  it('includes description when set', () => {
    const node = makeNode({ directives: [wotDirective({ description: 'A smart lamp' })] });
    const td = gen.generate(node)!;
    expect(td.description).toBe('A smart lamp');
  });

  it('includes base from config or options', () => {
    const node = makeNode({ directives: [wotDirective({ base: 'http://thing.local' })] });
    const td = gen.generate(node)!;
    expect(td.base).toBe('http://thing.local');
  });

  it('includes version', () => {
    const node = makeNode({ directives: [wotDirective({ version: '2.0' })] });
    const td = gen.generate(node)!;
    expect(td.version).toEqual({ instance: '2.0' });
  });

  it('uses id from config or falls back to urn', () => {
    const node = makeNode({ directives: [wotDirective({ id: 'urn:dev:my-lamp' })] });
    const td = gen.generate(node)!;
    expect(td.id).toBe('urn:dev:my-lamp');
  });

  // ─── Security Definitions ─────────────────────────────────────────────────

  it('basic security definition', () => {
    const node = makeNode({ directives: [wotDirective({ security: 'basic' })] });
    const td = gen.generate(node)!;
    expect(td.securityDefinitions.default).toEqual({ scheme: 'basic', in: 'header' });
  });

  it('bearer security definition', () => {
    const node = makeNode({ directives: [wotDirective({ security: 'bearer' })] });
    const td = gen.generate(node)!;
    expect(td.securityDefinitions.default.scheme).toBe('bearer');
  });

  it('apikey security definition', () => {
    const node = makeNode({ directives: [wotDirective({ security: 'apikey' })] });
    const td = gen.generate(node)!;
    expect((td.securityDefinitions.default as any).name).toBe('X-API-Key');
  });

  it('oauth2 security definition', () => {
    const node = makeNode({ directives: [wotDirective({ security: 'oauth2' })] });
    const td = gen.generate(node)!;
    expect((td.securityDefinitions.default as any).flow).toBe('code');
  });

  // ─── Properties from state ────────────────────────────────────────────────

  it('extracts properties from inline state', () => {
    const node = makeNode({
      directives: [wotDirective()],
      properties: { state: { brightness: 75, on: true } },
    });
    const td = gen.generate(node)!;
    expect(td.properties).toBeDefined();
    expect(td.properties!.brightness.type).toBe('integer');
    expect(td.properties!.on.type).toBe('boolean');
  });

  it('extracts properties from @state directive body', () => {
    const node = makeNode({
      directives: [
        wotDirective(),
        { type: 'state' as any, name: 'state', body: { temp: 22.5, label: 'room' }, args: {} },
      ],
    });
    const td = gen.generate(node)!;
    expect(td.properties!.temp.type).toBe('number');
    expect(td.properties!.label.type).toBe('string');
  });

  it('array property gets items schema', () => {
    const node = makeNode({
      directives: [wotDirective()],
      properties: { state: { tags: ['a', 'b'] } },
    });
    const td = gen.generate(node)!;
    expect(td.properties!.tags.type).toBe('array');
    expect(td.properties!.tags.items).toEqual({ type: 'string' });
  });

  it('object property gets nested properties', () => {
    const node = makeNode({
      directives: [wotDirective()],
      properties: { state: { pos: { x: 0, y: 1 } } },
    });
    const td = gen.generate(node)!;
    expect(td.properties!.pos.type).toBe('object');
    expect(td.properties!.pos.properties!.x.type).toBe('integer');
  });

  // ─── Actions from lifecycle hooks ─────────────────────────────────────────

  it('extracts actions from on_click lifecycle', () => {
    const node = makeNode({
      directives: [
        wotDirective(),
        { type: 'lifecycle' as any, name: 'on_click', hook: 'on_click', args: {} },
      ],
    });
    const td = gen.generate(node)!;
    expect(td.actions).toBeDefined();
    expect(td.actions!.click.title).toBe('Click');
    expect(td.actions!.click.forms![0].op).toBe('invokeaction');
  });

  // ─── Events from observables ──────────────────────────────────────────────

  it('extracts events from @observable directive', () => {
    const node = makeNode({
      directives: [
        wotDirective(),
        { type: 'directive' as any, name: 'observable', args: { name: 'brightness_changed' } },
      ],
    });
    const td = gen.generate(node)!;
    expect(td.events).toBeDefined();
    expect(td.events!.brightness_changed.forms![0].subprotocol).toBe('sse');
  });

  // ─── generateAll ──────────────────────────────────────────────────────────

  it('generates for all matching nodes', () => {
    const nodes = [
      makeNode({ directives: [wotDirective()] }),
      makeNode({ name: 'NoProp' }),
      makeNode({ directives: [wotDirective({ title: 'Second' })] }),
    ];
    const results = gen.generateAll(nodes);
    expect(results).toHaveLength(2);
  });

  it('generateAll recurses children', () => {
    const child = makeNode({ id: 'c1', directives: [wotDirective({ title: 'Child' })] });
    const parent = makeNode({ children: [child] });
    const results = gen.generateAll([parent]);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Child');
  });

  // ─── Convenience functions ────────────────────────────────────────────────

  it('generateThingDescription convenience', () => {
    const node = makeNode({ directives: [wotDirective()] });
    const td = generateThingDescription(node, { baseUrl: 'http://x.com' });
    expect(td).not.toBeNull();
  });

  it('generateAllThingDescriptions convenience', () => {
    const tds = generateAllThingDescriptions([makeNode({ directives: [wotDirective()] })]);
    expect(tds.length).toBe(1);
  });

  it('serializeThingDescription pretty', () => {
    const node = makeNode({ directives: [wotDirective()] });
    const td = gen.generate(node)!;
    const json = serializeThingDescription(td, true);
    expect(json).toContain('\n');
  });

  it('serializeThingDescription compact', () => {
    const node = makeNode({ directives: [wotDirective()] });
    const td = gen.generate(node)!;
    const json = serializeThingDescription(td, false);
    expect(json).not.toContain('\n');
  });

  // ─── validateThingDescription ─────────────────────────────────────────────

  it('valid TD passes validation', () => {
    const node = makeNode({ directives: [wotDirective()] });
    const td = gen.generate(node)!;
    const result = validateThingDescription(td);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing context fails validation', () => {
    const result = validateThingDescription({
      '@context': '',
      title: 'X',
      security: 'default',
      securityDefinitions: { default: { scheme: 'nosec' } },
    } as any);
    expect(result.valid).toBe(false);
  });

  it('missing security def fails validation', () => {
    const result = validateThingDescription({
      '@context': 'https://www.w3.org/2022/wot/td/v1.1',
      title: 'X',
      security: 'missing',
      securityDefinitions: {},
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing');
  });
});
