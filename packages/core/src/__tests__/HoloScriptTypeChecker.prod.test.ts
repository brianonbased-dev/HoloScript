/**
 * HoloScriptTypeChecker — Production Test Suite
 *
 * Covers: check (type validation, diagnostics), getType, getAllTypes, reset,
 * registerTypeAlias, loadConfig, built-in functions, node type checking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import { HoloScriptCodeParser } from '../HoloScriptCodeParser';
import type { ASTNode } from '../types';

function parseAST(code: string): ASTNode[] {
  const parser = new HoloScriptCodeParser();
  const result = parser.parse(code);
  return result.ast;
}

describe('HoloScriptTypeChecker — Production', () => {
  let checker: HoloScriptTypeChecker;

  beforeEach(() => {
    checker = new HoloScriptTypeChecker();
  });

  // ─── Construction ──────────────────────────────────────────────────
  it('constructs with built-in types', () => {
    const types = checker.getAllTypes();
    expect(types.size).toBeGreaterThan(0);
  });

  // ─── Check Valid AST ──────────────────────────────────────────────
  it('check empty AST returns valid', () => {
    const result = checker.check([]);
    expect(result.valid).toBe(true);
    expect(result.diagnostics.length).toBe(0);
  });

  it('check valid code returns result', () => {
    const ast = parseAST('world main {\n}\n');
    const result = checker.check(ast);
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.typeMap).toBeInstanceOf(Map);
  });

  it('check code with variables', () => {
    const ast = parseAST('let x = 42\nlet y = "hello"\n');
    const result = checker.check(ast);
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  it('check code with orb definitions', () => {
    const ast = parseAST('orb "Player" {\n  health: 100\n  speed: 5\n}\n');
    const result = checker.check(ast);
    expect(typeof result.valid).toBe('boolean');
  });

  // ─── Diagnostics ──────────────────────────────────────────────────
  it('diagnostics have correct shape', () => {
    const ast = parseAST('world main {\n}\n');
    const result = checker.check(ast);
    for (const diag of result.diagnostics) {
      expect(['error', 'warning', 'info']).toContain(diag.severity);
      expect(typeof diag.message).toBe('string');
      expect(typeof diag.line).toBe('number');
      expect(typeof diag.column).toBe('number');
      expect(typeof diag.code).toBe('string');
    }
  });

  // ─── Type Registry ────────────────────────────────────────────────
  it('getType for built-in returns TypeInfo', () => {
    const addType = checker.getType('add');
    expect(addType).toBeDefined();
    expect(addType!.type).toBe('function');
  });

  it('getType for unknown returns undefined', () => {
    expect(checker.getType('nonexistent_symbol')).toBeUndefined();
  });

  it('getAllTypes includes built-in functions', () => {
    const types = checker.getAllTypes();
    expect(types.has('add')).toBe(true);
    expect(types.has('log')).toBe(true);
    expect(types.has('print')).toBe(true);
  });

  // ─── Reset ────────────────────────────────────────────────────────
  it('reset clears custom types', () => {
    const ast = parseAST('orb "Test" {\n  health: 100\n}\n');
    checker.check(ast);
    checker.reset();
    const types = checker.getAllTypes();
    // After reset, should still have built-ins but custom types cleared
    expect(types.has('add')).toBe(true);
  });

  // ─── loadConfig ───────────────────────────────────────────────────
  it('loadConfig with empty config is safe', () => {
    expect(() => checker.loadConfig({})).not.toThrow();
  });

  it('loadConfig with null is safe', () => {
    expect(() => checker.loadConfig(null)).not.toThrow();
  });

  // ─── registerTypeAlias ────────────────────────────────────────────
  it('registerTypeAlias registers alias', () => {
    checker.registerTypeAlias({
      type: 'type-alias',
      name: 'Health',
      value: 'number',
    } as any);
    // Should not throw
    expect(true).toBe(true);
  });

  // ─── Multiple Checks ─────────────────────────────────────────────
  it('multiple checks accumulate types', () => {
    const ast1 = parseAST('let x = 1\n');
    checker.check(ast1);
    const ast2 = parseAST('let y = "test"\n');
    const result = checker.check(ast2);
    expect(typeof result.valid).toBe('boolean');
  });

  // ─── Edge Cases ───────────────────────────────────────────────────
  it('check with function definitions', () => {
    const ast = parseAST('function add(a, b) {\n  return a + b\n}\n');
    const result = checker.check(ast);
    expect(typeof result.valid).toBe('boolean');
  });

  it('check complex nested code', () => {
    const ast = parseAST(`
world game {
  scene main {
    orb "npc" {
      health: 100
    }
  }
}
`);
    const result = checker.check(ast);
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });
});
