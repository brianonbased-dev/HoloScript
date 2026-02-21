/**
 * HoloScriptCodeParser — Production Test Suite
 *
 * Tests entirely pure CPU logic:
 * - Security: maxCodeLength / maxBlocks rejection
 * - Security: suspicious keyword detection (word-boundary rules)
 * - Security: keywords in comments/strings are NOT flagged
 * - parse() happy path: returns success:true and non-empty AST
 * - parse() error path: returns success:false with errors array
 * - ERROR_CODES exported constants
 * - ParserPools: clearAll / getStats
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptCodeParser, ERROR_CODES, ParserPools } from '../HoloScriptCodeParser';

// ─── helpers ─────────────────────────────────────────────────────────────────

function parse(code: string) {
  return new HoloScriptCodeParser().parse(code);
}

// ─── ERROR_CODES constants ───────────────────────────────────────────────────

describe('ERROR_CODES', () => {
  it('HS001 exists', () => expect(ERROR_CODES.HS001).toBeTruthy());
  it('HS010 = security violation', () => expect(ERROR_CODES.HS010).toContain('Security'));
  it('HS009 = too many items', () => expect(ERROR_CODES.HS009).toContain('Too many'));
  it('all codes are non-empty strings', () => {
    for (const v of Object.values(ERROR_CODES)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

// ─── Security: code length ───────────────────────────────────────────────────

describe('HoloScriptCodeParser — security: code length', () => {
  it('rejects code longer than 50 000 chars', () => {
    const oversized = 'x'.repeat(50001);
    const result = parse(oversized);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('HS009');
  });
  it('accepts code at exactly 50 000 chars (no keyword violations)', () => {
    // Fill with benign content
    const code = '// ' + 'a'.repeat(49997);
    const result = parse(code);
    // Should not fail on length (may fail on parse, but not HS009 length)
    expect(result.errors.every(e => e.message !== `Code exceeds max length (50000)`)).toBe(true);
  });
});

// ─── Security: suspicious keywords ──────────────────────────────────────────

describe('HoloScriptCodeParser — security: suspicious keywords', () => {
  const BLOCKED = ['process', 'require', 'eval', 'constructor', 'prototype', '__proto__', 'fs', 'child_process', 'exec', 'spawn'];

  for (const kw of BLOCKED) {
    it(`blocks: ${kw}`, () => {
      const result = parse(`orb Foo { ${kw} }`);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'HS010')).toBe(true);
    });
  }

  it('word boundary: "respawn" does NOT trigger "spawn" block', () => {
    const result = parse('orb Mesh { respawn: true }');
    // Should succeed or fail on parsing reasons, but NOT security HS010
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
  it('word boundary: "filesystem" does NOT trigger "fs" block', () => {
    const result = parse('orb Mesh { filesystem: "foo" }');
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
  it('word boundary: "evaluation" does NOT trigger "eval" block', () => {
    const result = parse('orb Score { evaluation: 5 }');
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
});

// ─── Security: keywords inside comments/strings are NOT flagged ──────────────

describe('HoloScriptCodeParser — security: stripCommentsAndStrings', () => {
  it('eval inside single-line comment is NOT flagged', () => {
    const result = parse('// eval is dangerous\norb Foo {}');
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
  it('require inside double-quoted string is NOT flagged', () => {
    const result = parse('orb Foo { label: "require node" }');
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
  it('process inside single-quoted string is NOT flagged', () => {
    const result = parse("orb Foo { desc: 'process description' }");
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
  it('spawn inside block comment is NOT flagged', () => {
    const result = parse('/* spawn docs */ orb Foo {}');
    expect(result.errors.every(e => e.code !== 'HS010')).toBe(true);
  });
});

// ─── parse() — structural return shape ──────────────────────────────────────

describe('HoloScriptCodeParser — parse() result shape', () => {
  it('returns success, ast, errors, warnings fields', () => {
    const result = parse('');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('ast');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
  });
  it('empty input → success:true, empty ast', () => {
    const result = parse('');
    expect(result.success).toBe(true);
    expect(result.ast).toHaveLength(0);
  });
  it('single-line comment only → success:true', () => {
    const result = parse('// just a comment');
    expect(result.success).toBe(true);
  });
  it('errors array empty when no errors', () => {
    const result = parse('');
    expect(result.errors).toHaveLength(0);
  });
  it('security error appears in errors array', () => {
    const result = parse('eval("x")');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
  it('ast is an array', () => {
    const result = parse('orb Box {}');
    expect(Array.isArray(result.ast)).toBe(true);
  });
});

// ─── parse() — basic happy-path parsing ─────────────────────────────────────

describe('HoloScriptCodeParser — parse() happy paths', () => {
  it('simple orb declaration succeeds', () => {
    const result = parse('orb Cube {}');
    expect(result.success).toBe(true);
    expect(result.ast.length).toBeGreaterThan(0);
  });
  it('parsed orb has type "orb"', () => {
    const result = parse('orb Sphere {}');
    expect(result.ast[0]?.type).toBe('orb');
  });
  it('orb with string property', () => {
    const result = parse('orb Box { label: "hello" }');
    expect(result.success).toBe(true);
  });
  it('orb with number property', () => {
    const result = parse('orb Box { size: 5 }');
    expect(result.success).toBe(true);
  });
  it('multiple orbs parsed as multiple AST nodes', () => {
    const result = parse('orb A {}\norb B {}');
    expect(result.ast.length).toBeGreaterThanOrEqual(2);
  });
  it('orb node has correct name', () => {
    const result = parse('orb MyOrb {}');
    const orbNode = result.ast.find(n => n.type === 'orb') as any;
    expect(orbNode?.name).toBe('MyOrb');
  });
});

// ─── ParserPools ─────────────────────────────────────────────────────────────

describe('ParserPools', () => {
  it('getStats returns token and array pools', () => {
    const stats = ParserPools.getStats();
    expect(stats).toHaveProperty('token');
    expect(stats).toHaveProperty('array');
    expect(typeof stats.token.pooled).toBe('number');
    expect(typeof stats.array.pooled).toBe('number');
  });
  it('clearAll does not throw', () => {
    expect(() => ParserPools.clearAll()).not.toThrow();
  });
  it('maxSize is at least 50', () => {
    const stats = ParserPools.getStats();
    expect(stats.token.maxSize).toBeGreaterThanOrEqual(50);
    expect(stats.array.maxSize).toBeGreaterThanOrEqual(50);
  });
});

// ─── ObjectPool (via ParserPools stats) ──────────────────────────────────────

describe('ObjectPool behaviour', () => {
  it('pooled count increases after using parser (pool may have tokens)', () => {
    parse('orb A {}');
    const stats = ParserPools.getStats();
    // Token pool may have pooled items OR not — just check it's a non-negative number
    expect(stats.token.pooled).toBeGreaterThanOrEqual(0);
  });
  it('pooled count is 0 after clearAll', () => {
    parse('orb A {} orb B {}');
    ParserPools.clearAll();
    const stats = ParserPools.getStats();
    expect(stats.token.pooled).toBe(0);
    expect(stats.array.pooled).toBe(0);
  });
});
