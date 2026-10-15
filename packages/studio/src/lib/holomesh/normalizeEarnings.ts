/**
 * normalizeEarnings - coerce the /api/holomesh/dashboard/earnings payload into
 * numbers the UI can format. The endpoint can answer with an error body
 * ({ error }), a wrapper ({ earnings: {...} }) or a partial object; rendering
 * those raw produced "$NaN" revenue and "undefined" sales on /agents/me
 * (Creator Advocate audit 2026-10-14, item 4).
 */

export interface EarningsEntry {
  entryId: string;
  entryType?: string;
  domain?: string;
  sales: number;
  revenueCents: number;
}

export interface NormalizedEarnings {
  totalRevenueCents: number;
  totalSales: number;
  uniqueBuyers: number;
  totalSpentCents: number;
  totalPurchases: number;
  byEntry: EarningsEntry[];
  byDomain: Record<string, number>;
}

const NUMERIC_KEYS = [
  'totalRevenueCents',
  'totalSales',
  'uniqueBuyers',
  'totalSpentCents',
  'totalPurchases',
] as const;

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns null when the payload carries no earnings at all (e.g. an error body). */
export function normalizeEarnings(raw: unknown): NormalizedEarnings | null {
  if (!isRecord(raw)) return null;
  const src = isRecord(raw.earnings) ? raw.earnings : raw;
  const hasAny =
    NUMERIC_KEYS.some((k) => k in src) || Array.isArray(src.byEntry) || isRecord(src.byDomain);
  if (!hasAny) return null;

  const byEntry: EarningsEntry[] = Array.isArray(src.byEntry)
    ? src.byEntry.filter(isRecord).map((e) => ({
        entryId: String(e.entryId ?? ''),
        ...(typeof e.entryType === 'string' ? { entryType: e.entryType } : {}),
        ...(typeof e.domain === 'string' ? { domain: e.domain } : {}),
        sales: num(e.sales),
        revenueCents: num(e.revenueCents),
      }))
    : [];
  const byDomain: Record<string, number> = {};
  if (isRecord(src.byDomain)) {
    for (const [k, v] of Object.entries(src.byDomain)) byDomain[k] = num(v);
  }
  return {
    totalRevenueCents: num(src.totalRevenueCents),
    totalSales: num(src.totalSales),
    uniqueBuyers: num(src.uniqueBuyers),
    totalSpentCents: num(src.totalSpentCents),
    totalPurchases: num(src.totalPurchases),
    byEntry,
    byDomain,
  };
}