/**
 * Unit tests for holo-value — AUDIT-mode coverage
 *
 * Slice 13 pure recursive module. Flattens a parser HoloValue tree into
 * a runtime HoloScriptValue. Recursion + bind-marker short-circuit are
 * the main risk surfaces.
 *
 * **See**: packages/core/src/runtime/holo-value.ts (slice 13)
 */

import { describe, it, expect } from 'vitest';
import { resolveHoloValue } from './holo-value';
import type { HoloValue } from '../types';

describe('resolveHoloValue — primitive leaves', () => {
  it('null stays null', () => {
    expect(resolveHoloValue(null as unknown as HoloValue)).toBe(null);
  });

  it('strings pass through', () => {
    expect(resolveHoloValue('hello' as unknown as HoloValue)).toBe('hello');
    expect(resolveHoloValue('' as unknown as HoloValue)).toBe('');
  });

  it('numbers pass through', () => {
    expect(resolveHoloValue(42 as unknown as HoloValue)).toBe(42);
    expect(resolveHoloValue(0 as unknown as HoloValue)).toBe(0);
    expect(resolveHoloValue(-3.14 as unknown as HoloValue)).toBe(-3.14);
  });

  it('booleans pass through', () => {
    expect(resolveHoloValue(true as unknown as HoloValue)).toBe(true);
    expect(resolveHoloValue(false as unknown as HoloValue)).toBe(false);
  });
});

describe('resolveHoloValue — arrays', () => {
  it('empty array produces empty array', () => {
    expect(resolveHoloValue([] as unknown as HoloValue)).toEqual([]);
  });

  it('flat array of primitives', () => {
    expect(resolveHoloValue([1, 'a', true] as unknown as HoloValue)).toEqual([1, 'a', true]);
  });

  it('recurses into nested arrays', () => {
    const input = [[1, 2], [3, [4, 5]]] as unknown as HoloValue;
    expect(resolveHoloValue(input)).toEqual([[1, 2], [3, [4, 5]]]);
  });

  it('preserves array ORDER', () => {
    const ordered = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(resolveHoloValue(ordered as unknown as HoloValue)).toEqual(ordered);
  });

  it('returns a new array (does not mutate input)', () => {
    const input = [1, 2, 3];
    const output = resolveHoloValue(input as unknown as HoloValue) as number[];
    expect(output).not.toBe(input); // different reference
    expect(output).toEqual(input); // equal contents
  });
});

describe('resolveHoloValue — bind markers', () => {
  it('object with __bind: true passes through unchanged', () => {
    const bindNode = { __bind: true, target: 'foo' };
    const result = resolveHoloValue(bindNode as unknown as HoloValue);
    // Module returns the original object as-is (reference equality)
    expect(result).toBe(bindNode);
  });

  it('nested __bind in an array is preserved', () => {
    const bindNode = { __bind: true, ref: 'x' };
    const input = [1, bindNode, 2];
    const output = resolveHoloValue(input as unknown as HoloValue) as unknown[];
    expect(output[1]).toBe(bindNode);
  });

  it('falsy __bind (false, 0, null) does NOT trigger bind passthrough', () => {
    const notBind = { __bind: false, value: 'real' };
    const result = resolveHoloValue(notBind as unknown as HoloValue) as Record<string, unknown>;
    // Falls through to generic-object branch, which recurses and returns a NEW object
    expect(result).not.toBe(notBind);
    expect(result).toEqual({ __bind: false, value: 'real' });
  });
});

describe('resolveHoloValue — generic objects', () => {
  it('empty object → empty object', () => {
    expect(resolveHoloValue({} as unknown as HoloValue)).toEqual({});
  });

  it('flat object of primitives', () => {
    const input = { a: 1, b: 'two', c: true };
    expect(resolveHoloValue(input as unknown as HoloValue)).toEqual(input);
  });

  it('returns a NEW object (does not mutate input)', () => {
    const input = { x: 5 };
    const output = resolveHoloValue(input as unknown as HoloValue);
    expect(output).not.toBe(input);
    expect(output).toEqual(input);
  });

  it('recurses into nested objects', () => {
    const input = {
      outer: { inner: { value: 42 } },
      list: [1, 2, 3],
    };
    expect(resolveHoloValue(input as unknown as HoloValue)).toEqual(input);
  });

  it('mixed arrays and objects recurse correctly', () => {
    const input = {
      scenes: [
        { name: 'a', pos: [0, 1, 2] },
        { name: 'b', pos: [3, 4, 5] },
      ],
    };
    expect(resolveHoloValue(input as unknown as HoloValue)).toEqual(input);
  });
});

describe('resolveHoloValue — edge cases', () => {
  it('does not choke on deep nesting (10 levels)', () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < 10; i++) nested = { level: nested };
    expect(resolveHoloValue(nested as HoloValue)).toEqual(nested);
  });

  it('deeply nested array does not share reference with input', () => {
    const leaf = [1, 2, 3];
    const input = [[[leaf]]];
    const output = resolveHoloValue(input as unknown as HoloValue) as unknown[][][];
    expect(output).toEqual(input);
    // Each level is a fresh array
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
    expect(output[0][0]).not.toBe(input[0][0]);
    expect(output[0][0][0]).not.toBe(leaf);
  });
});
