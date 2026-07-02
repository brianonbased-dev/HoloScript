/**
 * Unit tests for the global (cross-IP) daily spend guard used by
 * POST /api/public/generate (see ../consumer-spend-guard.ts and the
 * wiring in http-server.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkConsumerGlobalSpendCap,
  recordConsumerGeneration,
  __resetConsumerSpendGuardForTests,
} from '../consumer-spend-guard';

describe('consumer-spend-guard', () => {
  const ORIGINAL_ENV = process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP;

  beforeEach(() => {
    __resetConsumerSpendGuardForTests();
    delete process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP;
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP;
    } else {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = ORIGINAL_ENV;
    }
    vi.useRealTimers();
  });

  describe('default cap', () => {
    it('defaults the cap to 200 when the env var is unset', () => {
      const result = checkConsumerGlobalSpendCap();
      expect(result.capValue).toBe(200);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(200);
    });
  });

  describe('cap enforcement', () => {
    it('allows up to the cap then blocks the next call', () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '3';

      // Consume the full budget via the same allow-then-record pattern the
      // real handler uses (check, then record only on success).
      for (let i = 0; i < 3; i++) {
        const check = checkConsumerGlobalSpendCap();
        expect(check.allowed).toBe(true);
        recordConsumerGeneration();
      }

      const exhausted = checkConsumerGlobalSpendCap();
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.remaining).toBe(0);
      expect(exhausted.capValue).toBe(3);
    });

    it('honors a custom cap from the environment', () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '5';
      const result = checkConsumerGlobalSpendCap();
      expect(result.capValue).toBe(5);
      expect(result.remaining).toBe(5);
    });

    it('falls back to the default when the env var is not a valid positive integer', () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = 'not-a-number';
      expect(checkConsumerGlobalSpendCap().capValue).toBe(200);

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '-5';
      __resetConsumerSpendGuardForTests();
      expect(checkConsumerGlobalSpendCap().capValue).toBe(200);

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '0';
      __resetConsumerSpendGuardForTests();
      expect(checkConsumerGlobalSpendCap().capValue).toBe(200);
    });
  });

  describe('check does not increment (pure check)', () => {
    it('calling checkConsumerGlobalSpendCap repeatedly never consumes budget on its own', () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '2';

      // Call the pure check many times -- remaining must stay at the full cap.
      for (let i = 0; i < 10; i++) {
        const result = checkConsumerGlobalSpendCap();
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
      }

      // Now actually record one generation and confirm it -- and only it --
      // decremented the budget.
      recordConsumerGeneration();
      expect(checkConsumerGlobalSpendCap().remaining).toBe(1);
    });
  });

  describe('recordConsumerGeneration', () => {
    it('increments the shared bucket count by exactly 1 per call', () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '10';

      expect(checkConsumerGlobalSpendCap().remaining).toBe(10);
      recordConsumerGeneration();
      expect(checkConsumerGlobalSpendCap().remaining).toBe(9);
      recordConsumerGeneration();
      recordConsumerGeneration();
      expect(checkConsumerGlobalSpendCap().remaining).toBe(7);
    });
  });

  describe('reset-window rollover', () => {
    it('resets the bucket once resetAt has passed', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '2';
      __resetConsumerSpendGuardForTests();

      recordConsumerGeneration();
      recordConsumerGeneration();
      const exhausted = checkConsumerGlobalSpendCap();
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.resetAt).toBe(new Date('2026-01-02T00:00:00.000Z').getTime());

      // Advance time past the 24h window.
      vi.setSystemTime(new Date('2026-01-02T00:00:01.000Z'));

      const afterReset = checkConsumerGlobalSpendCap();
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(2);
    });

    it('does not reset before the window has elapsed', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '1';
      __resetConsumerSpendGuardForTests();

      recordConsumerGeneration();
      expect(checkConsumerGlobalSpendCap().allowed).toBe(false);

      // Advance time, but stay inside the 24h window.
      vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      expect(checkConsumerGlobalSpendCap().allowed).toBe(false);
    });
  });

  describe('test reset helper', () => {
    it('__resetConsumerSpendGuardForTests clears accumulated state', () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '1';
      recordConsumerGeneration();
      expect(checkConsumerGlobalSpendCap().allowed).toBe(false);

      __resetConsumerSpendGuardForTests();
      expect(checkConsumerGlobalSpendCap().allowed).toBe(true);
      expect(checkConsumerGlobalSpendCap().remaining).toBe(1);
    });
  });
});
