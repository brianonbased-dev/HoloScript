import { describe, expect, it } from 'vitest';
import {
  TROPICAL_INF,
  csrToDense,
  denseToCSR,
  normalizeAdjacency,
} from '../graph/TropicalGraphUtils.js';

describe('TropicalGraphUtils', () => {
  it('normalizes adjacency by fixing diagonal and infinities', () => {
    const adjacency = new Float32Array([
      9, 3, Number.POSITIVE_INFINITY,
      Number.NaN, 9, 1,
      Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 9,
    ]);

    const normalized = normalizeAdjacency(adjacency, 3);

    expect(normalized[0]).toBe(0);
    expect(normalized[4]).toBe(0);
    expect(normalized[8]).toBe(0);
    expect(normalized[1]).toBe(3);
    expect(normalized[2]).toBeGreaterThan(1e29);
    expect(normalized[3]).toBeGreaterThan(1e29);
    expect(normalized[5]).toBe(1);
  });

  it('round-trips dense <-> CSR', () => {
    const dense = new Float32Array([
      0, 3, TROPICAL_INF, 8,
      TROPICAL_INF, 0, 1, TROPICAL_INF,
      5, TROPICAL_INF, 0, 2,
      TROPICAL_INF, TROPICAL_INF, TROPICAL_INF, 0,
    ]);

    const csr = denseToCSR(dense, 4);
    const restored = csrToDense(csr);

    expect(Array.from(restored)).toEqual(Array.from(dense));
  });
});
