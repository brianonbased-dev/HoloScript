/**
 * HoloScriptSpreadValidator — Production Test Suite
 *
 * Covers: SpreadOperatorValidator (array/object/trait spread validation),
 * hasSpreads, extractSpreads, validateAllSpreads, getSpreadErrorMessage.
 */
import { describe, it, expect } from 'vitest';
import {
  SpreadOperatorValidator,
  hasSpreads,
  extractSpreads,
  validateAllSpreads,
  getSpreadErrorMessage,
} from '../HoloScriptSpreadValidator';
import type { SpreadExpression, ASTNode } from '../types';

function makeContext(
  templates: Record<string, unknown> = {},
  symbols: Record<string, { __type?: string }> = {}
) {
  return {
    templateRefs: new Map(Object.entries(templates)),
    symbolTable: new Map(Object.entries(symbols)),
    errors: [] as Array<{ message: string; node: ASTNode; line: number; column: number }>,
  };
}

function makeSpread(argument: unknown, line = 1): SpreadExpression {
  return {
    type: 'spread',
    argument,
    line,
    column: 0,
  } as SpreadExpression;
}

describe('SpreadOperatorValidator — Production', () => {
  // ─── hasSpreads ───────────────────────────────────────────────────
  it('hasSpreads detects spread in node', () => {
    expect(hasSpreads({ type: 'spread', argument: 'x' })).toBe(true);
  });

  it('hasSpreads returns false for non-spread', () => {
    expect(hasSpreads({ type: 'literal', value: 42 })).toBe(false);
  });

  it('hasSpreads returns false for null', () => {
    expect(hasSpreads(null)).toBe(false);
  });

  it('hasSpreads returns false for primitives', () => {
    expect(hasSpreads(42)).toBe(false);
    expect(hasSpreads('hello')).toBe(false);
  });

  // ─── extractSpreads ───────────────────────────────────────────────
  it('extractSpreads finds spread nodes', () => {
    const node = {
      type: 'array',
      elements: [
        { type: 'spread', argument: 'items', line: 1, column: 0 },
        { type: 'literal', value: 1 },
      ],
    };
    const spreads = extractSpreads(node);
    expect(spreads.length).toBeGreaterThanOrEqual(1);
  });

  it('extractSpreads returns empty for no spreads', () => {
    const node = { type: 'literal', value: 42 };
    expect(extractSpreads(node).length).toBe(0);
  });

  // ─── SpreadOperatorValidator ──────────────────────────────────────
  describe('SpreadOperatorValidator instance', () => {
    it('validateArraySpread with direct array literal succeeds', () => {
      const ctx = makeContext();
      const validator = new SpreadOperatorValidator(ctx);
      // Pass an actual array as spread argument - resolveSpreadTarget returns 'array'
      const spread = makeSpread([1, 2, 3]);
      const result = validator.validateArraySpread(spread, 0);
      expect(result).toBe(true);
    });

    it('validateArraySpread with unknown identifier is permissive', () => {
      const ctx = makeContext();
      const validator = new SpreadOperatorValidator(ctx);
      const spread = makeSpread('unknownVar');
      // Unknown identifiers resolve to 'unknown', which is allowed
      const result = validator.validateArraySpread(spread, 0);
      expect(result).toBe(true);
    });

    it('validateObjectSpread with direct object literal succeeds', () => {
      const ctx = makeContext();
      const validator = new SpreadOperatorValidator(ctx);
      const spread = makeSpread({ key: 'value' });
      const result = validator.validateObjectSpread(spread, 'key');
      expect(result).toBe(true);
    });

    it('validateObjectSpread with template ref succeeds', () => {
      const ctx = makeContext({ BaseTemplate: { health: 100 } });
      const validator = new SpreadOperatorValidator(ctx);
      // String identifier resolved as template since it's in templateRefs
      const spread = makeSpread('BaseTemplate');
      const result = validator.validateObjectSpread(spread, 'key');
      // 'template' is allowed in object context
      expect(result).toBe(true);
    });

    it('validateTraitSpread with template ref via __ref rejects template type', () => {
      const ctx = makeContext({ BaseTemplate: {} });
      const validator = new SpreadOperatorValidator(ctx);
      // __ref resolves via resolveMemberExpression -> resolveIdentifier -> 'template'
      // But trait spread only accepts 'object' or 'unknown', so template is rejected
      const spread = makeSpread({ __ref: 'BaseTemplate' });
      const result = validator.validateTraitSpread(spread, 'health');
      expect(result).toBe(false);
      expect(ctx.errors.length).toBeGreaterThan(0);
    });

    it('validateArraySpread with object literal fails', () => {
      const ctx = makeContext();
      const validator = new SpreadOperatorValidator(ctx);
      // Objects can't be spread into arrays
      const spread = makeSpread({ a: 1, b: 2 });
      const result = validator.validateArraySpread(spread, 0);
      expect(result).toBe(false);
      expect(ctx.errors.length).toBeGreaterThan(0);
    });

    it('error method records error in context', () => {
      const ctx = makeContext();
      const validator = new SpreadOperatorValidator(ctx);
      const node = { type: 'spread', line: 5, column: 2 } as ASTNode;
      validator.error('test error', node);
      expect(ctx.errors.length).toBe(1);
      expect(ctx.errors[0].message).toBe('test error');
      expect(ctx.errors[0].line).toBe(5);
    });
  });

  // ─── getSpreadErrorMessage ─────────────────────────────────────────
  it('getSpreadErrorMessage returns helpful message for array context', () => {
    const spread = makeSpread('someVar');
    const msg = getSpreadErrorMessage(spread, 'object', 'array');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('getSpreadErrorMessage for null target type', () => {
    const spread = makeSpread('x');
    const msg = getSpreadErrorMessage(spread, null, 'object');
    expect(typeof msg).toBe('string');
  });

  it('getSpreadErrorMessage for trait context', () => {
    const spread = makeSpread('x');
    const msg = getSpreadErrorMessage(spread, 'array', 'trait');
    expect(typeof msg).toBe('string');
  });

  // ─── validateAllSpreads ───────────────────────────────────────────
  it('validateAllSpreads with no spreads returns true', () => {
    const ctx = makeContext();
    const result = validateAllSpreads({ type: 'literal', value: 42 }, ctx);
    expect(result).toBe(true);
  });
});
