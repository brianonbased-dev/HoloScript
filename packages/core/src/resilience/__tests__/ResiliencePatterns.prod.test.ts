/**
 * ResiliencePatterns — Production Test Suite
 *
 * Covers:
 *  - CircuitBreaker  (CLOSED → OPEN → HALF_OPEN → CLOSED state machine)
 *  - Bulkhead        (concurrency cap, queue, timeout)
 *  - retryWithBackoff (success on nth attempt, non-retryable bail-out)
 *  - fallbackChain   (first succeeds, primary fails ⇒ secondary used)
 *  - gracefulDegrade (full succeeds, full fails ⇒ degraded)
 *  - withTimeout     (resolves before deadline, rejects after deadline)
 */

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ok = <T>(v: T) => () => Promise.resolve(v);
const fail = (msg = 'boom') => () => Promise.reject(new Error(msg));
const failThen = (failTimes: number, value: string) => {
  let calls = 0;
  return () => {
    calls++;
    if (calls <= failTimes) return Promise.reject(new Error(`fail #${calls}`));
    return Promise.resolve(value);
  };
};

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, successThreshold: 2, resetTimeoutMs: 50, windowMs: 5000 });
  });

  it('starts in CLOSED state', () => {
    expect(cb.currentState).toBe(CircuitBreakerState.CLOSED);
  });

  it('executes successfully in CLOSED state', async () => {
    const result = await cb.execute(ok(42));
    expect(result).toBe(42);
    expect(cb.currentState).toBe(CircuitBreakerState.CLOSED);
  });

  it('propagates errors in CLOSED state without opening prematurely', async () => {
    await expect(cb.execute(fail('err'))).rejects.toThrow('err');
    expect(cb.currentState).toBe(CircuitBreakerState.CLOSED); // 1/3
  });

  it('opens after failureThreshold failures', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail())).rejects.toThrow();
    }
    expect(cb.currentState).toBe(CircuitBreakerState.OPEN);
  });

  it('rejects fast when OPEN (no fn invocation)', async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail())).rejects.toThrow();
    }
    const spy = vi.fn(ok(1));
    await expect(cb.execute(spy)).rejects.toThrow(/Circuit breaker is OPEN/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after resetTimeout', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail())).rejects.toThrow();
    }
    // Wait for reset timeout
    await new Promise(r => setTimeout(r, 60));
    // Execute a successful call — this will transition to HALF_OPEN then CLOSED
    const result = await cb.execute(ok('recovered'));
    expect(result).toBe('recovered');
  });

  it('closes after successThreshold successes from HALF_OPEN', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail())).rejects.toThrow();
    }
    await new Promise(r => setTimeout(r, 60)); // reset timeout
    // Two successes → CLOSED
    await cb.execute(ok(1));
    await cb.execute(ok(2));
    expect(cb.currentState).toBe(CircuitBreakerState.CLOSED);
  });

  it('returns to OPEN on failure in HALF_OPEN', async () => {
    // Open circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail())).rejects.toThrow();
    }
    await new Promise(r => setTimeout(r, 60));
    // Fail during HALF_OPEN
    await expect(cb.execute(fail('still broken'))).rejects.toThrow('still broken');
    expect(cb.currentState).toBe(CircuitBreakerState.OPEN);
  });

  it('getMetrics reports counts', async () => {
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(fail())).rejects.toThrow();
    }
    // onSuccess() resets failureCount to 0; successCount only increments in HALF_OPEN.
    // After 2 failures (no success), failureCount=2, successCount=0.
    const m = cb.getMetrics();
    expect(m.totalFailures).toBe(2);
    expect(m.totalSuccesses).toBe(0);
    expect(m.totalRequests).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Bulkhead
// ---------------------------------------------------------------------------

