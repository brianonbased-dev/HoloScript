/**
 * Exhaustive Match Checking Tests
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import { TypeAliasRegistry } from '../types/TypeAliasRegistry';

describe('Exhaustive Match Checking', () => {
  let checker: HoloScriptTypeChecker;

  beforeEach(() => {
    checker = new HoloScriptTypeChecker();
  });

  describe('string literal union exhaustiveness', () => {
    test('complete match - no errors', () => {
      checker.typeAliasRegistry.register(
        TypeAliasRegistry.parse('type State = "idle" | "loading" | "success" | "error"')!
      );
      const errors = checker.checkExhaustiveMatch({
        typeName: 'State',
        coveredPatterns: ['idle', 'loading', 'success', 'error'],
      });
      expect(errors).toHaveLength(0);
    });

    test('missing one case - reports error', () => {
      checker.typeAliasRegistry.register(
        TypeAliasRegistry.parse('type State = "idle" | "loading" | "success" | "error"')!
      );
      const errors = checker.checkExhaustiveMatch({
        typeName: 'State',
        coveredPatterns: ['idle', 'loading', 'success'],
        line: 10,
        column: 5,
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('HSP021');
      expect(errors[0].message).toContain('"error"');
      expect(errors[0].severity).toBe('error');
      expect(errors[0].line).toBe(10);
    });

    test('missing multiple cases - all listed in message', () => {
      checker.typeAliasRegistry.register(
        TypeAliasRegistry.parse('type Status = "active" | "inactive" | "pending" | "archived"')!
      );
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Status',
        coveredPatterns: ['active'],
      });
      expect(errors[0].message).toContain('"inactive"');
      expect(errors[0].message).toContain('"pending"');
      expect(errors[0].message).toContain('"archived"');
    });

    test('empty match - reports all cases missing', () => {
      checker.typeAliasRegistry.register(
        TypeAliasRegistry.parse('type Color = "red" | "green" | "blue"')!
      );
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Color',
        coveredPatterns: [],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('"red"');
      expect(errors[0].message).toContain('"green"');
      expect(errors[0].message).toContain('"blue"');
    });
  });

  describe('number literal union exhaustiveness', () => {
    test('complete number union match', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Priority = 1 | 2 | 3')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Priority',
        coveredPatterns: ['1', '2', '3'],
      });
      expect(errors).toHaveLength(0);
    });

    test('incomplete number union match', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Priority = 1 | 2 | 3')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Priority',
        coveredPatterns: ['1', '2'],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('"3"');
    });

    test('float number literals in union', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Scale = 0.5 | 1.0 | 2.0')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Scale',
        coveredPatterns: ['0.5', '1.0', '2.0'],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('wildcard _ catch-all', () => {
    test('_ pattern makes match exhaustive', () => {
      checker.typeAliasRegistry.register(
        TypeAliasRegistry.parse('type State = "idle" | "loading" | "error"')!
      );
      const errors = checker.checkExhaustiveMatch({
        typeName: 'State',
        coveredPatterns: ['idle', '_'],
      });
      expect(errors).toHaveLength(0);
    });

    test('_ alone covers all cases', () => {
      checker.typeAliasRegistry.register(
        TypeAliasRegistry.parse('type Color = "red" | "green" | "blue"')!
      );
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Color',
        coveredPatterns: ['_'],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('quick-fix suggestions', () => {
    test('suggestions list all missing cases', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type State = "a" | "b" | "c"')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'State',
        coveredPatterns: ['a'],
      });
      expect(errors[0].suggestions).toBeDefined();
      expect(errors[0].suggestions!.length).toBe(2);
      expect(errors[0].suggestions!.some((s) => s.includes('b'))).toBe(true);
      expect(errors[0].suggestions!.some((s) => s.includes('c'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('unknown type name returns no errors', () => {
      const errors = checker.checkExhaustiveMatch({
        typeName: 'NonExistentType',
        coveredPatterns: [],
      });
      expect(errors).toHaveLength(0);
    });

    test('non-union type (simple alias) returns no errors', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Name = string')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Name',
        coveredPatterns: [],
      });
      expect(errors).toHaveLength(0);
    });

    test('generic type is not checked (no members)', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Optional<T> = T | null')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Optional',
        coveredPatterns: [],
      });
      expect(errors).toHaveLength(0);
    });

    test('mixed string and type identifier union - only extracts literals', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Result = "ok" | Error')!);
      const errors = checker.checkExhaustiveMatch({
        typeName: 'Result',
        coveredPatterns: ['ok'],
      });
      expect(errors).toHaveLength(0);
    });

    test('nested match - reports per-level (each call independent)', () => {
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Outer = "x" | "y"')!);
      checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Inner = "a" | "b"')!);
      const outerErrors = checker.checkExhaustiveMatch({
        typeName: 'Outer',
        coveredPatterns: ['x'],
      });
      const innerErrors = checker.checkExhaustiveMatch({
        typeName: 'Inner',
        coveredPatterns: ['a', 'b'],
      });
      expect(outerErrors).toHaveLength(1);
      expect(innerErrors).toHaveLength(0);
    });
  });

  describe('TypeAliasRegistry.parse integration', () => {
    test('two-member union fully covered', () => {
      const decl = TypeAliasRegistry.parse('type Toggle = "on" | "off"')!;
      checker.typeAliasRegistry.register(decl);

      expect(
        checker.checkExhaustiveMatch({
          typeName: 'Toggle',
          coveredPatterns: ['on', 'off'],
        })
      ).toHaveLength(0);
    });

    test('two-member union partially covered', () => {
      const decl = TypeAliasRegistry.parse('type Toggle = "on" | "off"')!;
      checker.typeAliasRegistry.register(decl);

      const errors = checker.checkExhaustiveMatch({
        typeName: 'Toggle',
        coveredPatterns: ['on'],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('"off"');
    });
  });
});
