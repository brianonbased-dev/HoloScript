import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readJson, safeJsonParse } from '../safeJsonParse';

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
