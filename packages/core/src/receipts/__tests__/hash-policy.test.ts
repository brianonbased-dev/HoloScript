import { describe, it, expect } from 'vitest';
import {
  hashReceiptPayload,
  hashReceiptPayloadAsync,
  parseReceiptHash,
  receiptHashMatchesPolicy,
  RECEIPT_HASH_POLICY_DEFAULT,
} from '../hash-policy';

describe('RECEIPT_HASH_POLICY_DEFAULT', () => {
  it('is fast', () => {
    expect(RECEIPT_HASH_POLICY_DEFAULT).toBe('fast');
  });
});

describe('hashReceiptPayload — fast tier', () => {
  it('returns a string synchronously', () => {
    const result = hashReceiptPayload('{"hello":"world"}');
    expect(typeof result).toBe('string');
  });

  it('prefixes with fnv1a32:', () => {
    const result = hashReceiptPayload('test');
    expect(result.startsWith('fnv1a32:')).toBe(true);
  });

  it('hex segment is exactly 8 hex chars', () => {
    const result = hashReceiptPayload('test');
    const hex = result.slice('fnv1a32:'.length);
    expect(hex).toMatch(/^[0-9a-f]{8}$/);
  });

  it('same input produces same output (deterministic)', () => {
    const a = hashReceiptPayload('{"x":1}');
    const b = hashReceiptPayload('{"x":1}');
    expect(a).toBe(b);
  });

  it('different inputs produce different outputs', () => {
    const a = hashReceiptPayload('{"x":1}');
    const b = hashReceiptPayload('{"x":2}');
    expect(a).not.toBe(b);
  });

  it('uses fast tier by default (no second arg)', () => {
    const result = hashReceiptPayload('payload');
    expect(result.startsWith('fnv1a32:')).toBe(true);
  });

  it('uses fast tier when policy is explicitly "fast"', () => {
    const result = hashReceiptPayload('payload', 'fast');
    expect(result.startsWith('fnv1a32:')).toBe(true);
  });
});

describe('hashReceiptPayload — secure tier', () => {
  it('returns a Promise', () => {
    const result = hashReceiptPayload('test', 'secure');
    expect(result instanceof Promise).toBe(true);
    return result; // let vitest verify it resolves
  });

  it('prefixes with sha256:', async () => {
    const result = await hashReceiptPayload('test', 'secure');
    expect(result.startsWith('sha256:')).toBe(true);
  });

  it('hex segment is exactly 64 hex chars', async () => {
    const result = await hashReceiptPayload('test', 'secure');
    const hex = result.slice('sha256:'.length);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same input produces same hash (deterministic)', async () => {
    const a = await hashReceiptPayload('payload', 'secure');
    const b = await hashReceiptPayload('payload', 'secure');
    expect(a).toBe(b);
  });

  it('different inputs produce different hashes', async () => {
    const a = await hashReceiptPayload('{"x":1}', 'secure');
    const b = await hashReceiptPayload('{"x":2}', 'secure');
    expect(a).not.toBe(b);
  });
});

describe('hashReceiptPayloadAsync', () => {
  it('resolves fast tier to the same value as synchronous path', async () => {
    const sync = hashReceiptPayload('hello', 'fast');
    const async_ = await hashReceiptPayloadAsync('hello', 'fast');
    expect(async_).toBe(sync);
  });

  it('resolves secure tier to the same value as async overload', async () => {
    const a = await hashReceiptPayload('hello', 'secure');
    const b = await hashReceiptPayloadAsync('hello', 'secure');
    expect(a).toBe(b);
  });
});

describe('parseReceiptHash', () => {
  it('parses a fast-tier tag', () => {
    const tagged = hashReceiptPayload('x', 'fast');
    const parsed = parseReceiptHash(tagged);
    expect(parsed).not.toBeNull();
    expect(parsed!.policy).toBe('fast');
    expect(parsed!.hex).toMatch(/^[0-9a-f]{8}$/);
  });

  it('parses a secure-tier tag', async () => {
    const tagged = await hashReceiptPayload('x', 'secure');
    const parsed = parseReceiptHash(tagged);
    expect(parsed).not.toBeNull();
    expect(parsed!.policy).toBe('secure');
    expect(parsed!.hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null for unrecognized prefix', () => {
    expect(parseReceiptHash('unknown:abc123')).toBeNull();
    expect(parseReceiptHash('abc123')).toBeNull();
    expect(parseReceiptHash('')).toBeNull();
  });
});

describe('receiptHashMatchesPolicy', () => {
  it('returns true when fast tag matches fast policy', () => {
    const tag = hashReceiptPayload('x', 'fast');
    expect(receiptHashMatchesPolicy(tag, 'fast')).toBe(true);
  });

  it('returns false when fast tag is checked against secure policy', () => {
    const tag = hashReceiptPayload('x', 'fast');
    expect(receiptHashMatchesPolicy(tag, 'secure')).toBe(false);
  });

  it('returns true when secure tag matches secure policy', async () => {
    const tag = await hashReceiptPayload('x', 'secure');
    expect(receiptHashMatchesPolicy(tag, 'secure')).toBe(true);
  });

  it('returns false when secure tag is checked against fast policy', async () => {
    const tag = await hashReceiptPayload('x', 'secure');
    expect(receiptHashMatchesPolicy(tag, 'fast')).toBe(false);
  });

  it('returns false for an unrecognized tag', () => {
    expect(receiptHashMatchesPolicy('garbage', 'fast')).toBe(false);
    expect(receiptHashMatchesPolicy('garbage', 'secure')).toBe(false);
  });
});
