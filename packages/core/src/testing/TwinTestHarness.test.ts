import { describe, it, expect } from 'vitest';
import {
  runTwinTest,
  expectTwinEquivalent,
  defaultEquivalent,
} from './TwinTestHarness';

describe('TwinTestHarness', () => {
  describe('runTwinTest', () => {
    it('passes when two implementations agree', async () => {
      const result = await runTwinTest({
        name: 'sum-agrees',
        implementations: {
          a: {
            name: 'reduce',
            run: (xs: number[]) => xs.reduce((s, x) => s + x, 0),
          },
          b: {
            name: 'recursive',
            run: (xs: number[]) =>
              xs.length === 0 ? 0 : xs[0] + xs.slice(1).reduce((s, x) => s + x, 0),
          },
        },
        generate: (seed, iter) =>
          Array.from({ length: 5 }, (_, i) => (seed + iter + i) % 10),
        iterations: 50,
      });
      expect(result.passed).toBe(true);
      expect(result.divergences).toHaveLength(0);
      expect(result.iterationsRun).toBe(50);
    });

    it('reports syndrome-mismatch when implementations disagree', async () => {
      const result = await runTwinTest({
        name: 'sub-disagrees',
        implementations: {
          a: { name: 'minusRef', run: (xs: [number, number]) => xs[0] - xs[1] },
          b: { name: 'minusBuggy', run: (xs: [number, number]) => xs[1] - xs[0] },
        },
        generate: (seed, iter): [number, number] => [seed + iter + 1, seed],
        iterations: 5,
        stopOnFirstDivergence: true,
      });
      expect(result.passed).toBe(false);
      expect(result.divergences.length).toBeGreaterThan(0);
      expect(result.divergences[0].reason).toBe('syndrome-mismatch');
      expect(result.counts.syndromeMismatches).toBeGreaterThan(0);
    });

    it('shrinks divergent inputs to a minimal counterexample', async () => {
      const result = await runTwinTest({
        name: 'shrink-finds-minimal',
        implementations: {
          a: {
            name: 'detectsNegative',
            run: (xs: number[]) => (xs.some((x) => x < 0) ? 1 : 0),
          },
          b: { name: 'alwaysZero', run: () => 0 },
        },
        generate: (seed, iter) => {
          // Seed input has many positives plus exactly one negative.
          const xs = Array.from({ length: 10 }, (_, i) => seed + iter + i + 1);
          xs[0] = -1;
          return xs;
        },
        shrink: (xs) =>
          xs.length > 1 ? xs.map((_, i) => xs.filter((_x, j) => j !== i)) : [],
        iterations: 1,
        stopOnFirstDivergence: true,
      });
      expect(result.passed).toBe(false);
      expect(result.divergences[0].shrunk).toBe(true);
      // Minimal divergent input is a 1-element array containing the negative.
      expect(result.divergences[0].input).toEqual([-1]);
      expect(result.divergences[0].originalInput).toBeDefined();
    });

    it('handles async implementations', async () => {
      const result = await runTwinTest({
        name: 'async-agrees',
        implementations: {
          a: { name: 'sync', run: (x: number) => x * 2 },
          b: {
            name: 'async',
            run: async (x: number) => {
              await Promise.resolve();
              return x * 2;
            },
          },
        },
        generate: (seed, iter) => seed + iter,
        iterations: 10,
      });
      expect(result.passed).toBe(true);
    });

    it('uses a custom oracle to normalize implementation-specific output', async () => {
      const result = await runTwinTest({
        name: 'oracle-strips-order',
        implementations: {
          a: {
            name: 'ascSet',
            run: (xs: number[]) => [...new Set(xs)].sort((p, q) => p - q),
          },
          b: {
            name: 'descSet',
            run: (xs: number[]) => [...new Set(xs)].sort((p, q) => q - p),
          },
        },
        generate: (seed, iter) => [seed % 5, iter % 5, (seed + iter) % 7, iter],
        // Without the oracle, outputs disagree on order. With the oracle,
        // both normalize to ascending — a valid spec for a set-of-numbers
        // operation that is implementation-order-insensitive.
        oracle: (output) => [...output].sort((p, q) => p - q),
        iterations: 20,
      });
      expect(result.passed).toBe(true);
    });

    it('treats matching errors as non-divergent', async () => {
      const result = await runTwinTest({
        name: 'matching-errors-ok',
        implementations: {
          a: {
            name: 'a',
            run: () => {
              throw new Error('rejected');
            },
          },
          b: {
            name: 'b',
            run: () => {
              throw new Error('rejected');
            },
          },
        },
        generate: () => 0,
        iterations: 3,
      });
      expect(result.passed).toBe(true);
    });

    it('reports a-threw when only a throws', async () => {
      const result = await runTwinTest({
        name: 'only-a-throws',
        implementations: {
          a: {
            name: 'a',
            run: () => {
              throw new Error('boom');
            },
          },
          b: { name: 'b', run: () => 42 },
        },
        generate: () => 0,
        iterations: 1,
        stopOnFirstDivergence: true,
      });
      expect(result.passed).toBe(false);
      expect(result.divergences[0].reason).toBe('a-threw');
      expect(result.counts.aThrew).toBe(1);
    });

    it('reports b-threw when only b throws', async () => {
      const result = await runTwinTest({
        name: 'only-b-throws',
        implementations: {
          a: { name: 'a', run: () => 42 },
          b: {
            name: 'b',
            run: () => {
              throw new Error('boom');
            },
          },
        },
        generate: () => 0,
        iterations: 1,
        stopOnFirstDivergence: true,
      });
      expect(result.passed).toBe(false);
      expect(result.divergences[0].reason).toBe('b-threw');
      expect(result.counts.bThrew).toBe(1);
    });

    it('reports timeout when an implementation hangs', async () => {
      const result = await runTwinTest({
        name: 'a-hangs',
        implementations: {
          a: {
            name: 'hanger',
            run: () => new Promise<number>(() => {
              /* never resolves */
            }),
          },
          b: { name: 'fast', run: () => 0 },
        },
        generate: () => 0,
        iterations: 1,
        perIterationTimeoutMs: 50,
        stopOnFirstDivergence: true,
      });
      expect(result.passed).toBe(false);
      expect(result.divergences[0].reason).toBe('timeout');
      expect(result.counts.timeouts).toBe(1);
    });

    it('collects all divergences when stopOnFirstDivergence is false', async () => {
      const result = await runTwinTest({
        name: 'collect-all',
        implementations: {
          a: { name: 'a', run: (x: number) => x + 1 },
          b: { name: 'b', run: (x: number) => x + 2 },
        },
        generate: (seed, iter) => seed + iter,
        iterations: 5,
        stopOnFirstDivergence: false,
      });
      expect(result.passed).toBe(false);
      expect(result.divergences).toHaveLength(5);
    });
  });

  describe('expectTwinEquivalent', () => {
    it('throws a diagnostic on divergence', async () => {
      await expect(
        expectTwinEquivalent({
          name: 'expect-throws',
          implementations: {
            a: { name: 'plus1', run: (x: number) => x + 1 },
            b: { name: 'plus2', run: (x: number) => x + 2 },
          },
          generate: (seed, iter) => seed + iter,
          iterations: 1,
          stopOnFirstDivergence: true,
        })
      ).rejects.toThrow(/Twin test failed: expect-throws/);
    });

    it('passes silently on agreement', async () => {
      await expect(
        expectTwinEquivalent({
          name: 'expect-passes',
          implementations: {
            a: { name: 'mul2', run: (x: number) => x * 2 },
            b: { name: 'addSelf', run: (x: number) => x + x },
          },
          generate: (seed, iter) => seed + iter,
          iterations: 5,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('defaultEquivalent', () => {
    it('is order-insensitive on object keys', () => {
      expect(defaultEquivalent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it('detects value mismatches', () => {
      expect(defaultEquivalent({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    });

    it('preserves array order (correctly)', () => {
      expect(defaultEquivalent([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(defaultEquivalent([1, 2, 3], [3, 2, 1])).toBe(false);
    });

    it('handles nested objects', () => {
      expect(
        defaultEquivalent(
          { outer: { a: 1, b: 2 }, x: [1, 2] },
          { x: [1, 2], outer: { b: 2, a: 1 } }
        )
      ).toBe(true);
    });
  });
});
