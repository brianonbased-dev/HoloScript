import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FallbackCacheStrategy } from '../../recovery/strategies/FallbackCacheStrategy';
import type { IAgentFailure } from '../../extensions';

function makeFailure(overrides: Partial<IAgentFailure> = {}): IAgentFailure {
  return {
    id: 'fail-1',
    agentId: 'agent-A',
    errorType: 'network-timeout',
    message: 'timeout',
    severity: 'medium',
    timestamp: Date.now(),
    context: {},
    ...overrides,
  };
}

describe('FallbackCacheStrategy — Production Tests', () => {
  let strategy: FallbackCacheStrategy;

  beforeEach(() => {
    strategy = new FallbackCacheStrategy();
  });

  describe('identity / config', () => {
    it('has correct id', () => {
      expect(strategy.id).toBe('fallback-cache');
    });

    it('maxAttempts is 1', () => {
      expect(strategy.maxAttempts).toBe(1);
    });

    it('backoffMs is 0', () => {
      expect(strategy.backoffMs).toBe(0);
    });

    it('handles network-timeout, api-rate-limit, ai-service-error, dependency-error', () => {
      expect(strategy.handles).toContain('network-timeout');
      expect(strategy.handles).toContain('api-rate-limit');
      expect(strategy.handles).toContain('ai-service-error');
      expect(strategy.handles).toContain('dependency-error');
    });
  });

  describe('set() / get()', () => {
    it('stores and retrieves a value', () => {
      strategy.set('key1', { foo: 'bar' });
      expect(strategy.get('key1')).toEqual({ foo: 'bar' });
    });

    it('returns undefined for missing key', () => {
      expect(strategy.get('missing')).toBeUndefined();
    });
  });

  describe('hasValidCache()', () => {
    it('returns false for missing key', () => {
      expect(strategy.hasValidCache('x')).toBe(false);
    });

    it('returns true for a fresh entry', () => {
      strategy.set('fresh', 42);
      expect(strategy.hasValidCache('fresh')).toBe(true);
    });

    it('returns true for stale entry when staleWhileRevalidate=true', () => {
      const old = new FallbackCacheStrategy({ maxAge: 1 }); // 1ms TTL
      old.set('stale', 99);
      // wait for expiry
      return new Promise((resolve) =>
        setTimeout(() => {
          expect(old.hasValidCache('stale')).toBe(true); // staleWhileRevalidate default true
          resolve(undefined);
        }, 5)
      );
    });

    it('returns false for stale entry when staleWhileRevalidate=false', () => {
      const strict = new FallbackCacheStrategy({ maxAge: 1, staleWhileRevalidate: false });
      strict.set('stale', 99);
      return new Promise((resolve) =>
        setTimeout(() => {
          expect(strict.hasValidCache('stale')).toBe(false);
          resolve(undefined);
        }, 5)
      );
    });
  });

  describe('matches()', () => {
    it('returns false for un-handled error type', () => {
      const f = makeFailure({ errorType: 'type-error' });
      expect(strategy.matches(f)).toBe(false);
    });

    it('returns false when error type handled but no cache', () => {
      const f = makeFailure({ errorType: 'network-timeout' });
      expect(strategy.matches(f)).toBe(false);
    });

    it('returns true when error type handled and cache entry present', () => {
      const f = makeFailure({ errorType: 'network-timeout', context: { cacheKey: 'mykey' } });
      strategy.set('mykey', 'data');
      expect(strategy.matches(f)).toBe(true);
    });

    it('derives cache key from agentId:errorType when no context.cacheKey', () => {
      const f = makeFailure({ agentId: 'agent-A', errorType: 'api-rate-limit' });
      strategy.set('agent-A:api-rate-limit', 'fallback');
      expect(strategy.matches(f)).toBe(true);
    });
  });

  describe('execute()', () => {
    it('returns success:false and escalate when no cache entry', async () => {
      const f = makeFailure({ errorType: 'network-timeout', context: { cacheKey: 'nope' } });
      const result = await strategy.execute(f);
      expect(result.success).toBe(false);
      expect(result.nextAction).toBe('escalate');
    });

    it('returns success:true with fresh cache', async () => {
      const f = makeFailure({ errorType: 'network-timeout', context: { cacheKey: 'fresh' } });
      strategy.set('fresh', { value: 1 });
      const result = await strategy.execute(f);
      expect(result.success).toBe(true);
      expect(result.strategyUsed).toBe('fallback-cache');
    });

    it('returns stale message for old entry with staleWhileRevalidate=true', async () => {
      const slow = new FallbackCacheStrategy({ maxAge: 1, staleWhileRevalidate: true });
      slow.set('k', 'val');
      await new Promise((r) => setTimeout(r, 5));
      const f = makeFailure({ errorType: 'network-timeout', context: { cacheKey: 'k' } });
      const result = await slow.execute(f);
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/stale/i);
      expect(result.retryRecommended).toBe(true);
    });

    it('returns failure for expired entry with staleWhileRevalidate=false', async () => {
      const strict = new FallbackCacheStrategy({ maxAge: 1, staleWhileRevalidate: false });
      strict.set('k', 'val');
      await new Promise((r) => setTimeout(r, 5));
      const f = makeFailure({ errorType: 'network-timeout', context: { cacheKey: 'k' } });
      const result = await strict.execute(f);
      expect(result.success).toBe(false);
      expect(result.nextAction).toBe('retry');
    });
  });

  describe('clear() / prune() / size()', () => {
    it('size() counts entries', () => {
      strategy.set('a', 1);
      strategy.set('b', 2);
      expect(strategy.size()).toBe(2);
    });

    it('clear() removes all entries', () => {
      strategy.set('a', 1);
      strategy.clear();
      expect(strategy.size()).toBe(0);
    });

    it('prune() removes expired entries when staleWhileRevalidate=false', async () => {
      const strict = new FallbackCacheStrategy({ maxAge: 1, staleWhileRevalidate: false });
      strict.set('a', 1);
      strict.set('b', 2);
      await new Promise((r) => setTimeout(r, 5));
      const pruned = strict.prune();
      expect(pruned).toBe(2);
      expect(strict.size()).toBe(0);
    });

    it('prune() does not remove when staleWhileRevalidate=true', async () => {
      const lenient = new FallbackCacheStrategy({ maxAge: 1, staleWhileRevalidate: true });
      lenient.set('a', 1);
      await new Promise((r) => setTimeout(r, 5));
      const pruned = lenient.prune();
      expect(pruned).toBe(0);
      expect(lenient.size()).toBe(1);
    });
  });

  describe('getCacheKey()', () => {
    it('uses context.cacheKey when provided', () => {
      const f = makeFailure({ context: { cacheKey: 'explicit-key' } });
      expect(strategy.getCacheKey(f)).toBe('explicit-key');
    });

    it('falls back to agentId:errorType', () => {
      const f = makeFailure({ agentId: 'agent-X', errorType: 'storage-error', context: {} });
      expect(strategy.getCacheKey(f)).toBe('agent-X:storage-error');
    });
  });
});
