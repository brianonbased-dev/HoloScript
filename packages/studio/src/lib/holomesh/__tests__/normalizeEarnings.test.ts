import { describe, it, expect } from 'vitest';
import { normalizeEarnings } from '../normalizeEarnings';

describe('normalizeEarnings (audit item 4)', () => {
  it('returns null for an error body or non-object', () => {
    expect(normalizeEarnings({ error: 'upstream unavailable' })).toBeNull();
    expect(normalizeEarnings(null)).toBeNull();
    expect(normalizeEarnings('oops')).toBeNull();
  });
  it('unwraps { earnings } and fills missing numbers with 0', () => {
    const e = normalizeEarnings({ earnings: { byDomain: {} } });
    expect(e).not.toBeNull();
    expect(e!.totalRevenueCents).toBe(0);
    expect(e!.totalSales).toBe(0);
    expect(Number.isNaN(e!.totalSpentCents)).toBe(false);
  });
  it('coerces numeric strings and drops NaN', () => {
    const e = normalizeEarnings({ totalRevenueCents: '1250', totalSales: 'x', byDomain: { art: '300', bad: 'n' } });
    expect(e!.totalRevenueCents).toBe(1250);
    expect(e!.totalSales).toBe(0);
    expect(e!.byDomain).toEqual({ art: 300, bad: 0 });
  });
  it('keeps a well-formed payload', () => {
    const e = normalizeEarnings({
      totalRevenueCents: 500, totalSales: 3, uniqueBuyers: 2, totalSpentCents: 100, totalPurchases: 1,
      byEntry: [{ entryId: 'k1', domain: 'art', sales: 3, revenueCents: 500 }], byDomain: { art: 500 },
    });
    expect(e).toEqual({
      totalRevenueCents: 500, totalSales: 3, uniqueBuyers: 2, totalSpentCents: 100, totalPurchases: 1,
      byEntry: [{ entryId: 'k1', domain: 'art', sales: 3, revenueCents: 500 }], byDomain: { art: 500 },
    });
  });
});