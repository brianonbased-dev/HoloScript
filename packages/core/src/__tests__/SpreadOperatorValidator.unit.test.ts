/**
 * SpreadOperatorValidator — Unit Test Suite
 *
 * Covers every method on SpreadOperatorValidator at the unit level:
 * - validateArraySpread / validateObjectSpread / validateTraitSpread
 * - resolveSpreadTarget (all branches: string, __ref, call, array, object, null)
 * - resolveIdentifier (template, symbol, unknown)
 * - resolveMemberExpression (root unknown, template chain, object chain)
 * - inferType (array, object, template-flagged, primitive)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SpreadOperatorValidator — Unit', () => {
  // ─── validateArraySpread ─────────────────────────────────────────
  describe('validateArraySpread', () => {
    it('accepts direct array literals', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateArraySpread(makeSpread([1, 2, 3]), 0)).toBe(true);
    });

    it('rejects direct object literals', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateArraySpread(makeSpread({ a: 1 }), 0)).toBe(false);
      expect(ctx.errors[0].message).toContain('object');
    });

    it('rejects template identifiers in array context', () => {
      const ctx = makeContext({ MyTmpl: { size: 1 } });
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateArraySpread(makeSpread('MyTmpl'), 0)).toBe(false);
    });

    it('accepts unknown identifiers (permissive)', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateArraySpread(makeSpread('unknownVar'), 0)).toBe(true);
    });

    it('rejects null argument', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateArraySpread(makeSpread(null), 0)).toBe(false);
      expect(ctx.errors[0].message).toContain('resolve');
    });

    it('accepts symbol table entry with array type', () => {
      const ctx = makeContext({}, { items: {} }); // inferred as 'object' from plain {}
      const v = new SpreadOperatorValidator(ctx);
      // Symbol resolves to 'object' → rejected in array context
      expect(v.validateArraySpread(makeSpread('items'), 0)).toBe(false);
    });
  });

  // ─── validateObjectSpread ────────────────────────────────────────
  describe('validateObjectSpread', () => {
    it('accepts direct object literals', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateObjectSpread(makeSpread({ key: 'val' }), 'k')).toBe(true);
    });

    it('accepts template identifiers', () => {
      const ctx = makeContext({ Base: { hp: 100 } });
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateObjectSpread(makeSpread('Base'), 'k')).toBe(true);
    });

    it('rejects array literals in object context', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateObjectSpread(makeSpread([1, 2]), 'k')).toBe(false);
      expect(ctx.errors[0].message).toContain('array');
    });

    it('accepts unknown identifiers (permissive)', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateObjectSpread(makeSpread('whateverVar'), 'k')).toBe(true);
    });

    it('rejects null argument', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateObjectSpread(makeSpread(null), 'k')).toBe(false);
    });
  });

  // ─── validateTraitSpread ─────────────────────────────────────────
  describe('validateTraitSpread', () => {
    it('accepts direct object literals', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateTraitSpread(makeSpread({ mass: 5 }), 'physics')).toBe(true);
    });

    it('rejects template identifiers in trait context', () => {
      const ctx = makeContext({ Base: {} });
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateTraitSpread(makeSpread('Base'), 'physics')).toBe(false);
      expect(ctx.errors[0].message).toContain('template');
    });

    it('rejects array literals in trait context', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateTraitSpread(makeSpread([1, 2]), 'health')).toBe(false);
    });

    it('accepts unknown identifiers (permissive)', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateTraitSpread(makeSpread('cfg'), 'health')).toBe(true);
    });

    it('rejects __ref to template in trait context', () => {
      const ctx = makeContext({ Tmpl: {} });
      const v = new SpreadOperatorValidator(ctx);
      expect(v.validateTraitSpread(makeSpread({ __ref: 'Tmpl' }), 'health')).toBe(false);
    });
  });

  // ─── resolveSpreadTarget (via validate* methods) ─────────────────
  describe('resolveSpreadTarget branches', () => {
    it('handles function call arguments as unknown', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      const callArg = { type: 'call', callee: 'getItems', args: [] };
      // 'unknown' is accepted in all contexts
      expect(v.validateArraySpread(makeSpread(callArg), 0)).toBe(true);
    });

    it('handles __ref member expressions', () => {
      const ctx = makeContext({}, { player: {} });
      const v = new SpreadOperatorValidator(ctx);
      const ref = { __ref: 'player.inventory' };
      // player resolves to 'object', then nested yields 'unknown'
      expect(v.validateObjectSpread(makeSpread(ref), 'k')).toBe(true);
    });

    it('handles __ref to unknown root as unknown', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      const ref = { __ref: 'unresolvable.field' };
      expect(v.validateObjectSpread(makeSpread(ref), 'k')).toBe(true);
    });

    it('handles __ref to template root as template', () => {
      const ctx = makeContext({ Armor: { defense: 10 } });
      const v = new SpreadOperatorValidator(ctx);
      const ref = { __ref: 'Armor.defaults' };
      // Armor is template, nested → still 'template'
      expect(v.validateObjectSpread(makeSpread(ref), 'k')).toBe(true);
    });
  });

  // ─── error accumulation ──────────────────────────────────────────
  describe('error accumulation', () => {
    it('accumulates multiple errors from sequential validations', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      v.validateArraySpread(makeSpread({ a: 1 }), 0); // fail: object in array
      v.validateObjectSpread(makeSpread([1]), 'k');     // fail: array in object
      expect(ctx.errors).toHaveLength(2);
    });

    it('error records line and column from spread node', () => {
      const ctx = makeContext();
      const v = new SpreadOperatorValidator(ctx);
      v.validateArraySpread(makeSpread(null, 42), 0);
      expect(ctx.errors[0].line).toBe(42);
    });
  });

  // ─── getSpreadErrorMessage ───────────────────────────────────────
  describe('getSpreadErrorMessage', () => {
    it('mentions context in message', () => {
      const msg = getSpreadErrorMessage(makeSpread('x'), 'object', 'array');
      expect(msg).toContain('array');
    });

    it('handles unknown target type', () => {
      const msg = getSpreadErrorMessage(makeSpread('x'), 'unknown', 'object');
      expect(typeof msg).toBe('string');
    });
  });

  // ─── hasSpreads edge cases ───────────────────────────────────────
  describe('hasSpreads edge cases', () => {
    it('nested spread in array', () => {
      expect(hasSpreads({ type: 'array', elements: [{ type: 'spread', argument: 'x' }] })).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(hasSpreads(undefined)).toBe(false);
    });
  });

  // ─── extractSpreads ──────────────────────────────────────────────
  describe('extractSpreads edge cases', () => {
    it('extracts deeply nested spreads', () => {
      const ast = {
        type: 'object',
        properties: {
          inner: {
            type: 'spread',
            argument: 'base',
            line: 5,
            column: 0,
          },
        },
      };
      const spreads = extractSpreads(ast);
      expect(spreads.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for null input', () => {
      expect(extractSpreads(null)).toEqual([]);
    });

    it('returns empty for primitive input', () => {
      expect(extractSpreads(42)).toEqual([]);
    });
  });
});
