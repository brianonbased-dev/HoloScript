import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readJson, safeJsonParse, tryParseJson } from '../safeJsonParse';

describe('safeJsonParse', () => {
  it('accepts values matching schema', () => {
    const r = safeJsonParse('{"a":1}', z.object({ a: z.number() }));
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });

  it('returns json-parse for invalid JSON', () => {
    const r = safeJsonParse('not json', z.unknown());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('json-parse');
  });

  it('returns schema for JSON that fails zod', () => {
    const r = safeJsonParse('{"a":"x"}', z.object({ a: z.number() }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('schema');
  });
});

describe('readJson', () => {
  it('returns parsed value', () => {
    expect(readJson('null')).toBeNull();
    expect(readJson('[1]')).toEqual([1]);
  });

  it('throws SyntaxError on invalid input', () => {
    expect(() => readJson('{')).toThrow(SyntaxError);
  });
});

describe('tryParseJson', () => {
  it('returns parsed value on valid JSON', () => {
    expect(tryParseJson<number[]>('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(tryParseJson<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  it('returns fallback on null/undefined input (localStorage.getItem miss)', () => {
    expect(tryParseJson<string[]>(null, [])).toEqual([]);
    expect(tryParseJson<string[]>(undefined, ['default'])).toEqual(['default']);
  });

  it('returns fallback on malformed JSON without throwing', () => {
    expect(tryParseJson<unknown>('{not valid}', null)).toBeNull();
    expect(tryParseJson<number>('garbage', 42)).toBe(42);
  });

  it('returns fallback on empty string (JSON.parse("") throws)', () => {
    expect(tryParseJson<unknown>('', null)).toBeNull();
  });

  it('preserves null parse result distinct from fallback', () => {
    // 'null' is valid JSON that parses to null — should NOT trigger fallback
    expect(tryParseJson<unknown>('null', 'fallback')).toBeNull();
  });
});
