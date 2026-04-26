// @vitest-environment node
/**
 * HologramViewer — security-critical logic tests.
 *
 * The React shell in HologramViewer.tsx imports lucide/three-style ESM that
 * doesn't transform under the studio's `node` vitest env (see
 * AgentMonitorPanel test pattern: extract logic, test logic). The real
 * security surface — meta sanitization, URL construction, hash validation —
 * lives in hologramMetaSanitizer.ts and is fully testable here.
 */

import { describe, it, expect } from 'vitest';

import {
  isHashLike,
  isStrictHologramMeta,
  sanitizeMetaForRender,
} from '../hologramMetaSanitizer';

const VALID_HASH = 'a'.repeat(64);

const STRICT_META = {
  sourceKind: 'image' as const,
  width: 1024,
  height: 768,
  frames: 1,
  modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
  backend: 'webgpu' as const,
  inferenceMs: 250,
  createdAt: '2026-04-25T12:00:00.000Z',
  schemaVersion: 1 as const,
};

describe('isHashLike', () => {
  it('accepts a 64-char lowercase hex string', () => {
    expect(isHashLike(VALID_HASH)).toBe(true);
    expect(isHashLike('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('rejects uppercase / non-hex / wrong-length / non-string', () => {
    expect(isHashLike('A'.repeat(64))).toBe(false);
    expect(isHashLike('z'.repeat(64))).toBe(false);
    expect(isHashLike('a'.repeat(63))).toBe(false);
    expect(isHashLike('a'.repeat(65))).toBe(false);
    expect(isHashLike(undefined as unknown as string)).toBe(false);
    expect(isHashLike(null as unknown as string)).toBe(false);
    expect(isHashLike(12345 as unknown as string)).toBe(false);
  });

  it('rejects path-traversal-shaped input', () => {
    expect(isHashLike('../../../etc/passwd')).toBe(false);
    expect(isHashLike('/etc/passwd')).toBe(false);
    expect(isHashLike('a'.repeat(60) + '/../')).toBe(false);
  });
});

describe('isStrictHologramMeta', () => {
  it('accepts a well-formed meta', () => {
    expect(isStrictHologramMeta(STRICT_META)).toBe(true);
  });

  it.each([
    [{ ...STRICT_META, schemaVersion: 2 }, 'wrong schema version'],
    [{ ...STRICT_META, sourceKind: 'pdf' }, 'invalid sourceKind'],
    [{ ...STRICT_META, backend: 'gpu' }, 'invalid backend'],
    [{ ...STRICT_META, width: '1024' }, 'string width'],
    [{ ...STRICT_META, frames: null }, 'null frames'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['not-an-object', 'string'],
  ])('rejects %p (%s)', (input) => {
    expect(isStrictHologramMeta(input)).toBe(false);
  });
});

describe('sanitizeMetaForRender — happy path', () => {
  it('passes a valid meta through unchanged on whitelisted fields', () => {
    const out = sanitizeMetaForRender(STRICT_META);
    expect(out.sourceKind).toBe('image');
    expect(out.width).toBe(1024);
    expect(out.height).toBe(768);
    expect(out.frames).toBe(1);
    expect(out.modelId).toBe('depth-anything/Depth-Anything-V2-Small-hf');
    expect(out.backend).toBe('webgpu');
    expect(out.inferenceMs).toBe(250);
    expect(out.createdAt).toBe('2026-04-25T12:00:00.000Z');
  });

  it('drops unknown fields silently', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      maliciousField: '<script>alert(1)</script>',
      nested: { evil: true },
    });
    expect((out as Record<string, unknown>).maliciousField).toBeUndefined();
    expect((out as Record<string, unknown>).nested).toBeUndefined();
  });
});

describe('sanitizeMetaForRender — XSS / injection defense', () => {
  it('replaces non-whitelisted sourceKind with "unknown"', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      sourceKind: '<img onerror=alert(1)>',
    });
    expect(out.sourceKind).toBe('unknown');
  });

  it('replaces non-whitelisted backend with "unknown"', () => {
    const out = sanitizeMetaForRender({ ...STRICT_META, backend: 'rce' });
    expect(out.backend).toBe('unknown');
  });

  it('replaces invalid modelId with "unknown" (XSS payload)', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      modelId: '<script>alert(1)</script>',
    });
    expect(out.modelId).toBe('unknown');
  });

  it('replaces invalid modelId with "unknown" (whitespace)', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      modelId: 'foo bar',
    });
    expect(out.modelId).toBe('unknown');
  });

  it('replaces non-ISO createdAt with "unknown"', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      createdAt: 'not a date',
    });
    expect(out.createdAt).toBe('unknown');
  });

  it('replaces createdAt with timezone offset (non-UTC) with "unknown"', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      createdAt: '2026-04-25T12:00:00+05:00',
    });
    expect(out.createdAt).toBe('unknown');
  });
});

describe('sanitizeMetaForRender — numeric clamping', () => {
  it('clamps oversized width/height to 16384', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      width: 1e9,
      height: 1e9,
    });
    expect(out.width).toBe(16384);
    expect(out.height).toBe(16384);
  });

  it('clamps oversized frames to 10000', () => {
    const out = sanitizeMetaForRender({ ...STRICT_META, frames: 1e9 });
    expect(out.frames).toBe(10000);
  });

  it('floors negative numbers to 0', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      width: -1,
      height: -100,
      frames: -1,
      inferenceMs: -1,
    });
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    expect(out.frames).toBe(0);
    expect(out.inferenceMs).toBe(0);
  });

  it('handles NaN and Infinity', () => {
    const out = sanitizeMetaForRender({
      ...STRICT_META,
      width: NaN,
      height: Infinity,
      frames: -Infinity,
    });
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    expect(out.frames).toBe(0);
  });

  it('floors non-integers', () => {
    const out = sanitizeMetaForRender({ ...STRICT_META, width: 100.7 });
    expect(out.width).toBe(100);
  });
});

describe('sanitizeMetaForRender — edge cases', () => {
  it('returns "unknown" defaults for null', () => {
    const out = sanitizeMetaForRender(null);
    expect(out.sourceKind).toBe('unknown');
    expect(out.backend).toBe('unknown');
    expect(out.modelId).toBe('unknown');
    expect(out.createdAt).toBe('unknown');
    expect(out.width).toBe(0);
  });

  it('returns "unknown" defaults for undefined', () => {
    const out = sanitizeMetaForRender(undefined);
    expect(out.sourceKind).toBe('unknown');
  });

  it('returns "unknown" defaults for primitive', () => {
    const out = sanitizeMetaForRender('not-an-object');
    expect(out.sourceKind).toBe('unknown');
  });

  it('does not mutate the input', () => {
    const input = { ...STRICT_META, extra: 'evil' };
    const inputCopy = JSON.parse(JSON.stringify(input)) as typeof input;
    sanitizeMetaForRender(input);
    expect(input).toEqual(inputCopy);
  });
});
