/**
 * The credit routes' answer when there is no credit ledger.
 *
 * http-server answered "ok" whenever no Postgres pool existed — in every
 * environment: POST /api/credits/check said { ok: true, balance: Infinity } and
 * POST /api/credits/deduct said { ok: true, cost } without recording anything.
 * A production deploy without DATABASE_URL therefore waved every paid
 * operation through. Production must refuse on both routes.
 *
 * This file covers the helper's answer only. The route wiring is covered by
 * src/__tests__/credit-routes-without-ledger.test.ts, which drives the real
 * http-server request listener.
 */
import { describe, expect, it } from 'vitest';
import { creditRouteWithoutLedger } from '../consumer-spend-guard';

describe('creditRouteWithoutLedger', () => {
  it('check, production: refuses with 503 and never reports ok', () => {
    const r = creditRouteWithoutLedger('check', 25, { NODE_ENV: 'production' });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.balance).toBeUndefined();
    expect(r.body.required).toBe(25);
  });

  it('deduct, production: refuses with 503 and never reports a recorded cost', () => {
    const r = creditRouteWithoutLedger('deduct', 25, { NODE_ENV: 'production' });
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.cost).toBeUndefined();
    expect(r.body.required).toBe(25);
    expect(String(r.body.message)).toMatch(/Nothing was recorded/);
  });

  it('check, local development: keeps the documented graceful degradation', () => {
    const r = creditRouteWithoutLedger('check', 25, { NODE_ENV: 'development' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.required).toBe(25);
  });

  it('deduct, local development: keeps the documented graceful degradation', () => {
    const r = creditRouteWithoutLedger('deduct', 25, { NODE_ENV: 'development' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.cost).toBe(25);
  });
});
