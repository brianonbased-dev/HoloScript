import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  Bulkhead,
  retryWithBackoff,
  fallbackChain,
  gracefulDegrade,
  withTimeout,
} from '../ResiliencePatterns';

describe('CircuitBreaker', () => {
  it('starts CLOSED', () => {
    const cb = new CircuitBreaker();
    expect(cb.currentState).toBe(CircuitBreakerState.CLOSED);
  });

  it('passes through on success', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.currentState).toBe(CircuitBreakerState.CLOSED);
  });

  it('opens after failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    for (let i = 0; i < 2; i++) {
      await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    }
    expect(cb.currentState).toBe(CircuitBreakerState.OPEN);
  });

  it('rejects immediately when OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000 });
    await cb.execute(() => Promise.reject(new Error('x'))).catch(() => {});
    await expect(cb.execute(() => Promise.resolve(1))).rejects.toThrow('Circuit breaker is OPEN');
  });

  it('getMetrics returns stats', async () => {
    const cb = new CircuitBreaker();
    await cb.execute(() => Promise.resolve(1));
    const m = cb.getMetrics();
    expect(m.state).toBe(CircuitBreakerState.CLOSED);
    expect(m.totalFailures).toBe(0);
  });
});

describe('retryWithBackoff', () => {
  it('succeeds on first try', async () => {
    const result = await retryWithBackoff(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('retries and eventually succeeds', async () => {
    let attempt = 0;
    const result = await retryWithBackoff(
      () => {
        attempt++;
        if (attempt < 3) throw new Error('not yet');
        return Promise.resolve('done');
      },
      { maxAttempts: 3, initialBackoffMs: 1, jitter: false }
    );
    expect(result).toBe('done');
    expect(attempt).toBe(3);
  });

  it('throws after max attempts', async () => {
    await expect(
      retryWithBackoff(
        () => Promise.reject(new Error('always fail')),
        { maxAttempts: 2, initialBackoffMs: 1, jitter: false }
      )
    ).rejects.toThrow('always fail');
  });
});

describe('Bulkhead', () => {
  it('executes within concurrency limit', async () => {
    const bh = new Bulkhead({ maxConcurrent: 2, queueSize: 10 });
    const result = await bh.execute(() => Promise.resolve(99));
    expect(result).toBe(99);
  });

  it('rejects when queue is full', async () => {
    const bh = new Bulkhead({ maxConcurrent: 1, queueSize: 0 });
    // Fill the single concurrent slot
    const slow = bh.execute(() => new Promise(r => setTimeout(r, 1000)));
    await expect(bh.execute(() => Promise.resolve(1))).rejects.toThrow('queue full');
    slow.catch(() => {}); // Cleanup
  });

  it('getState reports running and queued', async () => {
    const bh = new Bulkhead({ maxConcurrent: 5 });
    const state = bh.getState();
    expect(state.maxConcurrent).toBe(5);
    expect(state.running).toBe(0);
  });
});

describe('fallbackChain', () => {
  it('returns first successful result', async () => {
    const result = await fallbackChain([
      () => Promise.resolve('first'),
      () => Promise.resolve('second'),
    ]);
    expect(result).toBe('first');
  });

  it('falls back to next strategy', async () => {
    const result = await fallbackChain([
      () => Promise.reject(new Error('fail')),
      () => Promise.resolve('backup'),
    ]);
    expect(result).toBe('backup');
  });

  it('throws if all strategies fail', async () => {
    await expect(
      fallbackChain([
        () => Promise.reject(new Error('a')),
        () => Promise.reject(new Error('b')),
      ])
    ).rejects.toThrow('b');
  });
});

describe('gracefulDegrade', () => {
  it('returns full result on success', async () => {
    const result = await gracefulDegrade({
      full: () => Promise.resolve('full'),
      degraded: () => Promise.resolve('degraded'),
    });
    expect(result).toBe('full');
  });

  it('falls back to degraded on failure', async () => {
    const onDegraded = vi.fn();
    const result = await gracefulDegrade({
      full: () => Promise.reject(new Error('fail')),
      degraded: () => Promise.resolve('degraded'),
      onDegraded,
    });
    expect(result).toBe('degraded');
    expect(onDegraded).toHaveBeenCalled();
  });
});

describe('withTimeout', () => {
  it('resolves if within timeout', async () => {
    const result = await withTimeout(Promise.resolve('fast'), 1000);
    expect(result).toBe('fast');
  });

  it('rejects if timeout expires', async () => {
    const slow = new Promise(r => setTimeout(() => r('slow'), 5000));
    await expect(withTimeout(slow, 10)).rejects.toThrow('timeout');
  });
});
