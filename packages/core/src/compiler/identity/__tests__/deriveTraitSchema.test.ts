import { describe, expect, it } from 'vitest';
import {
  deriveTraitSchemaFromHolo,
  mapPropType,
  parseEnumMembers,
  categorizeTraitConflict,
  isUnionSafeConflict,
  mergeTraitSchemas,
} from '../deriveTraitSchema';
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
      expect(byName.enabled).toEqual({ name: 'enabled', type: 'boolean' });
      expect(byName.alpha).toEqual({ name: 'alpha', type: 'number' });
      expect(byName.default_strategy).toEqual({
        name: 'default_strategy',
        type: 'enum',
        enumValues: ['equal', 'weighted', 'multi_armed_bandit'],
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
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'number' }, { name: 'b', type: 'boolean' }] },
        { name: 'x', category: 'c', properties: [{ name: 'a', type: 'number' }] },
      ]);
      expect(merged.properties.map((p) => p.name).sort()).toEqual(['a', 'b']);
    });
  });
});
