/**
 * POST /api/credits/check without a credit ledger.
 *
 * http-server answered { ok: true, balance: Infinity } whenever no Postgres
 * pool existed — in every environment — so a production deploy without
 * DATABASE_URL waved every paid operation through. Production must refuse.
 */
import { describe, expect, it } from 'vitest';
import { creditCheckWithoutLedger } from '../consumer-spend-guard';

describe('creditCheckWithoutLedger', () => {
  it('production: refuses with 503 and never reports ok', () => {
    const r = creditCheckWithoutLedger(25, { NODE_ENV: 'production' });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.balance).toBeUndefined();
    expect(r.body.required).toBe(25);
  });

  it('local development: keeps the documented graceful degradation', () => {
    const r = creditCheckWithoutLedger(25, { NODE_ENV: 'development' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.required).toBe(25);
  });
});
