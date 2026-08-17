import { describe, expect, it } from 'vitest';
import {
  deriveTraitSchemaFromHolo,
  deriveTraitFromHolo,
  collectUiIssues,
  mapPropType,
  parseEnumMembers,
  categorizeTraitConflict,
  isUnionSafeConflict,
  mergeTraitSchemas,
} from '../deriveTraitSchema';
import { parseHolo, getPropDefaults } from '../../../parser/HoloCompositionParser';
import type { TraitSchema } from '../ConfabulationValidator';

describe('deriveTraitSchema — trait props-schema derivation from .holo', () => {
  describe('parseEnumMembers', () => {
    it('extracts members from a canonical enum type-spec', () => {
      expect(parseEnumMembers('enum("equal" | "weighted" | "multi_armed_bandit")')).toEqual([
        'equal',
        'weighted',
        'multi_armed_bandit',
      ]);
    });

    it('tolerates the legacy concatenated form (no separators)', () => {
      expect(parseEnumMembers('enum("a""b""c")')).toEqual(['a', 'b', 'c']);
    });

    it('returns [] when there is no parenthesized member list', () => {
      expect(parseEnumMembers('enum')).toEqual([]);
    });
  });

  describe('mapPropType', () => {
    it('maps scalar type keywords', () => {
      expect(mapPropType('number')).toEqual({ type: 'number' });
      expect(mapPropType('boolean')).toEqual({ type: 'boolean' });
      expect(mapPropType('vector3')).toEqual({ type: 'vector3' });
    });

    it('maps enum type-specs to enum + members', () => {
      expect(mapPropType('enum("x" | "y")')).toEqual({ type: 'enum', enumValues: ['x', 'y'] });
    });

    it('falls back to any for unknown or non-string specs', () => {
      expect(mapPropType('SomeCustomType')).toEqual({ type: 'any' });
      expect(mapPropType(42)).toEqual({ type: 'any' });
      // An enum with no recoverable members is not enforceable.
      expect(mapPropType('enum')).toEqual({ type: 'any' });
    });
  });

  describe('deriveTraitSchemaFromHolo', () => {
    it('derives name (@-stripped), category, and enum + scalar props', () => {
      const schema = deriveTraitSchemaFromHolo(`
        @trait {
          name: "@abtest",
          category: "analytics",
          props: {
            enabled: boolean = true,
            default_strategy: enum("equal" | "weighted" | "multi_armed_bandit") = "equal",
            alpha: number = 0.05
          }
        }
      `);
      expect(schema).not.toBeNull();
      expect(schema?.name).toBe('abtest');
      expect(schema?.category).toBe('analytics');
      const byName = Object.fromEntries((schema?.properties ?? []).map((p) => [p.name, p]));
      // The declared `= default` survives parsing — it used to be discarded, so every one
      // of these arrived as a bare {name, type}.
      expect(byName.enabled).toEqual({ name: 'enabled', type: 'boolean', defaultValue: true });
      expect(byName.alpha).toEqual({ name: 'alpha', type: 'number', defaultValue: 0.05 });
      expect(byName.default_strategy).toEqual({
        name: 'default_strategy',
        type: 'enum',
        enumValues: ['equal', 'weighted', 'multi_armed_bandit'],
        defaultValue: 'equal',
      });
    });

    it('defaults category to uncategorized when absent', () => {
      const schema = deriveTraitSchemaFromHolo(`
        @trait { name: "@x", props: { a: number = 1 } }
      `);
      expect(schema?.category).toBe('uncategorized');
    });

    it('returns null for sources with no @trait', () => {
      expect(deriveTraitSchemaFromHolo('composition "Empty" {}')).toBeNull();
    });

    it('returns null for an unparseable source', () => {
      expect(deriveTraitSchemaFromHolo('@trait { name: "@broken", props: {')).toBeNull();
    });
  });

  describe('conflict categorization + union merge (Phase 2)', () => {
    const enumA: TraitSchema = {
      name: 'x',
      category: 'c',
      properties: [{ name: 'mode', type: 'enum', enumValues: ['a', 'b'] }],
    };
    const enumB: TraitSchema = {
      name: 'x',
      category: 'c',
      properties: [{ name: 'mode', type: 'enum', enumValues: ['b', 'c'] }],
    };

    it('classifies same-shape differing-enum as enum-divergent (union-safe)', () => {
      const cat = categorizeTraitConflict([enumA, enumB]);
      expect(cat).toBe('enum-divergent');
      expect(isUnionSafeConflict(cat)).toBe(true);
    });

    it('classifies a shared prop with differing types as type-conflict (not union-safe)', () => {
      const cat = categorizeTraitConflict([
        { name: 'x', category: 'c', properties: [{ name: 'p', type: 'number' }] },
        { name: 'x', category: 'c', properties: [{ name: 'p', type: 'string' }] },
      ]);
      expect(cat).toBe('type-conflict');
      expect(isUnionSafeConflict(cat)).toBe(false);
    });

    it('classifies mostly-different prop sets as disjoint (needs rename)', () => {
      const cat = categorizeTraitConflict([
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'number' }] },
        { name: 'x', category: 'c', properties: [{ name: 'z', type: 'number' }] },
      ]);
      expect(cat).toBe('disjoint');
      expect(isUnionSafeConflict(cat)).toBe(false);
    });

    it('merges enum-divergent variants to the UNION of members (never narrows)', () => {
      const merged = mergeTraitSchemas([enumA, enumB]);
      const mode = merged.properties.find((p) => p.name === 'mode');
      expect(mode?.type).toBe('enum');
      expect(mode?.enumValues).toEqual(['a', 'b', 'c']);
    });

    it('merges prop-superset variants to the union of props', () => {
      const merged = mergeTraitSchemas([
        {
          name: 'x',
          category: 'c',
          properties: [
            { name: 'a', type: 'number' },
            { name: 'b', type: 'boolean' },
          ],
        },
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'number' }] },
      ]);
      expect(merged.properties.map((p) => p.name).sort()).toEqual(['a', 'b']);
    });
  });

  describe('declared `= default` values', () => {
    const derive = (props: string) =>
      deriveTraitSchemaFromHolo(`@trait { name: "@d", category: "c", props: { ${props} } }`);

    const propNamed = (props: string, name: string) =>
      derive(props)?.properties.find((p) => p.name === name);

    it('captures scalar defaults of every type', () => {
      expect(propNamed('a: number = 320', 'a')?.defaultValue).toBe(320);
      expect(propNamed('a: number = -0.5', 'a')?.defaultValue).toBe(-0.5);
      expect(propNamed('a: string = "hello"', 'a')?.defaultValue).toBe('hello');
      expect(propNamed('a: string = ""', 'a')?.defaultValue).toBe('');
      expect(propNamed('a: boolean = true', 'a')?.defaultValue).toBe(true);
      expect(propNamed('a: boolean = false', 'a')?.defaultValue).toBe(false);
    });

    it('captures an enum default alongside its members', () => {
      const prop = propNamed('mode: enum("compact" | "full") = "full"', 'mode');
      expect(prop).toEqual({
        name: 'mode',
        type: 'enum',
        enumValues: ['compact', 'full'],
        defaultValue: 'full',
      });
    });

    it('captures array and object defaults', () => {
      expect(propNamed('a: array = []', 'a')?.defaultValue).toEqual([]);
      expect(propNamed('a: array = [1, 2]', 'a')?.defaultValue).toEqual([1, 2]);
      expect(propNamed('a: object = { x: 1 }', 'a')?.defaultValue).toEqual({ x: 1 });
    });

    it('omits the key entirely when no default is declared', () => {
      // `defaultValue: undefined` and "no default declared" are different claims, and
      // consumers test for the key's presence.
      const prop = propNamed('a: number', 'a');
      expect(prop).toEqual({ name: 'a', type: 'number' });
      expect(prop).not.toHaveProperty('defaultValue');
    });

    it('captures defaults for some props while others declare none', () => {
      const schema = derive('a: number = 1, b: number, c: string = "x"');
      const byName = Object.fromEntries((schema?.properties ?? []).map((p) => [p.name, p]));
      expect(byName.a.defaultValue).toBe(1);
      expect(byName.b).not.toHaveProperty('defaultValue');
      expect(byName.c.defaultValue).toBe('x');
    });

    it('a falsy default is captured, not treated as absent', () => {
      // The bug class this guards: `if (default)` instead of `if (key in defaults)`.
      expect(propNamed('a: number = 0', 'a')).toHaveProperty('defaultValue', 0);
      expect(propNamed('a: boolean = false', 'a')).toHaveProperty('defaultValue', false);
      expect(propNamed('a: string = ""', 'a')).toHaveProperty('defaultValue', '');
    });
  });

  describe('default capture does not disturb the props object', () => {
    // The parser stashes defaults on a NON-ENUMERABLE key. If that ever became an ordinary
    // key, every consumer iterating props would see a phantom prop — so this is the guard
    // that lets the capture be additive rather than a shape change.
    const parsed = parseHolo(`
      @trait { name: "@d", category: "c", props: { a: number = 1, b: string = "x" } }
    `);
    const props = (
      parsed.ast as unknown as { traits?: Array<{ config?: { props?: Record<string, unknown> } }> }
    )?.traits?.[0]?.config?.props;

    it('parses cleanly', () => {
      expect(parsed.errors).toEqual([]);
      expect(props).toBeDefined();
    });

    it('exposes exactly the declared props to Object.keys', () => {
      expect(Object.keys(props!)).toEqual(['a', 'b']);
    });

    it('keeps the stash out of JSON, spread and for…in', () => {
      expect(JSON.parse(JSON.stringify(props))).toEqual({ a: 'number', b: 'string' });
      expect({ ...props! }).toEqual({ a: 'number', b: 'string' });
      const seen: string[] = [];
      for (const key in props!) seen.push(key);
      expect(seen).toEqual(['a', 'b']);
    });

    it('still yields the defaults through the accessor', () => {
      expect(getPropDefaults(props)).toEqual({ a: 1, b: 'x' });
    });

    it('returns undefined for objects that declared no defaults', () => {
      expect(getPropDefaults({ a: 'number' })).toBeUndefined();
      expect(getPropDefaults(undefined)).toBeUndefined();
      expect(getPropDefaults(null)).toBeUndefined();
      expect(getPropDefaults('not an object')).toBeUndefined();
    });
  });

  describe('ui: block — per-property authoring affordances', () => {
    /** Build a trait source with the given props and ui blocks. */
    const trait = (props: string, ui: string) => `
      @trait {
        name: "@demo",
        category: "ui",
        props: { ${props} },
        ui: { ${ui} }
      }
    `;

    const propNamed = (source: string, name: string) =>
      deriveTraitFromHolo(source)?.schema.properties.find((p) => p.name === name);

    const issuesOf = (source: string) => deriveTraitFromHolo(source)?.uiIssues ?? [];

    it('applies label, range, step and hidden onto the matching property', () => {
      const source = trait(
        'width_px: number = 320, cache_key: string = ""',
        'width_px: { label: "Panel Width", range: [100, 800], step: 10 }, cache_key: { hidden: true }'
      );
      expect(issuesOf(source)).toEqual([]);
      expect(propNamed(source, 'width_px')).toEqual({
        name: 'width_px',
        type: 'number',
        defaultValue: 320,
        label: 'Panel Width',
        step: 10,
        min: 100,
        max: 800,
      });
      expect(propNamed(source, 'cache_key')).toEqual({
        name: 'cache_key',
        type: 'string',
        defaultValue: '',
        hidden: true,
      });
    });

    it('leaves a property with no ui entry exactly as it was', () => {
      const source = trait(
        'a: number = 1, b: number = 2',
        'a: { label: "A", range: [0, 10] }'
      );
      expect(propNamed(source, 'b')).toEqual({ name: 'b', type: 'number', defaultValue: 2 });
    });

    it('derives an identical schema when no ui block is declared at all', () => {
      const withoutUi = `
        @trait { name: "@demo", category: "ui", props: { a: number = 1 } }
      `;
      const derived = deriveTraitFromHolo(withoutUi);
      expect(derived?.uiIssues).toEqual([]);
      expect(derived?.schema.properties).toEqual([
        { name: 'a', type: 'number', defaultValue: 1 },
      ]);
    });

    // ── Refusals. Each must be REPORTED and must NOT be applied: a faulty entry
    // leaves the property exactly as it would have been with no ui block, so a
    // reported issue can never silently change what an editor renders.
    const refusals: Array<{ why: string; props: string; ui: string; expect: RegExp }> = [
      {
        why: 'range whose min exceeds its max',
        props: 'a: number = 1',
        ui: 'a: { range: [800, 100] }',
        expect: /min \(800\) is greater than max \(100\)/,
      },
      {
        why: 'range that is not two finite numbers',
        props: 'a: number = 1',
        ui: 'a: { range: [1, 2, 3] }',
        expect: /two finite numbers/,
      },
      {
        why: 'range on a non-numeric property',
        props: 'a: string = ""',
        ui: 'a: { range: [0, 10] }',
        expect: /only number is rangeable/,
      },
      {
        why: 'a non-positive step',
        props: 'a: number = 1',
        ui: 'a: { step: -1 }',
        expect: /positive finite number/,
      },
      {
        why: 'step on a non-numeric property',
        props: 'a: boolean = true',
        ui: 'a: { step: 1 }',
        expect: /only number is steppable/,
      },
      {
        why: 'an empty label',
        props: 'a: number = 1',
        ui: 'a: { label: "" }',
        expect: /non-empty string/,
      },
      {
        why: 'a non-boolean hidden',
        props: 'a: number = 1',
        ui: 'a: { hidden: 1 }',
        expect: /hidden must be a boolean/,
      },
      {
        why: 'an unknown ui key',
        props: 'a: number = 1',
        ui: 'a: { colour: "red" }',
        expect: /unknown ui key "colour"/,
      },
      {
        why: 'a ui key naming no declared prop',
        props: 'a: number = 1',
        ui: 'typo_name: { label: "Nope" }',
        expect: /names no declared prop/,
      },
    ];

    for (const refusal of refusals) {
      it(`reports and does not apply ${refusal.why}`, () => {
        const source = trait(refusal.props, refusal.ui);
        const issues = issuesOf(source);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.map((i) => i.problem).join(' | ')).toMatch(refusal.expect);

        // The property is untouched — no partial application of a faulty entry. Asserted as
        // "carries no affordance" rather than an exact key list, so this keeps testing intent
        // when unrelated fields (defaultValue) legitimately appear.
        const prop = propNamed(source, 'a');
        expect(prop).toBeDefined();
        for (const key of ['label', 'min', 'max', 'step', 'hidden']) {
          expect(prop, `${key} was applied from a faulty entry`).not.toHaveProperty(key);
        }
      });
    }

    it('reports every problem in one entry, not just the first', () => {
      const source = trait('a: string = ""', 'a: { range: [9, 1], step: 0, bogus: true }');
      expect(issuesOf(source).length).toBeGreaterThanOrEqual(3);
    });

    it('names the trait and prop at fault so the author can find it', () => {
      const source = trait('a: number = 1', 'a: { range: [5, 1] }');
      expect(issuesOf(source)[0]).toMatchObject({ trait: 'demo', prop: 'a' });
    });

    it('rejects a ui block that is not an object keyed by prop name', () => {
      const issues = collectUiIssues('demo', [{ name: 'a', type: 'number' }], 'not-an-object');
      expect(issues).toEqual([
        { trait: 'demo', prop: '(ui)', problem: 'ui must be an object keyed by prop name' },
      ]);
    });

    it('treats an absent ui block as no issues rather than an error', () => {
      expect(collectUiIssues('demo', [{ name: 'a', type: 'number' }], undefined)).toEqual([]);
    });

    it('carries affordances through a union-safe merge (first variant wins)', () => {
      const merged = mergeTraitSchemas([
        {
          name: 'x',
          category: 'c',
          properties: [{ name: 'a', type: 'number', label: 'A', min: 0, max: 10, step: 1 }],
        },
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'number' }, { name: 'b', type: 'boolean' }] },
      ]);
      expect(merged.properties.find((p) => p.name === 'a')).toMatchObject({
        label: 'A',
        min: 0,
        max: 10,
        step: 1,
      });
    });

    it('drops affordances when a merge demotes a property to any', () => {
      const merged = mergeTraitSchemas([
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'number', min: 0, max: 10 }] },
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'string' }] },
      ]);
      expect(merged.properties[0]).toEqual({ name: 'a', type: 'any' });
    });
  });
});
