import { afterEach, describe, expect, it, vi } from 'vitest';
import { benchmarkKeyMatches, bypassesDisabled, constantTimeEqual } from '../prodBypass';
import { requireAuth } from '../api-auth';

afterEach(() => {
  vi.unstubAllEnvs();
});

function nonProd() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', '');
  vi.stubEnv('RAILWAY_ENVIRONMENT', '');
}

describe('constantTimeEqual', () => {
  it('matches equal strings and refuses any difference', () => {
    expect(constantTimeEqual('k-123', 'k-123')).toBe(true);
    expect(constantTimeEqual('k-123', 'k-124')).toBe(false);
    expect(constantTimeEqual('x-123', 'k-123')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('refuses a wrong-length key, shorter or longer', () => {
    expect(constantTimeEqual('k-12', 'k-123')).toBe(false);
    expect(constantTimeEqual('k-1234', 'k-123')).toBe(false);
  });

  it('compares every character (no early exit on the first mismatch)', () => {
    const a = 'a'.repeat(64);
    let calls = 0;
    const spy = vi.spyOn(String.prototype, 'charCodeAt').mockImplementation(function (
      this: string,
      i: number
    ) {
      calls++;
      return this.toString().codePointAt(i) ?? NaN;
    });
    constantTimeEqual(a, 'b' + 'a'.repeat(63));
    spy.mockRestore();
    expect(calls).toBe(128);
  });
});

describe('benchmarkKeyMatches', () => {
  it('non-prod control: a matching key matches', () => {
    nonProd();
    expect(bypassesDisabled()).toBe(false);
    expect(benchmarkKeyMatches('bench-key', 'bench-key')).toBe(true);
  });

  it('null, undefined or empty header never matches', () => {
    nonProd();
    expect(benchmarkKeyMatches(null, 'bench-key')).toBe(false);
    expect(benchmarkKeyMatches(undefined, 'bench-key')).toBe(false);
    expect(benchmarkKeyMatches('', 'bench-key')).toBe(false);
  });

  it('unset key never matches, even an empty header', () => {
    nonProd();
    expect(benchmarkKeyMatches('', '')).toBe(false);
    expect(benchmarkKeyMatches('x', undefined)).toBe(false);
  });

  it('wrong-length key does not match', () => {
    nonProd();
    expect(benchmarkKeyMatches('bench-ke', 'bench-key')).toBe(false);
    expect(benchmarkKeyMatches('bench-keyy', 'bench-key')).toBe(false);
  });

  it.each([
    ['NODE_ENV', 'production'],
    ['RAILWAY_ENVIRONMENT_NAME', 'production'],
    ['RAILWAY_ENVIRONMENT', 'production'],
  ])('production (%s=%s): a correct key does NOT match', (k, v) => {
    nonProd();
    vi.stubEnv(k, v);
    expect(bypassesDisabled()).toBe(true);
    expect(benchmarkKeyMatches('bench-key', 'bench-key')).toBe(false);
  });
});

describe('requireAuth benchmark path', () => {
  const req = (h: Record<string, string>) =>
    new Request('https://studio.test/api/brittney', { headers: h });

  it('non-prod control: correct key yields the benchmark user', async () => {
    nonProd();
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', 'bench-key');
    const r = (await requireAuth(req({ 'x-benchmark-key': 'bench-key' }))) as {
      user?: { id: string };
    };
    expect(r.user?.id).toBe('benchmark');
  });

  it('production: correct key does not yield the benchmark user', async () => {
    nonProd();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', 'bench-key');
    // Falls through to the session path (no request scope in a unit test, so it
    // may throw); either way it must not be the benchmark user.
    const r = (await requireAuth(req({ 'x-benchmark-key': 'bench-key' })).catch(() => null)) as {
      user?: { id: string };
    } | null;
    expect(r?.user?.id).not.toBe('benchmark');
  });

  it('wrong-length key does not yield the benchmark user', async () => {
    nonProd();
    vi.stubEnv('BRITTNEY_BENCHMARK_KEY', 'bench-key');
    const r = (await requireAuth(req({ 'x-benchmark-key': 'bench-keyy' })).catch(() => null)) as {
      user?: { id: string };
    } | null;
    expect(r?.user?.id).not.toBe('benchmark');
  });
});
