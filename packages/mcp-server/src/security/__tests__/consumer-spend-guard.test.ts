/**
 * Unit tests for the global (cross-IP) daily spend guard used by
 * POST /api/public/generate (see ../consumer-spend-guard.ts and the
 * wiring in http-server.ts).
 *
 * Mocks '../../holomesh/state' so these tests exercise the REAL
 * consumer-spend-guard.ts logic (day-key computation, cap arithmetic,
 * fail-closed try/catch, receipt shape) against a controllable fake
 * append-only store, not against real Postgres.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// In-memory fake backing the mocked stateStore -- mirrors the real
// StateStoreBackend surface area this module actually uses (append/getAll/delete).
const fakeStore = new Map<string, unknown[]>();

function fakeKey(namespace: string, handle: string): string {
  return `${namespace}:${handle}`;
}

const appendMock = vi.fn(async (namespace: string, handle: string, data: unknown) => {
  const key = fakeKey(namespace, handle);
  const list = fakeStore.get(key) || [];
  list.push(data);
  fakeStore.set(key, list);
});

const getAllMock = vi.fn(async (namespace: string, handle: string) => {
  return [...(fakeStore.get(fakeKey(namespace, handle)) || [])];
});

const deleteMock = vi.fn(async (namespace: string, handle: string) => {
  fakeStore.delete(fakeKey(namespace, handle));
});

vi.mock('../../holomesh/state', () => ({
  stateStore: {
    append: (...args: [string, string, unknown]) => appendMock(...args),
    getAll: (...args: [string, string]) => getAllMock(...args),
    delete: (...args: [string, string]) => deleteMock(...args),
  },
}));

import {
  checkConsumerGlobalSpendCap,
  recordConsumerGeneration,
  utcDayKey,
  __resetConsumerSpendGuardForTests,
} from '../consumer-spend-guard';

describe('consumer-spend-guard', () => {
  const ORIGINAL_ENV = process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP;

  beforeEach(() => {
    fakeStore.clear();
    appendMock.mockClear();
    getAllMock.mockClear();
    deleteMock.mockClear();
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
    it('defaults the cap to 200 when the env var is unset', async () => {
      const result = await checkConsumerGlobalSpendCap();
      expect(result.capValue).toBe(200);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(200);
    });
  });

  describe('cap enforcement', () => {
    it('allows up to the cap then blocks the next call', async () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '3';

      // Consume the full budget via the same allow-then-record pattern the
      // real handler uses (check, then record only on success).
      for (let i = 0; i < 3; i++) {
        const check = await checkConsumerGlobalSpendCap();
        expect(check.allowed).toBe(true);
        await recordConsumerGeneration();
      }

      const exhausted = await checkConsumerGlobalSpendCap();
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.remaining).toBe(0);
      expect(exhausted.capValue).toBe(3);
    });

    it('honors a custom cap from the environment', async () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '5';
      const result = await checkConsumerGlobalSpendCap();
      expect(result.capValue).toBe(5);
      expect(result.remaining).toBe(5);
    });

    it('falls back to the default when the env var is not a valid positive integer', async () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = 'not-a-number';
      expect((await checkConsumerGlobalSpendCap()).capValue).toBe(200);

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '-5';
      expect((await checkConsumerGlobalSpendCap()).capValue).toBe(200);

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '0';
      expect((await checkConsumerGlobalSpendCap()).capValue).toBe(200);
    });
  });

  describe('check does not append (pure check)', () => {
    it('calling checkConsumerGlobalSpendCap repeatedly never calls stateStore.append', async () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '2';

      for (let i = 0; i < 10; i++) {
        const result = await checkConsumerGlobalSpendCap();
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
      }
      expect(appendMock).not.toHaveBeenCalled();

      // Now actually record one generation and confirm it -- and only it --
      // decremented the budget (via a real append).
      await recordConsumerGeneration();
      expect(appendMock).toHaveBeenCalledTimes(1);
      expect((await checkConsumerGlobalSpendCap()).remaining).toBe(1);
    });
  });

  describe('recordConsumerGeneration', () => {
    it('increments the shared bucket count by exactly 1 per call', async () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '10';

      expect((await checkConsumerGlobalSpendCap()).remaining).toBe(10);
      await recordConsumerGeneration();
      expect((await checkConsumerGlobalSpendCap()).remaining).toBe(9);
      await recordConsumerGeneration();
      await recordConsumerGeneration();
      expect((await checkConsumerGlobalSpendCap()).remaining).toBe(7);
    });

    it('returns a receiptId', async () => {
      const { receiptId } = await recordConsumerGeneration();
      expect(typeof receiptId).toBe('string');
      expect(receiptId.length).toBeGreaterThan(0);
    });

    it('calls stateStore.append with namespace "consumer-spend-guard" and the correct UTC day-key handle', async () => {
      await recordConsumerGeneration();
      expect(appendMock).toHaveBeenCalledTimes(1);
      const [namespace, handle, data] = appendMock.mock.calls[0];
      expect(namespace).toBe('consumer-spend-guard');
      expect(handle).toBe(utcDayKey());
      expect(data).toMatchObject({
        event: 'consumer_generation',
        receiptId: expect.any(String),
        timestamp: expect.any(String),
      });
    });

    it('does NOT throw when the mocked append rejects, and still returns a receiptId', async () => {
      appendMock.mockImplementationOnce(async () => {
        throw new Error('durable write failed');
      });

      const result = await recordConsumerGeneration();
      expect(typeof result.receiptId).toBe('string');
      expect(result.receiptId.length).toBeGreaterThan(0);
    });
  });

  describe('fail-closed behavior', () => {
    it('checkConsumerGlobalSpendCap returns allowed:false (never throws) when getAll rejects', async () => {
      getAllMock.mockImplementationOnce(async () => {
        throw new Error('durable read failed');
      });

      const result = await checkConsumerGlobalSpendCap();
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(typeof result.resetAt).toBe('number');
    });
  });

  describe('reset boundary (UTC day-key)', () => {
    it('resets the budget once the UTC day-key rolls over', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '2';

      await recordConsumerGeneration();
      await recordConsumerGeneration();
      const exhausted = await checkConsumerGlobalSpendCap();
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.resetAt).toBe(new Date('2026-01-02T00:00:00.000Z').getTime());

      // Advance into the next UTC day -- a fresh day-key handle, so the
      // receipt log for that handle is empty.
      vi.setSystemTime(new Date('2026-01-02T00:00:01.000Z'));

      const afterReset = await checkConsumerGlobalSpendCap();
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(2);
    });

    it('does not reset before the UTC day boundary has elapsed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '1';

      await recordConsumerGeneration();
      expect((await checkConsumerGlobalSpendCap()).allowed).toBe(false);

      // Advance time, but stay inside the same UTC day.
      vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      expect((await checkConsumerGlobalSpendCap()).allowed).toBe(false);
    });
  });

  describe('test reset helper', () => {
    it('__resetConsumerSpendGuardForTests clears accumulated state', async () => {
      process.env.HOLOSCRIPT_CONSUMER_GLOBAL_DAILY_CALL_CAP = '1';
      await recordConsumerGeneration();
      expect((await checkConsumerGlobalSpendCap()).allowed).toBe(false);

      await __resetConsumerSpendGuardForTests();
      expect((await checkConsumerGlobalSpendCap()).allowed).toBe(true);
      expect((await checkConsumerGlobalSpendCap()).remaining).toBe(1);
    });
  });
});
