/**
 * Sprint 54 — @holoscript/test acceptance tests
 * Covers: AssertionError, fn() mock function, spyOn()
 *         from the custom HoloScript testing framework (src/index.ts)
 */
import { describe, it, expect } from 'vitest';
import { AssertionError, fn, spyOn } from '../index';

// ═══════════════════════════════════════════════
// AssertionError
// ═══════════════════════════════════════════════
describe('AssertionError', () => {
  it('is a constructor', () => {
    expect(typeof AssertionError).toBe('function');
  });

  it('extends Error', () => {
    const err = new AssertionError('test failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AssertionError);
  });

  it('has name "AssertionError"', () => {
    const err = new AssertionError('test failed');
    expect(err.name).toBe('AssertionError');
  });

  it('stores message', () => {
    const err = new AssertionError('expected 1 to be 2');
    expect(err.message).toBe('expected 1 to be 2');
  });

  it('stores expected value', () => {
    const err = new AssertionError('msg', 'expected-value', 'actual-value');
    expect(err.expected).toBe('expected-value');
  });

  it('stores actual value', () => {
    const err = new AssertionError('msg', 'expected-value', 'actual-value');
    expect(err.actual).toBe('actual-value');
  });

  it('expected defaults to undefined', () => {
    const err = new AssertionError('msg');
    expect(err.expected).toBeUndefined();
  });

  it('actual defaults to undefined', () => {
    const err = new AssertionError('msg');
    expect(err.actual).toBeUndefined();
  });

  it('can be thrown and caught', () => {
    expect(() => {
      throw new AssertionError('boom');
    }).toThrow('boom');
  });
});

// ═══════════════════════════════════════════════
// fn() — mock function factory
// ═══════════════════════════════════════════════
describe('fn()', () => {
  it('is a function', () => {
    expect(typeof fn).toBe('function');
  });

  it('returns a callable function', () => {
    const mock = fn();
    expect(typeof mock).toBe('function');
  });

  it('has a .mock property', () => {
    const mock = fn();
    expect(mock.mock).toBeDefined();
    expect(mock.mock.calls).toBeInstanceOf(Array);
  });

  it('records calls', () => {
    const mock = fn();
    mock();
    expect(mock.mock.calls).toHaveLength(1);
  });

  it('records call arguments', () => {
    const mock = fn<(...args: any[]) => void>();
    mock('a', 42);
    expect(mock.mock.calls[0]).toEqual(['a', 42]);
  });

  it('tracks multiple calls', () => {
    const mock = fn<(...args: any[]) => void>();
    mock(1);
    mock(2);
    mock(3);
    expect(mock.mock.calls).toHaveLength(3);
  });

  it('records lastCall', () => {
    const mock = fn<(...args: any[]) => void>();
    mock('first');
    mock('last');
    expect(mock.mock.lastCall).toEqual(['last']);
  });

  it('uses provided implementation', () => {
    const mock = fn((x: number) => x * 2);
    const result = mock(5);
    expect(result).toBe(10);
  });

  it('records return values', () => {
    const mock = fn((x: number) => x + 1);
    mock(10);
    expect(mock.mock.results[0]).toMatchObject({ type: 'return', value: 11 });
  });

  it('mockReturnValue sets a fixed return value', () => {
    const mock = fn<() => number>();
    mock.mockReturnValue(42);
    expect(mock()).toBe(42);
    expect(mock()).toBe(42);
  });

  it('mockReturnValueOnce returns value only once', () => {
    const mock = fn<() => number>();
    mock.mockReturnValueOnce(99);
    expect(mock()).toBe(99);
    expect(mock()).toBeUndefined();
  });

  it('mockImplementation replaces default impl', () => {
    const mock = fn((x: number) => x);
    mock.mockImplementation((x: number) => x * 10);
    expect(mock(3)).toBe(30);
  });

  it('mockImplementationOnce uses impl only once', () => {
    const mock = fn((x: number) => x);
    mock.mockImplementationOnce((x: number) => x + 100);
    expect(mock(1)).toBe(101);
    expect(mock(1)).toBe(1); // back to original
  });

  it('mockClear resets calls', () => {
    const mock = fn<(...args: any[]) => void>();
    mock('x');
    mock.mockClear();
    expect(mock.mock.calls).toHaveLength(0);
  });

  it('mockClear preserves implementation', () => {
    const mock = fn((x: number) => x * 2);
    mock(3);
    mock.mockClear();
    expect(mock(4)).toBe(8);
  });

  it('mockReset clears calls and implementation', () => {
    const mock = fn((x: number) => x * 2);
    mock(5);
    mock.mockReset();
    expect(mock.mock.calls).toHaveLength(0);
    expect(mock(5)).toBeUndefined();
  });

  it('mockResolvedValue returns a resolved promise', async () => {
    const mock = fn<() => Promise<string>>();
    mock.mockResolvedValue('hello');
    const result = await mock();
    expect(result).toBe('hello');
  });

  it('mockRejectedValue returns a rejected promise', async () => {
    const mock = fn<() => Promise<never>>();
    mock.mockRejectedValue(new Error('oops'));
    await expect(mock()).rejects.toThrow('oops');
  });

  it('records throw in results when impl throws', () => {
    const mock = fn(() => {
      throw new Error('intentional');
    });
    try {
      mock();
    } catch {}
    expect(mock.mock.results[0]).toMatchObject({ type: 'throw' });
  });

  it('returns undefined with no implementation', () => {
    const mock = fn();
    expect(mock()).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// spyOn()
// ═══════════════════════════════════════════════
describe('spyOn()', () => {
  it('is a function', () => {
    expect(typeof spyOn).toBe('function');
  });

  it('replaces method on object', () => {
    const obj = { greet: (name: string) => `Hello, ${name}!` };
    const spy = spyOn(obj, 'greet');
    obj.greet('World');
    expect(spy.mock.calls).toHaveLength(1);
  });

  it('records arguments of spied method', () => {
    const obj = { add: (a: number, b: number) => a + b };
    const spy = spyOn(obj, 'add');
    obj.add(3, 4);
    expect(spy.mock.calls[0]).toEqual([3, 4]);
  });

  it('original implementation is preserved', () => {
    const obj = { double: (x: number) => x * 2 };
    spyOn(obj, 'double');
    const result = obj.double(5);
    expect(result).toBe(10);
  });

  it('spy can be configured with mockReturnValue', () => {
    const obj = { getValue: () => 1 };
    const spy = spyOn(obj, 'getValue');
    spy.mockReturnValue(999);
    expect(obj.getValue()).toBe(999);
  });

  it('spy tracks multiple invocations', () => {
    const obj = { noop: () => {} };
    const spy = spyOn(obj, 'noop');
    obj.noop();
    obj.noop();
    obj.noop();
    expect(spy.mock.calls).toHaveLength(3);
  });

  it('spy has .mock property', () => {
    const obj = { method: () => 'value' };
    const spy = spyOn(obj, 'method');
    expect(spy.mock).toBeDefined();
    expect(spy.mock.calls).toBeInstanceOf(Array);
  });
});
