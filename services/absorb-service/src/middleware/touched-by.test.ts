import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { touchedByMiddleware, _resetTouchedByCacheForTest } from './touched-by.js';

function makeRes(): Response & { _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res: any = {
    setHeader(name: string, value: any) {
      headers[name] = String(value);
      return res;
    },
    _headers: headers,
  };
  return res;
}

describe('touchedByMiddleware', () => {
  let next: NextFunction;
  const ORIGINAL_ENV = process.env.HOLO_TOUCHED_BY;

  beforeEach(() => {
    next = vi.fn();
    _resetTouchedByCacheForTest();
    delete process.env.HOLO_TOUCHED_BY;
  });

  afterEach(() => {
    _resetTouchedByCacheForTest();
    if (ORIGINAL_ENV === undefined) delete process.env.HOLO_TOUCHED_BY;
    else process.env.HOLO_TOUCHED_BY = ORIGINAL_ENV;
  });

  it('emits the baked-in roster when env is unset', () => {
    const res = makeRes();
    touchedByMiddleware({} as Request, res, next);
    expect(res._headers['X-Holo-Touched-By']).toBe('claude1,cursor1,gemini1,copilot1');
    expect(next).toHaveBeenCalled();
  });

  it('reads handles from HOLO_TOUCHED_BY env var when set', () => {
    process.env.HOLO_TOUCHED_BY = 'claude2,gemini1';
    const res = makeRes();
    touchedByMiddleware({} as Request, res, next);
    expect(res._headers['X-Holo-Touched-By']).toBe('claude2,gemini1');
  });

  it('drops tokens containing disallowed characters but keeps clean ones', () => {
    process.env.HOLO_TOUCHED_BY = 'claude1, bad token,<script>,gemini1\r\n,copilot1';
    const res = makeRes();
    touchedByMiddleware({} as Request, res, next);
    expect(res._headers['X-Holo-Touched-By']).toBe('claude1,gemini1,copilot1');
  });

  it('drops tokens with embedded CRLF (header-injection guard)', () => {
    process.env.HOLO_TOUCHED_BY = 'claude1,evil\r\nX-Injected: yes,gemini1';
    const res = makeRes();
    touchedByMiddleware({} as Request, res, next);
    const header = res._headers['X-Holo-Touched-By'];
    expect(header).toBe('claude1,gemini1');
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).not.toContain('X-Injected');
  });

  it('omits the header when env is set to whitespace and baked default sanitizes to empty', () => {
    process.env.HOLO_TOUCHED_BY = '   ';
    const res = makeRes();
    touchedByMiddleware({} as Request, res, next);
    expect(res._headers['X-Holo-Touched-By']).toBe('claude1,cursor1,gemini1,copilot1');
  });

  it('caps the joined header value at 256 chars', () => {
    process.env.HOLO_TOUCHED_BY = Array.from({ length: 100 }, (_, i) => `seat${i}`).join(',');
    const res = makeRes();
    touchedByMiddleware({} as Request, res, next);
    const header = res._headers['X-Holo-Touched-By'];
    expect(header.length).toBeLessThanOrEqual(256);
  });

  it('caches the first resolved value across calls', () => {
    process.env.HOLO_TOUCHED_BY = 'claude1';
    const res1 = makeRes();
    touchedByMiddleware({} as Request, res1, next);
    expect(res1._headers['X-Holo-Touched-By']).toBe('claude1');

    process.env.HOLO_TOUCHED_BY = 'gemini1';
    const res2 = makeRes();
    touchedByMiddleware({} as Request, res2, next);
    expect(res2._headers['X-Holo-Touched-By']).toBe('claude1');
  });

  it('always invokes next()', () => {
    touchedByMiddleware({} as Request, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
