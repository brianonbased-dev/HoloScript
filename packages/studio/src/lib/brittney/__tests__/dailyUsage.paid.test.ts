/**
 * Brittney's paid fallback ceiling (founder sheet line "answers-always"): the
 * paid model may answer only while the day's paid cost for everyone is under
 * the ceiling, nothing is spent when the total cannot be read, and every paid
 * answer's billed cost is added to both the person's row and the day's total.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: null as unknown,
  cost: new Map<string, number>(),
  paid: new Map<string, number>(),
  failScopes: new Set<string>(),
  readFails: false,
}));

vi.mock('@/db/client', () => ({ getDb: () => h.db }));

import {
  EVERYONE,
  PAID_DAILY_CEILING_USD,
  paidFallbackOpen,
  recordPaidAnswer,
  utcDay,
} from '../dailyUsage';

/** Every string inside a drizzle predicate, to learn which (scope, day) it asks for. */
function strings(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || node == null) return out;
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out, depth + 1));
  else if (typeof node === 'object')
    Object.values(node as object).forEach((n) => strings(n, out, depth + 1));
  return out;
}

function fakeDb() {
  return {
    select: () => ({
      from: () => ({
        where: (pred: unknown) => ({
          limit: async () => {
            if (h.readFails) throw new Error('read refused');
            const s = strings(pred);
            const day = s.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) ?? '';
            const scope = s.includes(EVERYONE) ? EVERYONE : '';
            const key = `${scope}|${day}`;
            return h.cost.has(key) ? [{ cost: h.cost.get(key) }] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: { scope: string; day: string; paidCostMicroUsd: number }) => ({
        onConflictDoUpdate: async () => {
          if (h.failScopes.has(v.scope)) throw new Error(`write refused for ${v.scope}`);
          const key = `${v.scope}|${v.day}`;
          h.cost.set(key, (h.cost.get(key) ?? 0) + v.paidCostMicroUsd);
          h.paid.set(key, (h.paid.get(key) ?? 0) + 1);
        },
      }),
    }),
  };
}

const NOON = new Date('2026-09-28T12:00:00Z');
const TODAY = utcDay(NOON);

beforeEach(() => {
  h.cost.clear();
  h.paid.clear();
  h.failScopes.clear();
  h.readFails = false;
  h.db = fakeDb();
});

describe('the paid fallback’s daily ceiling', () => {
  it('is open under the ceiling and closed at it', async () => {
    expect(PAID_DAILY_CEILING_USD).toBe(10);
    expect(await paidFallbackOpen(NOON)).toBe(true);

    h.cost.set(`${EVERYONE}|${TODAY}`, 9_999_999);
    expect(await paidFallbackOpen(NOON)).toBe(true);
    h.cost.set(`${EVERYONE}|${TODAY}`, 10_000_000);
    expect(await paidFallbackOpen(NOON)).toBe(false);
  });

  it('spends nothing it cannot count: no database, or a failed read, is closed', async () => {
    h.db = null;
    expect(await paidFallbackOpen(NOON)).toBe(false);
    h.db = fakeDb();
    h.readFails = true;
    expect(await paidFallbackOpen(NOON)).toBe(false);
  });

  it('adds each paid answer’s cost to the person and to the day’s total', async () => {
    await recordPaidAnswer('person-1', 0.0421, NOON);
    await recordPaidAnswer('person-2', 0.0012344, NOON);

    expect(h.cost.get(`person-1|${TODAY}`)).toBe(42_100);
    expect(h.cost.get(`person-2|${TODAY}`)).toBe(1_234);
    expect(h.cost.get(`${EVERYONE}|${TODAY}`)).toBe(43_334);
    expect(h.paid.get(`${EVERYONE}|${TODAY}`)).toBe(2);
    // A negative or broken cost is never subtracted.
    await recordPaidAnswer('person-1', -5, NOON);
    expect(h.cost.get(`${EVERYONE}|${TODAY}`)).toBe(43_334);
  });

  it('still adds to the day’s total when the person’s row cannot be written', async () => {
    h.failScopes.add('person-1');
    await recordPaidAnswer('person-1', 0.5, NOON);
    expect(h.cost.get(`${EVERYONE}|${TODAY}`)).toBe(500_000);
  });

  it('closes once the day’s paid answers reach the ceiling', async () => {
    for (let i = 0; i < 99; i += 1) await recordPaidAnswer('person-1', 0.1, NOON);
    expect(await paidFallbackOpen(NOON)).toBe(true);
    await recordPaidAnswer('person-2', 0.1, NOON);
    expect(await paidFallbackOpen(NOON)).toBe(false);
    // A new UTC day starts over.
    expect(await paidFallbackOpen(new Date('2026-09-29T00:00:01Z'))).toBe(true);
  });
});
