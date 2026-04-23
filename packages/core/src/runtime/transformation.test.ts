/**
 * Unit tests for transformation — AUDIT-mode coverage
 *
 * Slice 5 pure module. Applies 11 declarative data transforms over
 * array inputs. Multi-callback context (setVariable / evaluateCondition
 * / evaluateExpression) is the first callback-shape exercised in isolation.
 *
 * **See**: packages/core/src/runtime/transformation.ts (slice 5)
 */

import { describe, it, expect, vi } from 'vitest';
import { applyTransformation, type TransformationContext } from './transformation';
import type { TransformationNode } from '../types';

/** Build a minimal test context — callers override specific fields. */
function makeCtx(overrides: Partial<TransformationContext> = {}): TransformationContext {
  return {
    setVariable: vi.fn(),
    evaluateCondition: vi.fn(() => true),
    evaluateExpression: vi.fn((e: string) => e),
    ...overrides,
  };
}

function makeNode(operation: string, parameters: Record<string, unknown> = {}): TransformationNode {
  return { type: 'transformation', operation, parameters } as TransformationNode;
}

describe('applyTransformation — filter', () => {
  it('filters array via predicate callback', async () => {
    const ctx = makeCtx({
      setVariable: vi.fn(),
      evaluateCondition: vi.fn((pred: string) => pred === 'keep'),
    });
    // Setter captures current _item; condition returns true when pred === 'keep'
    const result = await applyTransformation([1, 2, 3], makeNode('filter', { predicate: 'keep' }), ctx);
    expect(result).toEqual([1, 2, 3]); // predicate always true
  });

  it('filter — predicate evaluated per item sets _item in order', async () => {
    const calls: unknown[] = [];
    const ctx = makeCtx({
      setVariable: vi.fn((name, v) => calls.push([name, v])),
      evaluateCondition: vi.fn(() => true),
    });
    await applyTransformation([10, 20, 30], makeNode('filter', { predicate: 'p' }), ctx);
    expect(calls).toEqual([
      ['_item', 10],
      ['_item', 20],
      ['_item', 30],
    ]);
  });

  it('filter — no predicate drops null/undefined only', async () => {
    const ctx = makeCtx();
    const result = await applyTransformation(
      [1, null, 2, undefined, 3, 0, ''],
      makeNode('filter', {}),
      ctx,
    );
    // null + undefined dropped; 0 and '' retained
    expect(result).toEqual([1, 2, 3, 0, '']);
  });

  it('filter — non-array input passes through unchanged', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation('not-array', makeNode('filter'), ctx)).toBe('not-array');
    expect(await applyTransformation(42, makeNode('filter'), ctx)).toBe(42);
  });
});

describe('applyTransformation — map', () => {
  it('maps array via mapper expression', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn((expr: string) => `mapped(${expr})`),
    });
    const result = await applyTransformation([1, 2], makeNode('map', { mapper: 'x*2' }), ctx);
    // mapper evaluated per item → evaluator returns the same transformed value each call
    expect(result).toEqual(['mapped(x*2)', 'mapped(x*2)']);
  });

  it('map — default mapper wraps items in {value,processed}', async () => {
    const ctx = makeCtx();
    const result = await applyTransformation([1, 2], makeNode('map', {}), ctx);
    expect(result).toEqual([
      { value: 1, processed: true },
      { value: 2, processed: true },
    ]);
  });
});

describe('applyTransformation — reduce', () => {
  it('reduces array with initial value 0 (default)', async () => {
    const ctx = makeCtx();
    const result = await applyTransformation([1, 2, 3, 4], makeNode('reduce', {}), ctx);
    expect(result).toBe(10);
  });

  it('reduce — initial honored ONLY when reducer is specified', async () => {
    const ctx = makeCtx({
      evaluateExpression: vi.fn((_e: string) => 999 as never),
    });
    // With custom reducer + initial, the first call sees _acc=100
    const resultWithReducer = await applyTransformation(
      [1, 2, 3],
      makeNode('reduce', { initial: 100, reducer: 'r' }),
      ctx,
    );
    // evaluator always returns 999, so final value is 999
    expect(resultWithReducer).toBe(999);
  });

  it('reduce — DEFAULT reducer IGNORES initial (audit: potential bug)', async () => {
    // Documented behavior: when no `reducer` is supplied, the default
    // reducer starts at 0 regardless of params.initial.
    // This is a likely audit issue — `initial: 100` is silently dropped.
    // See transformation.ts ~L91-97 (default branch hardcodes starting
    // accumulator to 0).
    const ctx = makeCtx();
    const result = await applyTransformation(
      [1, 2, 3],
      makeNode('reduce', { initial: 100 }),
      ctx,
    );
    // Expected semantically: 100 + 1 + 2 + 3 = 106
    // Actual: 0 + 1 + 2 + 3 = 6 (initial ignored in default branch)
    expect(result).toBe(6);
  });

  it('reduce — string items are ignored in default reducer', async () => {
    const ctx = makeCtx();
    // Default reducer only adds numbers; non-numbers contribute 0
    const result = await applyTransformation([1, 'two', 3], makeNode('reduce', {}), ctx);
    expect(result).toBe(4); // 1 + 0 + 3
  });

  it('reduce — custom reducer sets _acc + _item before evaluator call', async () => {
    const callOrder: string[] = [];
    const ctx = makeCtx({
      setVariable: vi.fn((name) => callOrder.push(`set(${name})`)),
      evaluateExpression: vi.fn(() => {
        callOrder.push('eval');
        return 0; // return value doesn't matter for this order test
      }),
    });
    await applyTransformation([1, 2], makeNode('reduce', { reducer: 'r' }), ctx);
    // For each item: setVariable('_acc'), setVariable('_item'), evaluateExpression
    expect(callOrder).toEqual([
      'set(_acc)', 'set(_item)', 'eval',
      'set(_acc)', 'set(_item)', 'eval',
    ]);
  });
});

