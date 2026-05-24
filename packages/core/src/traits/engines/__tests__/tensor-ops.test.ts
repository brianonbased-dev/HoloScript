import { describe, it, expect } from 'vitest';
import { createTensor, add, matmul } from '../tensor-ops';

describe('tensor-ops', () => {
  it('createTensor fills row-major data and rejects bad shapes', () => {
    const t = createTensor([2, 2], [1, 2, 3, 4]);
    expect(Array.from(t.data)).toEqual([1, 2, 3, 4]);
    expect(t.shape).toEqual([2, 2]);
    expect(() => createTensor([], [1])).toThrow();
    expect(() => createTensor([0, 2])).toThrow();
  });

  it('add computes elementwise sum (not echo)', () => {
    const a = createTensor([3], [1, 2, 3]);
    const b = createTensor([3], [4, 5, 6]);
    expect(Array.from(add(a, b).data)).toEqual([5, 7, 9]);
  });

  it('add throws on length mismatch', () => {
    expect(() => add(createTensor([2], [1, 2]), createTensor([3], [1, 2, 3]))).toThrow();
  });

  it('matmul computes the real 2x2 product', () => {
    // [[1,2],[3,4]] x [[5,6],[7,8]] = [[19,22],[43,50]]
    const a = createTensor([2, 2], [1, 2, 3, 4]);
    const b = createTensor([2, 2], [5, 6, 7, 8]);
    const r = matmul(a, b);
    expect(r.shape).toEqual([2, 2]);
    expect(Array.from(r.data)).toEqual([19, 22, 43, 50]);
  });

  it('matmul handles non-square (2x3 . 3x2 = 2x2)', () => {
    const a = createTensor([2, 3], [1, 2, 3, 4, 5, 6]);
    const b = createTensor([3, 2], [7, 8, 9, 10, 11, 12]);
    const r = matmul(a, b);
    expect(r.shape).toEqual([2, 2]);
    // row0: [1*7+2*9+3*11, 1*8+2*10+3*12] = [58, 64]; row1: [139, 154]
    expect(Array.from(r.data)).toEqual([58, 64, 139, 154]);
  });

  it('matmul throws on inner-dim mismatch (negative control)', () => {
    expect(() => matmul(createTensor([2, 3], [1, 2, 3, 4, 5, 6]), createTensor([2, 2], [1, 2, 3, 4]))).toThrow();
  });
});
