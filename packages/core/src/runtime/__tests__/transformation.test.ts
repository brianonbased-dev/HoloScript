import { describe, expect, it, vi } from 'vitest';
import { applyTransformation } from '../transformation';
import type { TransformationContext } from '../transformation';

function makeCtx(overrides: Partial<TransformationContext> = {}): TransformationContext {
  return {
    setVariable: vi.fn(),
    evaluateCondition: vi.fn().mockReturnValue(true),
    evaluateExpression: vi.fn().mockImplementation((expr: string) => expr),
    ...overrides,
  };
}

describe('applyTransformation', () => {
  describe('filter', () => {
    it('passes through non-array input', async () => {
      const result = await applyTransformation('not-array', { operation: 'filter', parameters: {} }, makeCtx());
      expect(result).toBe('not-array');
    });

    it('filters with predicate: sets _item and evaluates', async () => {
      const ctx = makeCtx({
        evaluateCondition: vi.fn().mockImplementation(() => true),
      });
      const result = await applyTransformation([1, 2, 3], { operation: 'filter', parameters: { predicate: '_item > 0' } }, ctx);
      expect(ctx.setVariable).toHaveBeenCalledWith('_item', 1);
      expect(result).toEqual([1, 2, 3]);
    });

    it('filters without predicate: removes null and undefined', async () => {
      const result = await applyTransformation([1, null, 2, undefined, 3], { operation: 'filter', parameters: {} }, makeCtx());
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('map', () => {
    it('passes through non-array input', async () => {
      const result = await applyTransformation(42, { operation: 'map', parameters: {} }, makeCtx());
      expect(result).toBe(42);
    });

    it('maps with mapper: sets _item and evaluates expression', async () => {
      const ctx = makeCtx({
        evaluateExpression: vi.fn().mockReturnValue('mapped'),
      });
      const result = await applyTransformation([1, 2], { operation: 'map', parameters: { mapper: '_item * 2' } }, ctx);
      expect(ctx.setVariable).toHaveBeenCalledWith('_item', 1);
      expect(result).toEqual(['mapped', 'mapped']);
    });

    it('maps without mapper: wraps in { value, processed } envelope', async () => {
      const result = await applyTransformation([10, 20], { operation: 'map', parameters: {} }, makeCtx());
      expect(result).toEqual([{ value: 10, processed: true }, { value: 20, processed: true }]);
    });
  });

  describe('reduce', () => {
    it('passes through non-array input', async () => {
      const result = await applyTransformation('hello', { operation: 'reduce', parameters: {} }, makeCtx());
      expect(result).toBe('hello');
    });

    it('reduces with reducer: uses _acc and _item', async () => {
      let acc = 0;
      const ctx = makeCtx({
        evaluateExpression: vi.fn().mockImplementation(() => { acc += 1; return acc; }),
      });
      await applyTransformation([1, 2, 3], { operation: 'reduce', parameters: { reducer: '_acc + _item', initial: 0 } }, ctx);
      expect(ctx.setVariable).toHaveBeenCalledWith('_acc', expect.anything());
      expect(ctx.setVariable).toHaveBeenCalledWith('_item', expect.anything());
    });

    it('reduces without reducer: sums numbers', async () => {
      const result = await applyTransformation([1, 2, 3, 'x'], { operation: 'reduce', parameters: {} }, makeCtx());
      expect(result).toBe(6);
    });

    it('uses initial value of 0 by default', async () => {
      const result = await applyTransformation([], { operation: 'reduce', parameters: {} }, makeCtx());
      expect(result).toBe(0);
    });
  });

  describe('sort', () => {
    it('passes through non-array', async () => {
      const result = await applyTransformation(99, { operation: 'sort', parameters: {} }, makeCtx());
      expect(result).toBe(99);
    });

    it('sorts numbers ascending', async () => {
      const result = await applyTransformation([3, 1, 2], { operation: 'sort', parameters: {} }, makeCtx());
      expect(result).toEqual([1, 2, 3]);
    });

    it('sorts numbers descending', async () => {
      const result = await applyTransformation([3, 1, 2], { operation: 'sort', parameters: { descending: true } }, makeCtx());
      expect(result).toEqual([3, 2, 1]);
    });

    it('sorts by key', async () => {
      const data = [{ n: 3 }, { n: 1 }, { n: 2 }];
      const result = await applyTransformation(data, { operation: 'sort', parameters: { key: 'n' } }, makeCtx());
      expect(result).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it('does not mutate original array', async () => {
      const original = [3, 1, 2];
      await applyTransformation(original, { operation: 'sort', parameters: {} }, makeCtx());
      expect(original).toEqual([3, 1, 2]);
    });
  });

  describe('sum', () => {
    it('sums numeric array', async () => {
      const result = await applyTransformation([1, 2, 3], { operation: 'sum', parameters: {} }, makeCtx());
      expect(result).toBe(6);
    });

    it('ignores non-numbers', async () => {
      const result = await applyTransformation([1, 'x', 2], { operation: 'sum', parameters: {} }, makeCtx());
      expect(result).toBe(3);
    });

    it('returns non-array unchanged', async () => {
      const result = await applyTransformation(5, { operation: 'sum', parameters: {} }, makeCtx());
      expect(result).toBe(5);
    });
  });

  describe('count', () => {
    it('counts array elements', async () => {
      const result = await applyTransformation([1, 2, 3], { operation: 'count', parameters: {} }, makeCtx());
      expect(result).toBe(3);
    });

    it('returns 1 for non-array', async () => {
      const result = await applyTransformation('hello', { operation: 'count', parameters: {} }, makeCtx());
      expect(result).toBe(1);
    });
  });

  describe('unique', () => {
    it('removes duplicates', async () => {
      const result = await applyTransformation([1, 2, 1, 3, 2], { operation: 'unique', parameters: {} }, makeCtx());
      expect(result).toEqual([1, 2, 3]);
    });

    it('returns non-array unchanged', async () => {
      const result = await applyTransformation('x', { operation: 'unique', parameters: {} }, makeCtx());
      expect(result).toBe('x');
    });
  });

  describe('flatten', () => {
    it('flattens one level', async () => {
      const result = await applyTransformation([[1, 2], [3, 4]], { operation: 'flatten', parameters: {} }, makeCtx());
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('returns non-array unchanged', async () => {
      const result = await applyTransformation(42, { operation: 'flatten', parameters: {} }, makeCtx());
      expect(result).toBe(42);
    });
  });

  describe('reverse', () => {
    it('reverses array', async () => {
      const result = await applyTransformation([1, 2, 3], { operation: 'reverse', parameters: {} }, makeCtx());
      expect(result).toEqual([3, 2, 1]);
    });

    it('does not mutate original', async () => {
      const original = [1, 2, 3];
      await applyTransformation(original, { operation: 'reverse', parameters: {} }, makeCtx());
      expect(original).toEqual([1, 2, 3]);
    });

    it('returns non-array unchanged', async () => {
      const result = await applyTransformation('z', { operation: 'reverse', parameters: {} }, makeCtx());
      expect(result).toBe('z');
    });
  });

  describe('take', () => {
    it('takes first N elements', async () => {
      const result = await applyTransformation([1, 2, 3, 4, 5], { operation: 'take', parameters: { count: 3 } }, makeCtx());
      expect(result).toEqual([1, 2, 3]);
    });

    it('defaults to 10 when count omitted', async () => {
      const data = Array.from({ length: 15 }, (_, i) => i);
      const result = await applyTransformation(data, { operation: 'take', parameters: {} }, makeCtx());
      expect((result as unknown[]).length).toBe(10);
    });

    it('returns non-array unchanged', async () => {
      const result = await applyTransformation('hi', { operation: 'take', parameters: { count: 2 } }, makeCtx());
      expect(result).toBe('hi');
    });
  });

  describe('skip', () => {
    it('skips first N elements', async () => {
      const result = await applyTransformation([1, 2, 3, 4], { operation: 'skip', parameters: { count: 2 } }, makeCtx());
      expect(result).toEqual([3, 4]);
    });

    it('defaults to 0 when count omitted', async () => {
      const result = await applyTransformation([1, 2], { operation: 'skip', parameters: {} }, makeCtx());
      expect(result).toEqual([1, 2]);
    });

    it('returns non-array unchanged', async () => {
      const result = await applyTransformation(7, { operation: 'skip', parameters: { count: 1 } }, makeCtx());
      expect(result).toBe(7);
    });
  });

  describe('unknown operation', () => {
    it('returns data unchanged for unknown operation', async () => {
      const result = await applyTransformation([1, 2], { operation: 'explode' as any, parameters: {} }, makeCtx());
      expect(result).toEqual([1, 2]);
    });
  });
});
