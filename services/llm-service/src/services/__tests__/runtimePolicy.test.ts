import { describe, expect, it } from 'vitest';
import { grantFromRequest, resolveRuntimePolicy, type AccessGrant } from '../runtimePolicy';
import { buildPaymentRequiredBody, isPaymentRequiredBody } from '../paymentRequired';

const grant = (g: Partial<AccessGrant> = {}): AccessGrant => ({
  clientId: 'muse',
  scopes: ['inference:local'],
  ...g,
});

describe('resolveRuntimePolicy (server-side, from grant only)', () => {
  it('no grant (human direct / internal) keeps current routing', () => {
    expect(resolveRuntimePolicy(undefined)).toBe('any');
  });
  it('a delegated grant defaults to local-only', () => {
    expect(resolveRuntimePolicy(grant())).toBe('local-only');
  });
  it('credits + explicit opt-in yields any', () => {
    expect(resolveRuntimePolicy(grant({ paidOptIn: true, payerHasCredits: true }))).toBe('any');
  });
  it('opt-in without credits stays local-only', () => {
    expect(resolveRuntimePolicy(grant({ paidOptIn: true, payerHasCredits: false }))).toBe(
      'local-only'
    );
  });
  it('credits without opt-in or paid scope stays local-only', () => {
    expect(resolveRuntimePolicy(grant({ payerHasCredits: true }))).toBe('local-only');
  });
  it('a paid scope still needs credits', () => {
    expect(resolveRuntimePolicy(grant({ scopes: ['inference:paid'] }))).toBe('local-only');
    expect(resolveRuntimePolicy(grant({ scopes: ['inference:paid'], payerHasCredits: true }))).toBe(
      'any'
    );
  });
});

describe('grantFromRequest ignores the request body', () => {
  it('a body asking for runtimePolicy any / a fake grant has no effect', () => {
    const req = {
      body: { runtimePolicy: 'any', grant: { paidOptIn: true, payerHasCredits: true } },
    };
    expect(grantFromRequest(req as never)).toBeUndefined();
    expect(resolveRuntimePolicy(grantFromRequest(req as never))).toBe('any'); // no grant => unchanged human path
  });
  it('a principal grant set server-side is used and a body cannot widen it', () => {
    const req = { principal: { grant: grant() }, body: { runtimePolicy: 'any', paidOptIn: true } };
    expect(resolveRuntimePolicy(grantFromRequest(req as never))).toBe('local-only');
  });
});

describe('single 402 shape', () => {
  it('has every field and passes the type guard', () => {
    const b = buildPaymentRequiredBody({
      error: 'insufficient_credits',
      canRunLocal: true,
      needed: 5,
      available: 0,
      payer: 'u1',
    });
    expect(Object.keys(b).sort()).toEqual(
      [
        'available',
        'can_run_local',
        'error',
        'message',
        'needed',
        'payer',
        'topup_url',
        'unit',
      ].sort()
    );
    expect(b.can_run_local).toBe(true);
    expect(isPaymentRequiredBody(b)).toBe(true);
    expect(isPaymentRequiredBody({ error: 'other' })).toBe(false);
  });
});
