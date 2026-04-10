/**
 * Circuit Breaker Tests
 */

import { describe, it, expect } from 'vitest';
import { CircuitBreaker, ExponentialBackoff } from '../utils/circuitBreaker';

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('should open on threshold failures', async () => {
    const cb = new CircuitBreaker({
      threshold: 0.5,
      minimumRequests: 2,
    });

    // Simulate failures
    try {
      await cb.execute(async () => {
        throw new Error('Failure 1');
      });
    } catch (e) {
      // Expected
    }

    try {
      await cb.execute(async () => {
        throw new Error('Failure 2');
      });
    } catch (e) {
      // Expected
    }

    // Circuit should be open now
    expect(cb.getState()).toBe('open');
  });

  it('should track failure rate', async () => {
    const cb = new CircuitBreaker();

    // Success
    await cb.execute(async () => 'success');

    // Failure
    try {
      await cb.execute(async () => {
        throw new Error('fail');
      });
    } catch (e) {
      // Expected
    }

    const status = cb.getStatus();
    expect(status.failureRate).toBeGreaterThan(0);
    expect(status.failureRate).toBeLessThan(1);
  });

  it('should reset circuit', async () => {
    const cb = new CircuitBreaker({ minimumRequests: 1 });

    // Cause failure
    try {
      await cb.execute(async () => {
        throw new Error('fail');
      });
    } catch (e) {
      // Expected
    }

    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getStatus().failureCount).toBe(0);
  });
});

describe('ExponentialBackoff', () => {
  it('should calculate exponential delays', () => {
    const backoff = new ExponentialBackoff(1000, 60000, 5);

    const delays = [];
    for (let i = 0; i < 5; i++) {
      delays.push(backoff.getNextDelay());
    }

    // Each delay should be roughly double the previous (with jitter)
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  it('should respect max delay', () => {
    const backoff = new ExponentialBackoff(1000, 5000, 10);

    for (let i = 0; i < 10; i++) {
      const delay = backoff.getNextDelay();
      expect(delay).toBeLessThanOrEqual(5000 * 1.25); // Account for jitter
    }
  });

  it('should throw when max attempts reached', () => {
    const backoff = new ExponentialBackoff(1000, 60000, 3);

    backoff.getNextDelay();
    backoff.getNextDelay();
    backoff.getNextDelay();

    expect(() => backoff.getNextDelay()).toThrow('Max retry attempts reached');
  });

  it('should reset attempt counter', () => {
    const backoff = new ExponentialBackoff(1000, 60000, 5);

    backoff.getNextDelay();
    backoff.getNextDelay();
    expect(backoff.getCurrentAttempt()).toBe(2);

    backoff.reset();
    expect(backoff.getCurrentAttempt()).toBe(0);
  });
});