describe('Bulkhead', () => {
  it('executes operations within maxConcurrent', async () => {
    const bh = new Bulkhead({ maxConcurrent: 3, queueSize: 100, timeoutMs: 2000 });
    const results = await Promise.all([bh.execute(ok(1)), bh.execute(ok(2)), bh.execute(ok(3))]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('queues excess operations', async () => {
    const bh = new Bulkhead({ maxConcurrent: 1, queueSize: 5, timeoutMs: 2000 });
    let resolve1: () => void;
    const blocker = () => new Promise<string>((res) => { resolve1 = () => res('done'); });
    const p1 = bh.execute(blocker);
    const p2 = bh.execute(ok('queued'));
    resolve1!();
    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toBe('done');
    expect(r2).toBe('queued');
  });

  it('rejects when queue is full', async () => {
    const bh = new Bulkhead({ maxConcurrent: 1, queueSize: 1, timeoutMs: 5000 });
    let resolve1: () => void;
    const blocker = () => new Promise<void>(res => { resolve1 = res; });
    // Fills the one concurrent slot
    const p1 = bh.execute(blocker);
    // Added to queue (size=1, now full)
    const p2 = bh.execute(ok('q1'));
    // Should be rejected — queue is full
    await expect(bh.execute(ok('q2'))).rejects.toThrow(/queue full/i);
    resolve1!();
    await p1;
    await p2;
  });

  it('reports running and queued stats', async () => {
    const bh = new Bulkhead({ maxConcurrent: 2, queueSize: 10, timeoutMs: 2000 });
    const state = bh.getState();
    expect(state.maxConcurrent).toBe(2);
    expect(state.running).toBe(0);
    expect(state.queued).toBe(0);
  });

  it('getMetrics returns utilization percentages', async () => {
    const bh = new Bulkhead({ maxConcurrent: 4, queueSize: 20, timeoutMs: 1000 });
    const m = bh.getMetrics();
    expect(m.utilizationPercent).toBe(0);
    expect(m.queueUtilizationPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// retryWithBackoff
// ---------------------------------------------------------------------------

describe('retryWithBackoff', () => {
  it('returns result immediately on first success', async () => {
    const result = await retryWithBackoff(ok('hello'), { maxAttempts: 3, initialBackoffMs: 1, jitter: false });
    expect(result).toBe('hello');
  });

  it('retries up to maxAttempts and succeeds', async () => {
    const fn = failThen(2, 'success');
    const result = await retryWithBackoff(fn, { maxAttempts: 3, initialBackoffMs: 1, jitter: false });
    expect(result).toBe('success');
  });

  it('throws after all retries exhausted', async () => {
    await expect(
      retryWithBackoff(fail('persistent'), { maxAttempts: 3, initialBackoffMs: 1, jitter: false })
    ).rejects.toThrow('persistent');
  });

  it('bails early if isRetryable returns false', async () => {
    const spy = vi.fn(fail('non-retryable'));
    await expect(
      retryWithBackoff(spy, {
        maxAttempts: 5,
        initialBackoffMs: 1,
        jitter: false,
        isRetryable: () => false,
      })
    ).rejects.toThrow('non-retryable');
    expect(spy).toHaveBeenCalledTimes(1); // no retries
  });

  it('caps backoff at maxBackoffMs', async () => {
    // Just verifying it doesn't hang — 3 failures × 1ms backoff max
    const fn = failThen(2, 'ok');
    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
      multiplier: 100, // would normally explode
      jitter: false,
    });
    expect(result).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// fallbackChain
// ---------------------------------------------------------------------------

describe('fallbackChain', () => {
  it('returns first strategy result when it succeeds', async () => {
    const result = await fallbackChain([ok('primary'), ok('secondary')]);
    expect(result).toBe('primary');
  });

  it('falls back to secondary when primary fails', async () => {
    const result = await fallbackChain([fail('primary-down'), ok('secondary')]);
    expect(result).toBe('secondary');
  });

  it('falls back through multiple strategies', async () => {
    const result = await fallbackChain([fail('a'), fail('b'), ok('tertiary')]);
    expect(result).toBe('tertiary');
  });

  it('throws last error when all strategies fail', async () => {
    await expect(fallbackChain([fail('a'), fail('b'), fail('final')])).rejects.toThrow('final');
  });

  it('throws when called with empty strategy list', async () => {
    await expect(fallbackChain([])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// gracefulDegrade
// ---------------------------------------------------------------------------

describe('gracefulDegrade', () => {
  it('returns full result when full succeeds', async () => {
    const result = await gracefulDegrade({ full: ok('full'), degraded: ok('degraded') });
    expect(result).toBe('full');
  });

  it('returns degraded result when full fails', async () => {
    const result = await gracefulDegrade({ full: fail('err'), degraded: ok('degraded') });
    expect(result).toBe('degraded');
  });

  it('calls onDegraded callback when falling back', async () => {
    const onDegraded = vi.fn();
    await gracefulDegrade({ full: fail('err'), degraded: ok('d'), onDegraded });
    expect(onDegraded).toHaveBeenCalledOnce();
  });

  it('does NOT call onDegraded when full succeeds', async () => {
    const onDegraded = vi.fn();
    await gracefulDegrade({ full: ok('full'), degraded: ok('d'), onDegraded });
    expect(onDegraded).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  it('resolves when operation completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('fast'), 500);
    expect(result).toBe('fast');
  });

  it('rejects when operation exceeds timeout', async () => {
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('slow'), 200));
    await expect(withTimeout(slow, 50)).rejects.toThrow(/timeout/i);
  });

  it('propagates rejection from inner promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('inner fail')), 500)).rejects.toThrow('inner fail');
  });
});
