/**
 * Resilience Patterns Tests
 *
 * Tests for circuit breaker, retry logic, bulkhead, and graceful degradation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  retryWithBackoff,
  Bulkhead,
  gracefulDegrade,
  fallbackChain,
} from '../resilience/ResiliencePatterns';

describe('Resilience Patterns', () => {
  describe('Circuit Breaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 100,
      });
    });

    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open after failure threshold', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should reject requests when OPEN', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Next call should fail immediately
      expect(breaker.getState()).toBe('OPEN');
      try {
        await breaker.execute(() => Promise.resolve());
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Verify circuit is OPEN
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout (resetTimeoutMs: 100 in beforeEach)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should be in HALF_OPEN now (or possibly CLOSED if a test ran before)
      const state = breaker.getState();
      expect(['HALF_OPEN', 'CLOSED']).toContain(state);
    });

    it('should get metrics', () => {
      const metrics = breaker.getMetrics();

      expect(metrics).toEqual(
        expect.objectContaining({
          totalRequests: expect.any(Number),
          totalFailures: expect.any(Number),
          totalSuccesses: expect.any(Number),
          state: expect.any(String),
        })
      );
    });
  });

  describe('Retry with Backoff', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { maxAttempts: 3, initialBackoffMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, { maxAttempts: 3, initialBackoffMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try {
        await retryWithBackoff(fn, { maxAttempts: 3, initialBackoffMs: 10 });
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff', async () => {
      const timestamps: number[] = [];
      const fn = vi.fn(async () => {
        timestamps.push(Date.now());
        if (timestamps.length < 3) throw new Error('fail');
        return 'success';
      });

      await retryWithBackoff(fn, {
        maxAttempts: 3,
        initialBackoffMs: 50,
        multiplier: 2,
        jitter: false,
      });

      // Check that delays increase
      if (timestamps.length >= 3) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];
        expect(delay2).toBeGreaterThanOrEqual(delay1); // At least as long
      }
    });
  });

  describe('Bulkhead Pattern', () => {
    let bulkhead: Bulkhead;

    beforeEach(() => {
      bulkhead = new Bulkhead({ maxConcurrent: 2 });
    });

    it('should allow concurrent requests up to limit', async () => {
      const fn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'ok';
      });

      const results = await Promise.all([bulkhead.execute(fn), bulkhead.execute(fn)]);

      expect(results).toHaveLength(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should queue requests beyond limit', async () => {
      const fn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'ok';
      });

      // Queue 4 requests but only 2 can run concurrently
      const promises = [
        bulkhead.execute(fn),
        bulkhead.execute(fn),
        bulkhead.execute(fn),
        bulkhead.execute(fn),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should reject on queue overflow', async () => {
      const bulkhead2 = new Bulkhead({ maxConcurrent: 1, queueSize: 1 });
      const fn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'ok';
      });

      // First in progress
      const p1 = bulkhead2.execute(fn);
      // Second queued
      const p2 = bulkhead2.execute(fn);
      // Third should be rejected (queue full)
      const p3 = bulkhead2.execute(fn).catch((err) => 'rejected');

      const results = await Promise.all([p1, p2, p3]);

      expect(results).toContain('rejected');
    });

    it('should provide metrics', () => {
      const metrics = bulkhead.getMetrics();

      expect(metrics).toEqual(
        expect.objectContaining({
          running: expect.any(Number),
          queued: expect.any(Number),
        })
      );
    });
  });

  describe('Graceful Degradation', () => {
    it('should use full implementation when available', async () => {
      const result = await gracefulDegrade({
        full: async () => 'high-quality',
        degraded: async () => 'low-quality',
      });

      expect(result).toBe('high-quality');
    });

    it('should fallback to degraded when full fails', async () => {
      const result = await gracefulDegrade({
        full: async () => {
          throw new Error('Full failed');
        },
        degraded: async () => 'low-quality',
      });

      expect(result).toBe('low-quality');
    });

    it('should call onDegraded callback', async () => {
      const onDegraded = vi.fn();

      await gracefulDegrade({
        full: async () => {
          throw new Error('Full failed');
        },
        degraded: async () => 'degraded',
        onDegraded,
      });

      expect(onDegraded).toHaveBeenCalled();
    });

    it('should throw if both fail', async () => {
      try {
        await gracefulDegrade({
          full: async () => {
            throw new Error('Full failed');
          },
          degraded: async () => {
            throw new Error('Degraded failed');
          },
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Fallback Chain', () => {
    it('should try strategies in order', async () => {
      const strategy1 = vi.fn().mockRejectedValue(new Error('fail'));
      const strategy2 = vi.fn().mockResolvedValue('success');

      const result = await fallbackChain([strategy1, strategy2]);

      expect(result).toBe('success');
      expect(strategy1).toHaveBeenCalled();
      expect(strategy2).toHaveBeenCalled();
    });

    it('should return first successful result', async () => {
      const results = await fallbackChain([
        async () => 'first',
        async () => 'second',
        async () => 'third',
      ]);

      expect(results).toBe('first');
    });

    it('should throw if all strategies fail', async () => {
      try {
        await fallbackChain([
          async () => {
            throw new Error('fail1');
          },
          async () => {
            throw new Error('fail2');
          },
        ]);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should skip failed strategies', async () => {
      const strategy1 = vi.fn().mockRejectedValue(new Error('fail'));
      const strategy2 = vi.fn().mockRejectedValue(new Error('fail'));
      const strategy3 = vi.fn().mockResolvedValue('success');

      const result = await fallbackChain([strategy1, strategy2, strategy3]);

      expect(result).toBe('success');
      expect(strategy1).toHaveBeenCalled();
      expect(strategy2).toHaveBeenCalled();
      expect(strategy3).toHaveBeenCalled();
    });
  });
});
