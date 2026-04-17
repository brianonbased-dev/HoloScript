import { describe, expect, it } from 'vitest';
import { coerceCounterValue, coerceFiniteNumber } from './loroCoercion';

describe('loroCoercion (CRDT-02)', () => {
  it('coerceFiniteNumber handles numbers, strings, bigint, edge cases', () => {
    expect(coerceFiniteNumber(3.25, -1)).toBe(3.25);
    expect(coerceFiniteNumber('  -2.5 ', 0)).toBe(-2.5);
    expect(coerceFiniteNumber(BigInt(42), 0)).toBe(42);
    expect(coerceFiniteNumber(null, 7)).toBe(7);
    expect(coerceFiniteNumber(undefined, 7)).toBe(7);
    expect(coerceFiniteNumber('', 9)).toBe(9);
    expect(coerceFiniteNumber('not-a-number', 2)).toBe(2);
    expect(coerceFiniteNumber(Number.NaN, 3)).toBe(3);
    expect(coerceFiniteNumber(Number.POSITIVE_INFINITY, 0)).toBe(0);
    expect(coerceFiniteNumber(true, 0)).toBe(1);
    expect(coerceFiniteNumber(false, 5)).toBe(0);
  });

  it('coerceCounterValue matches finite scalar rules with 0 default', () => {
    expect(coerceCounterValue(100)).toBe(100);
    expect(coerceCounterValue('100')).toBe(100);
    expect(coerceCounterValue(BigInt(-3))).toBe(-3);
    expect(coerceCounterValue('')).toBe(0);
    expect(coerceCounterValue(null)).toBe(0);
  });
});
