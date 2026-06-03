/**
 * useHoloComposition — computed-value evaluation regression coverage.
 *
 * Two silent bugs let every computed boolean collapse to falsy, which kept the
 * native /projects body's loading/empty/list states permanently hidden (board
 * c-clgo). Both are guarded here:
 *
 *   1. extractComputedDefs dropped non-string expressions — but the modern
 *      HoloScriptPlus parser emits computed expressions as AST objects, so all
 *      of them were discarded.
 *   2. evaluateASTNode used `if (!node)` to mean "no node", which turned the
 *      valid falsy literals `false` / `0` / `""` into undefined — collapsing
 *      `$loading == false` and `$count > 0` to false.
 */
import { describe, it, expect } from 'vitest';
import { extractComputedDefs, evaluateComputedValues } from '../useHoloComposition';
import type { HSPlusNode } from '@holoscript/core';

// AST node shapes as produced by HoloScriptPlusParser for computed expressions.
const ref = (name: string) => ({ __ref: `$${name}` });
const bin = (operator: string, left: unknown, right: unknown) => ({
  type: 'binary',
  operator,
  left,
  right,
});

describe('extractComputedDefs — accepts AST-object expressions (bug 1)', () => {
  it('keeps computed expressions emitted as objects, not just strings', () => {
    const children = [
      {
        type: 'computed',
        properties: {
          isEmpty: bin('==', ref('count'), 0),
          label: 'legacy string expr',
        },
      },
    ] as unknown as HSPlusNode[];
    const defs = extractComputedDefs(children);
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['isEmpty', 'label']);
  });
});

describe('evaluateComputedValues — falsy literals (bug 2)', () => {
  it('$x == false is true when x is false', () => {
    const defs = [{ name: 'isLoaded', expression: bin('==', ref('loading'), false) }];
    expect(evaluateComputedValues(defs, { loading: false }).isLoaded).toBe(true);
    expect(evaluateComputedValues(defs, { loading: true }).isLoaded).toBe(false);
  });

  it('$x == 0 is true when x is 0', () => {
    const defs = [{ name: 'isEmpty', expression: bin('==', ref('count'), 0) }];
    expect(evaluateComputedValues(defs, { count: 0 }).isEmpty).toBe(true);
    expect(evaluateComputedValues(defs, { count: 3 }).isEmpty).toBe(false);
  });

  it('$x > 0 is true when x is positive', () => {
    const defs = [{ name: 'hasItems', expression: bin('>', ref('count'), 0) }];
    expect(evaluateComputedValues(defs, { count: 2 }).hasItems).toBe(true);
    expect(evaluateComputedValues(defs, { count: 0 }).hasItems).toBe(false);
  });

  it('compound `$loading == false && $count > 0` gates the list correctly', () => {
    const defs = [
      {
        name: 'showList',
        expression: bin('&&', bin('==', ref('loading'), false), bin('>', ref('count'), 0)),
      },
    ];
    expect(evaluateComputedValues(defs, { loading: false, count: 2 }).showList).toBe(true);
    expect(evaluateComputedValues(defs, { loading: false, count: 0 }).showList).toBe(false);
    expect(evaluateComputedValues(defs, { loading: true, count: 2 }).showList).toBe(false);
  });
});
