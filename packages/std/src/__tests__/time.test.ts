import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { now, hrTime, sleep, withTimeout } from '../time.js';

describe('now', () => {
  it('should return current timestamp in milliseconds', () => {
    const before = Date.now();
    const result = now();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should return a number', () => {
    expect(typeof now()).toBe('number');
  });
});

describe('hrTime', () => {
  it('should return high-resolution timestamp', () => {
    const result = hrTime();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('should increase over time', async () => {
    const t1 = hrTime();
    await sleep(10);
    const t2 = hrTime();
    expect(t2).toBeGreaterThan(t1);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return a promise', () => {
    const result = sleep(100);
    expect(result).toBeInstanceOf(Promise);
    vi.runAllTimers();
  });

  it('should resolve after specified time', async () => {
    let resolved = false;
    const promise = sleep(1000).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(500);
    await promise;
    expect(resolved).toBe(true);
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve if function completes before timeout', async () => {
    const fn = async () => {
      await sleep(50);
      return 'success';
    };

    const promise = withTimeout(fn, 1000);
    vi.advanceTimersByTime(50);
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should reject with Timeout error if function takes too long', async () => {
    const fn = async () => {
      await sleep(2000);
      return 'success';
    };

    const promise = withTimeout(fn, 100);
    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('Timeout');
  });
});

describe('time utilities - real timers', () => {
  it('sleep should actually wait (short duration)', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
  });
});
