/**
 * Tests for studio-local safe JSON helpers.
 * task_1776983047367_7vx1: "Audit: Add error handling to JSON.parse calls"
 */
import { describe, it, expect } from 'vitest';
import { tryParseJson, safeParseJson } from '../safeJson';

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    expect(tryParseJson<number[]>('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(tryParseJson<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
    expect(tryParseJson<string>('"hello"', 'fallback')).toBe('hello');
  });

  it('returns fallback on null/undefined (localStorage miss)', () => {
    expect(tryParseJson<string[]>(null, [])).toEqual([]);
    expect(tryParseJson<string[]>(undefined, ['default'])).toEqual(['default']);
  });

  it('returns fallback on malformed JSON without throwing', () => {
    expect(tryParseJson<unknown>('{not valid}', null)).toBeNull();
    expect(tryParseJson<number>('not a number', 42)).toBe(42);
    expect(tryParseJson<unknown>('', null)).toBeNull();
  });

  it('does NOT confuse valid `null` JSON with the fallback path', () => {
    // 'null' is legal JSON that parses to null. We must distinguish that from
    // the localStorage-miss case, otherwise persisted-null state is corrupted
    // every load.
    expect(tryParseJson<unknown>('null', 'fallback')).toBeNull();
  });
});

describe('safeParseJson', () => {
  it('returns ok=true with the value on valid JSON', () => {
    const r = safeParseJson<number[]>('[1,2,3]');
    expect(r).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('returns ok=false error=empty for null/undefined/empty input', () => {
    expect(safeParseJson(null)).toEqual({ ok: false, error: 'empty' });
    expect(safeParseJson(undefined)).toEqual({ ok: false, error: 'empty' });
    expect(safeParseJson('')).toEqual({ ok: false, error: 'empty' });
  });

  it('returns ok=false error=parse with a SyntaxError message on malformed input', () => {
    const r = safeParseJson('{not valid}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('parse');
      expect(typeof r.message).toBe('string');
      expect((r.message ?? '').length).toBeGreaterThan(0);
    }
  });

  it('preserves the value `null` (legal JSON) on ok=true', () => {
    const r = safeParseJson('null');
    expect(r).toEqual({ ok: true, value: null });
  });
});
