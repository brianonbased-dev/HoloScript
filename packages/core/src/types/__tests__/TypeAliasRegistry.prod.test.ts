/**
 * TypeAliasRegistry Production Tests
 *
 * Register, parse, resolve (simple/union/generic), recursive detection, expand.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeAliasRegistry } from '../TypeAliasRegistry';

describe('TypeAliasRegistry — Production', () => {
  let reg: TypeAliasRegistry;

  beforeEach(() => {
    reg = new TypeAliasRegistry();
  });

  describe('register / has / get / all / clear', () => {
    it('register and has', () => {
      reg.register({ name: 'Color', kind: 'simple', definition: 'string', typeParams: [] });
      expect(reg.has('Color')).toBe(true);
    });

    it('get returns decl', () => {
      reg.register({ name: 'Color', kind: 'simple', definition: 'string', typeParams: [] });
      expect(reg.get('Color')?.definition).toBe('string');
    });

    it('all returns array', () => {
      reg.register({ name: 'A', kind: 'simple', definition: 'number', typeParams: [] });
      reg.register({ name: 'B', kind: 'simple', definition: 'string', typeParams: [] });
      expect(reg.all()).toHaveLength(2);
    });

    it('clear', () => {
      reg.register({ name: 'A', kind: 'simple', definition: 'number', typeParams: [] });
      reg.clear();
      expect(reg.has('A')).toBe(false);
    });
  });

  describe('parse', () => {
    it('simple alias', () => {
      const decl = TypeAliasRegistry.parse('type Color = string');
      expect(decl?.name).toBe('Color');
      expect(decl?.kind).toBe('simple');
      expect(decl?.definition).toBe('string');
    });

    it('union alias', () => {
      const decl = TypeAliasRegistry.parse('type State = "idle" | "loading" | "error"');
      expect(decl?.kind).toBe('union');
    });

    it('generic alias', () => {
      const decl = TypeAliasRegistry.parse('type Optional<T> = T | null');
      expect(decl?.kind).toBe('generic');
      expect(decl?.typeParams).toEqual(['T']);
    });

    it('returns null for non-type', () => {
      expect(TypeAliasRegistry.parse('const x = 5')).toBeNull();
    });
  });

  describe('resolve', () => {
    it('resolves simple', () => {
      reg.register({ name: 'Color', kind: 'simple', definition: 'string', typeParams: [] });
      expect(reg.resolve('Color')).toBe('string');
    });

    it('resolves generic with substitution', () => {
      reg.register({ name: 'Optional', kind: 'generic', definition: 'T | null', typeParams: ['T'] });
      expect(reg.resolve('Optional', ['string'])).toBe('string | null');
    });

    it('returns null for unknown', () => {
      expect(reg.resolve('Unknown')).toBeNull();
    });

    it('returns null for recursive', () => {
      reg.register({ name: 'Loop', kind: 'simple', definition: 'Loop[]', typeParams: [] });
      expect(reg.resolve('Loop')).toBeNull();
    });

    it('expands nested aliases', () => {
      reg.register({ name: 'Pos', kind: 'simple', definition: '[number, number]', typeParams: [] });
      reg.register({ name: 'Line', kind: 'simple', definition: '[Pos, Pos]', typeParams: [] });
      const resolved = reg.resolve('Line');
      expect(resolved).toContain('number');
    });
  });

  describe('isRecursive', () => {
    it('detects self-reference', () => {
      reg.register({ name: 'Tree', kind: 'simple', definition: 'Tree | null', typeParams: [] });
      expect(reg.isRecursive('Tree')).toBe(true);
    });

    it('non-recursive', () => {
      reg.register({ name: 'Color', kind: 'simple', definition: 'string', typeParams: [] });
      expect(reg.isRecursive('Color')).toBe(false);
    });
  });
});