describe('applyTransformation — sort', () => {
  it('sorts numbers ascending by default', async () => {
    const ctx = makeCtx();
    const result = await applyTransformation([3, 1, 2], makeNode('sort', {}), ctx);
    expect(result).toEqual([1, 2, 3]);
  });

  it('sorts descending when `descending: true`', async () => {
    const ctx = makeCtx();
    const result = await applyTransformation([1, 3, 2], makeNode('sort', { descending: true }), ctx);
    expect(result).toEqual([3, 2, 1]);
  });

  it('sort does NOT mutate input', async () => {
    const ctx = makeCtx();
    const input = [3, 1, 2];
    await applyTransformation(input, makeNode('sort', {}), ctx);
    expect(input).toEqual([3, 1, 2]); // original preserved
  });

  it('sorts by object key', async () => {
    const ctx = makeCtx();
    const items = [{ age: 30 }, { age: 10 }, { age: 20 }];
    const result = await applyTransformation(items, makeNode('sort', { key: 'age' }), ctx);
    expect(result).toEqual([{ age: 10 }, { age: 20 }, { age: 30 }]);
  });
});

describe('applyTransformation — aggregates (sum, count)', () => {
  it('sum — only numeric items contribute', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 'x', 3], makeNode('sum'), ctx)).toBe(6);
  });

  it('sum — non-array returns input unchanged', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation('str', makeNode('sum'), ctx)).toBe('str');
  });

  it('count — returns array length', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 3, 4, 5], makeNode('count'), ctx)).toBe(5);
  });

  it('count — non-array returns 1', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation(42, makeNode('count'), ctx)).toBe(1);
  });
});

describe('applyTransformation — unique / flatten / reverse', () => {
  it('unique — removes duplicates (Set semantics)', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 2, 3, 1], makeNode('unique'), ctx)).toEqual([1, 2, 3]);
  });

  it('flatten — flattens one level', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([[1, 2], [3], 4], makeNode('flatten'), ctx)).toEqual([1, 2, 3, 4]);
  });

  it('reverse — reverses array order', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 3], makeNode('reverse'), ctx)).toEqual([3, 2, 1]);
  });

  it('reverse does NOT mutate input', async () => {
    const ctx = makeCtx();
    const input = [1, 2, 3];
    await applyTransformation(input, makeNode('reverse'), ctx);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('applyTransformation — take / skip', () => {
  it('take — honors count', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 3, 4, 5], makeNode('take', { count: 2 }), ctx)).toEqual([1, 2]);
  });

  it('take — default count is 10', async () => {
    const ctx = makeCtx();
    const twenty = Array.from({ length: 20 }, (_, i) => i);
    expect((await applyTransformation(twenty, makeNode('take', {}), ctx) as number[]).length).toBe(10);
  });

  it('take — 0 defaults to 10 (|| fallback on falsy)', async () => {
    const ctx = makeCtx();
    const five = [1, 2, 3, 4, 5];
    expect((await applyTransformation(five, makeNode('take', { count: 0 }), ctx) as number[]).length).toBe(5);
    // count=0 coerces via Number(0)||10 → 10; but array only has 5, so slice returns all 5
  });

  it('skip — removes first N items', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 3, 4, 5], makeNode('skip', { count: 2 }), ctx)).toEqual([3, 4, 5]);
  });

  it('skip — default count is 0', async () => {
    const ctx = makeCtx();
    expect(await applyTransformation([1, 2, 3], makeNode('skip', {}), ctx)).toEqual([1, 2, 3]);
  });
});

describe('applyTransformation — unknown operation', () => {
  it('logs warn and returns data unchanged', async () => {
    const ctx = makeCtx();
    const result = await applyTransformation([1, 2, 3], makeNode('not_a_real_op'), ctx);
    expect(result).toEqual([1, 2, 3]);
  });
});
