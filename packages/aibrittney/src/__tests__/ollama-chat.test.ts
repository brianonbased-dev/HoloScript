import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveNumCtx } from '../ollama-chat.js';

describe('resolveNumCtx', () => {
  const ENV_KEY = 'AIBRITTNEY_NUM_CTX';

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('returns 16384 when env var is unset', () => {
    expect(resolveNumCtx()).toBe(16384);
  });

  it('returns the env value when set to a positive integer', () => {
    process.env[ENV_KEY] = '8192';
    expect(resolveNumCtx()).toBe(8192);
  });

  it('returns 16384 for zero (not a valid context size)', () => {
    process.env[ENV_KEY] = '0';
    expect(resolveNumCtx()).toBe(16384);
  });

  it('returns 16384 for non-numeric string', () => {
    process.env[ENV_KEY] = 'invalid';
    expect(resolveNumCtx()).toBe(16384);
  });

  it('returns 16384 for negative value', () => {
    process.env[ENV_KEY] = '-1024';
    expect(resolveNumCtx()).toBe(16384);
  });
});
