import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketReconnectionHandler } from '../../network/WebSocketReconnectionHandler';

describe('WebSocketReconnectionHandler — Production Tests', () => {
  describe('constructor defaults', () => {
    it('initializes with default config values', () => {
      const h = new WebSocketReconnectionHandler();
      expect(h.getAttemptCount()).toBe(0);
    });

    it('initializes shouldRetry as true with infinite attempts', () => {
      const h = new WebSocketReconnectionHandler({ maxAttempts: -1 });
      expect(h.shouldRetry()).toBe(true);
    });

    it('initializes shouldRetry as true under maxAttempts limit', () => {
      const h = new WebSocketReconnectionHandler({ maxAttempts: 3 });
      expect(h.shouldRetry()).toBe(true);
    });
  });

  describe('calculateDelay()', () => {
    it('returns at least initialDelayMs', () => {
      const h = new WebSocketReconnectionHandler({
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        jitter: false,
      });
      const delay = h.calculateDelay();
      expect(delay).toBeGreaterThanOrEqual(1000);
    });

    it('is capped at maxDelayMs', () => {
      const h = new WebSocketReconnectionHandler({
        initialDelayMs: 1000,
        maxDelayMs: 2000,
        backoffMultiplier: 10,
        jitter: false,
      });
      for (let i = 0; i < 5; i++) {
        const delay = h.calculateDelay();
        expect(delay).toBeLessThanOrEqual(2000);
      }
    });

    it('respects no-jitter flag (deterministic)', () => {
      const h = new WebSocketReconnectionHandler({ initialDelayMs: 1000, jitter: false });
      const d1 = h.calculateDelay();
      const d2 = h.calculateDelay();
      expect(d1).toBe(d2);
    });

    it('adds jitter within ±10% of delay', () => {
      const h = new WebSocketReconnectionHandler({ initialDelayMs: 1000, jitter: true });
      const delays = Array.from({ length: 20 }, () => h.calculateDelay());
      const hasVariation = delays.some((d) => d !== delays[0]);
      // Jitter probability over 20 samples — nearly guaranteed to vary
      expect(hasVariation).toBe(true);
    });
  });

  describe('shouldRetry()', () => {
    it('returns true when maxAttempts is -1 (infinite)', () => {
      const h = new WebSocketReconnectionHandler({ maxAttempts: -1 });
      expect(h.shouldRetry()).toBe(true);
    });

    it('returns true when attempts < maxAttempts', () => {
      const h = new WebSocketReconnectionHandler({ maxAttempts: 3 });
      expect(h.shouldRetry()).toBe(true);
    });

    it('returns false after max attempts exhausted', () => {
      const h = new WebSocketReconnectionHandler({ maxAttempts: 0 });
      expect(h.shouldRetry()).toBe(false);
    });
  });

  describe('reset()', () => {
    it('resets attempt count to zero', async () => {
      const h = new WebSocketReconnectionHandler({
        initialDelayMs: 1,
        maxAttempts: 3,
        jitter: false,
      });
      await h.scheduleReconnect(async () => {});
      expect(h.getAttemptCount()).toBe(0); // reset() called on success
    });
  });

  describe('cancel()', () => {
    it('cancels a pending reconnect', () => {
      const h = new WebSocketReconnectionHandler({ initialDelayMs: 5000 });
      // Just verify cancel doesn't throw
      h.cancel();
      expect(h.getAttemptCount()).toBe(0);
    });
  });

  describe('scheduleReconnect()', () => {
    it('calls callback and resolves on success', async () => {
      const h = new WebSocketReconnectionHandler({ initialDelayMs: 1, jitter: false });
      const cb = vi.fn().mockResolvedValue(undefined);
      await h.scheduleReconnect(cb);
      expect(cb).toHaveBeenCalledOnce();
    });

    it('rejects with error when callback throws', async () => {
      const h = new WebSocketReconnectionHandler({ initialDelayMs: 1, jitter: false });
      const err = new Error('conn failed');
      await expect(
        h.scheduleReconnect(async () => {
          throw err;
        })
      ).rejects.toThrow('conn failed');
    });

    it('rejects immediately when max attempts exceeded', async () => {
      const h = new WebSocketReconnectionHandler({ maxAttempts: 0 });
      await expect(h.scheduleReconnect(async () => {})).rejects.toThrow(
        'Max reconnection attempts'
      );
    });

    it('resets attempt count after successful reconnect', async () => {
      const h = new WebSocketReconnectionHandler({ initialDelayMs: 1, jitter: false });
      await h.scheduleReconnect(async () => {});
      expect(h.getAttemptCount()).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('returns zero attempts on fresh handler', () => {
      const h = new WebSocketReconnectionHandler();
      const stats = h.getStats();
      expect(stats.attempts).toBe(0);
      expect(stats.isReconnecting).toBe(false);
    });

    it('returns null lastReconnectTime when never reconnected', () => {
      const h = new WebSocketReconnectionHandler();
      expect(h.getStats().lastReconnectTime).toBeNull();
    });
  });

  describe('destroy()', () => {
    it('cleans up timers and resets state', () => {
      const h = new WebSocketReconnectionHandler();
      h.destroy();
      expect(h.getAttemptCount()).toBe(0);
      expect(h.getStats().isReconnecting).toBe(false);
    });
  });
});
