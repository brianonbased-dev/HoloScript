/**
 * Credit purchase fails closed without a payment provider.
 *
 * On 2026-09-15 absorb-service ran in production with STRIPE_SECRET_KEY set but
 * EMPTY. The purchase route treated that as "development mode" and granted the
 * requested credits (up to 100,000 cents per call) to any signed-in caller with
 * no payment. These tests pin the refusal. Uses the mock req/res pattern of
 * admin.test.ts (no supertest).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

interface CheckoutParams {
  metadata: Record<string, string>;
}

const mocks = vi.hoisted(() => ({
  addCredits: vi.fn(
    async (_userId: string, _amountCents: number, _description: string, _opts?: unknown) => ({
      balanceCents: 0,
    })
  ),
  stripeCtor: vi.fn((_key: string) => undefined),
  sessionsCreate: vi.fn(async (_params: CheckoutParams) => ({
    id: 'cs_test_1',
    url: 'https://checkout.example/cs_test_1',
  })),
  sessionsRetrieve: vi.fn(async (_id: string) => ({
    payment_status: 'paid',
    metadata: { amountCents: '500' },
  })),
  getSubscription: vi.fn(async (_userId: string) => null as null | Record<string, unknown>),
  portalCreate: vi.fn(async (_p: Record<string, unknown>) => ({ url: 'https://billing.example/p_1' })),
  configList: vi.fn(async (_p: Record<string, unknown>) => ({ data: [] as Array<{ id: string; metadata?: Record<string, string> }> })),
  configCreate: vi.fn(async (_p: Record<string, unknown>) => ({ id: 'bpc_new' })),
  customersCreate: vi.fn(async (_p: Record<string, unknown>) => ({ id: 'cus_new' })),
  subscriptionsList: vi.fn(async (_p: Record<string, unknown>) => ({
    data: [] as Array<Record<string, unknown>>,
  })),
  recordSubscription: vi.fn(async (_u: string, _s: Record<string, unknown>) => ({ tier: 'pro', recorded: true })),
  ensureCustomer: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

// CREDIT_PACKAGES is the REAL table on purpose. The prices are the thing under
// test: a mocked package list would let the contract test pass against numbers
// no customer is ever shown, which is the same blindness these tests exist to
// close.
vi.mock('@holoscript/absorb-service/credits', async () => {
  const actual = await vi.importActual<typeof import('@holoscript/absorb-service/credits')>(
    '@holoscript/absorb-service/credits'
  );
  // A faithful stand-in for the database-backed ensureSubscriptionCustomer: the
  // stored customer when its row is in this Stripe mode, else a new one.
  mocks.ensureCustomer.mockImplementation(
    async (userId: string, opts: { livemode: boolean | null }, create: () => Promise<string>) => {
      const usable = actual.subscriptionInMode(
        (await mocks.getSubscription(userId)) as Parameters<typeof actual.subscriptionInMode>[0],
        opts.livemode
      );
      return usable ? usable.stripeCustomerId : create();
    }
  );
  return {
    CREDIT_PACKAGES: actual.CREDIT_PACKAGES,
    SUBSCRIPTION_PRICING: actual.SUBSCRIPTION_PRICING,
    tierForSubscriptionStatus: actual.tierForSubscriptionStatus,
    stripeKeyLivemode: actual.stripeKeyLivemode,
    subscriptionInMode: actual.subscriptionInMode,
    tierInMode: actual.tierInMode,
    ensureSubscriptionCustomer: mocks.ensureCustomer,
    recordSubscription: mocks.recordSubscription,
    getSubscription: mocks.getSubscription,
    addCredits: mocks.addCredits,
    getOrCreateAccount: vi.fn(),
    checkBalance: vi.fn(),
    getUsageHistory: vi.fn(async () => []),
  };
});

vi.mock('stripe', () => ({
  default: class FakeStripe {
    checkout = { sessions: { create: mocks.sessionsCreate, retrieve: mocks.sessionsRetrieve } };
    customers = { create: mocks.customersCreate };
    subscriptions = { list: mocks.subscriptionsList };
    billingPortal = {
      sessions: { create: mocks.portalCreate },
      configurations: { list: mocks.configList, create: mocks.configCreate },
    };
    constructor(key: string) {
      mocks.stripeCtor(key);
    }
  },
}));

const USER = '11111111-2222-4333-8444-555555555555';

type Handler = (req: Request, res: Response) => Promise<void>;

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> };
}

interface MockRes {
  _status: number;
  _json: Record<string, unknown> | null;
  status(code: number): MockRes;
  json(data: Record<string, unknown>): MockRes;
}

async function handler(method: 'get' | 'post', path: string): Promise<Handler> {
  const { creditsRouter } = await import('./credits.js');
  const stack = (creditsRouter as unknown as { stack: RouteLayer[] }).stack;
  const route = stack.find((l) => l.route?.path === path && l.route.methods[method])?.route;
  if (!route) throw new Error(`no ${method} ${path} route`);
  return route.stack[route.stack.length - 1].handle;
}

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return { body: {}, query: {}, headers: {}, params: {}, ...overrides } as unknown as Request;
}

function mockRes(): MockRes {
  const res: MockRes = {
    _status: 200,
    _json: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      return res;
    },
  };
  return res;
}

async function call(method: 'get' | 'post', path: string, req: Request): Promise<MockRes> {
  const res = mockRes();
  await (await handler(method, path))(req, res as unknown as Response);
  return res;
}

// What the Studio sends since #397: its own Settings page as both return URLs.
const STUDIO_RETURN = {
  successUrl: 'https://holoscript.studio/settings?tab=credits&purchase=success&session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://holoscript.studio/settings?tab=credits&purchase=cancelled',
};

function purchase(reqOverrides: Record<string, unknown> = {}): Promise<MockRes> {
  const { body, ...rest } = reqOverrides as { body?: Record<string, unknown> };
  return call(
    'post',
    '/purchase',
    mockReq({ body: { ...STUDIO_RETURN, ...(body ?? { amountCents: 100000 }) }, userId: USER, ...rest })
  );
}

beforeEach(() => {
  mocks.addCredits.mockClear();
  mocks.stripeCtor.mockClear();
  mocks.sessionsCreate.mockClear();
  mocks.sessionsRetrieve.mockClear();
  mocks.getSubscription.mockReset();
  mocks.getSubscription.mockResolvedValue(null);
  mocks.portalCreate.mockClear();
  mocks.configList.mockClear();
  mocks.configCreate.mockClear();
  mocks.customersCreate.mockClear();
  mocks.subscriptionsList.mockClear();
  mocks.recordSubscription.mockClear();
  mocks.ensureCustomer.mockClear();
  return import('./credits.js').then((m) => m.resetPortalConfigurationCache());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/credits/purchase — no payment provider', () => {
  it('production + STRIPE_SECRET_KEY set but empty: refuses, grants nothing (the live 2026-09-15 state)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const res = await purchase();
    expect(res._status).toBe(503);
    expect(res._json?.error).toBe('Payments not configured');
    expect(mocks.addCredits).not.toHaveBeenCalled();
    expect(mocks.stripeCtor).not.toHaveBeenCalled();
  });

  it('production + whitespace-only key: refuses instead of calling Stripe with a blank key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '   ');
    const res = await purchase();
    expect(res._status).toBe(503);
    expect(mocks.stripeCtor).not.toHaveBeenCalled();
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it('production ignores the dev opt-in: ABSORB_DEV_CREDIT_GRANT=1 still grants nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', undefined);
    vi.stubEnv('ABSORB_DEV_CREDIT_GRANT', '1');
    const res = await purchase();
    expect(res._status).toBe(503);
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it('development without the explicit opt-in also refuses (a missing key alone never grants)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', undefined);
    vi.stubEnv('ABSORB_DEV_CREDIT_GRANT', undefined);
    const res = await purchase();
    expect(res._status).toBe(503);
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it('development with ABSORB_DEV_CREDIT_GRANT=1 keeps the explicit local grant, to the caller uuid', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', undefined);
    vi.stubEnv('ABSORB_DEV_CREDIT_GRANT', '1');
    const res = await purchase({ body: { amountCents: 500 } });
    expect(res._status).toBe(200);
    expect(res._json?.mode).toBe('development');
    expect(mocks.addCredits).toHaveBeenCalledTimes(1);
    expect(mocks.addCredits.mock.calls[0][0]).toBe(USER);
  });
});

describe('POST /api/credits/purchase — with a payment provider', () => {
  it('refuses a caller with no user uuid (service key / orchestrator) before creating a checkout', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    const res = await purchase({ userId: undefined });
    expect(res._status).toBe(403);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe checkout bound to the caller uuid and grants nothing up front', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    const res = await purchase({ body: { amountCents: 500 } });
    expect(res._status).toBe(200);
    expect(res._json?.checkoutUrl).toBe('https://checkout.example/cs_test_1');
    expect(mocks.sessionsCreate).toHaveBeenCalledTimes(1);
    expect(mocks.sessionsCreate.mock.calls[0][0].metadata.userId).toBe(USER);
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });
});

describe('GET /api/credits/success — no payment provider', () => {
  it('production + empty key: does not report a success nobody paid for', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const res = await call('get', '/success', mockReq({ query: { session_id: 'cs_x' } }));
    expect(res._status).toBe(503);
    expect(res._json?.status).toBeUndefined();
  });
});

/**
 * The body the UI actually sends, fed to the validator that actually runs.
 *
 * Both suites were blind to a live contract break for as long as it existed.
 * SettingsView has always posted `{ packageId }`; the purchase schema accepted
 * only `amountCents`; so every click of the four Buy Credits buttons parsed as
 * a ZodError and answered 400. The studio-side test posts the real body but
 * mocks absorb's reply, so it only ever checked the proxy plumbing. The tests
 * here always posted `{ amountCents: 500 }` — a body the UI never sends. Two
 * green suites, one dead button, and neither could see it.
 *
 * The rule these pin: a contract needs one test that puts the REAL caller's
 * body through the REAL validator. Mocking either end hides exactly this.
 */
describe('POST /api/credits/purchase — the body the UI sends', () => {
  it('accepts { packageId } — the four Buy Credits buttons reach checkout', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');

    const res = await purchase({ body: { packageId: 'starter' } });

    expect(res._status).toBe(200);
    expect(res._json?.error).toBeUndefined();
    expect(mocks.sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("a package's BONUS credits survive checkout: Builder charges $20 and grants 2,500", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');

    await purchase({ body: { packageId: 'builder' } });

    const params = mocks.sessionsCreate.mock.calls[0][0] as unknown as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
      metadata: Record<string, string>;
    };
    // Two numbers, and they must differ — that gap IS the advertised bonus, and
    // it was unrepresentable while one field did both jobs.
    expect(params.line_items[0].price_data.unit_amount).toBe(2000);
    expect(params.metadata.amountCents).toBe('2500');
    expect(params.metadata.pricePaidCents).toBe('2000');
  });

  it('an unknown package refuses rather than charging something else', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');

    const res = await purchase({ body: { packageId: 'not-a-package' } });

    expect(res._status).toBe(400);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('a custom top-up still works, at one credit per cent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');

    await purchase({ body: { amountCents: 500 } });

    const params = mocks.sessionsCreate.mock.calls[0][0] as unknown as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
      metadata: Record<string, string>;
    };
    expect(params.line_items[0].price_data.unit_amount).toBe(500);
    expect(params.metadata.amountCents).toBe('500');
  });

  it('naming both, or neither, is refused — the price must come from one place', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');

    const both = await purchase({ body: { packageId: 'starter', amountCents: 500 } });
    const neither = await purchase({ body: {} });

    expect(both._status).toBe(400);
    expect(neither._status).toBe(400);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('return URLs: the Studio, and nowhere else', () => {
  it('passes a Studio URL, and refuses every other address', async () => {
    const { returnUrl } = await import('./credits.js');
    expect(returnUrl(STUDIO_RETURN.successUrl, {})).toBe(STUDIO_RETURN.successUrl);
    for (const url of [
      undefined,
      '',
      'not a url',
      'https://evil.example/phish',
      'http://holoscript.studio/settings',
      'https://holoscript.studio.evil.example/settings',
      'https://holoscript.studio@evil.example/settings',
      'javascript:alert(1)',
    ]) {
      expect(returnUrl(url, {}), String(url)).toBeNull();
    }
  });

  it('ABSORB_RETURN_ORIGINS replaces the Studio, for staging and preview deployments', async () => {
    const { returnUrl } = await import('./credits.js');
    const env = { ABSORB_RETURN_ORIGINS: 'https://staging.holoscript.studio, https://preview.holoscript.dev' };
    expect(returnUrl('https://staging.holoscript.studio/settings?tab=credits', env)).toBe(
      'https://staging.holoscript.studio/settings?tab=credits'
    );
    expect(returnUrl('https://preview.holoscript.dev/x', env)).toBe('https://preview.holoscript.dev/x');
    expect(returnUrl(STUDIO_RETURN.successUrl, env)).toBeNull();
  });

  it('PUBLIC_URL no longer stands in for a missing return URL', async () => {
    const { returnUrl } = await import('./credits.js');
    expect(returnUrl(undefined, { PUBLIC_URL: 'https://absorb.holoscript.net' })).toBeNull();
  });

  it('a purchase with no return URL, or one pointing elsewhere, refuses before any checkout exists', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    for (const body of [
      { packageId: 'starter' },
      { packageId: 'starter', successUrl: 'https://evil.example/ok', cancelUrl: STUDIO_RETURN.cancelUrl },
    ]) {
      const res = await call('post', '/purchase', mockReq({ body, userId: USER }));
      expect(res._status).toBe(400);
      expect(res._json?.error).toBe('Return URL not allowed');
    }
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('a purchase sends Stripe exactly the return URLs the Studio chose', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    await purchase({ body: { packageId: 'starter' } });
    const params = mocks.sessionsCreate.mock.calls[0][0] as unknown as Record<string, string>;
    expect(params.success_url).toBe(STUDIO_RETURN.successUrl);
    expect(params.cancel_url).toBe(STUDIO_RETURN.cancelUrl);
  });

  it("a failure tells the browser only that it failed, never Stripe's own words", async () => {
    // Stripe's messages can name the key's mode and last four characters.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.sessionsCreate.mockRejectedValueOnce(
      Object.assign(new Error('Invalid API Key provided: sk_test_****abcd'), { type: 'StripeAuthenticationError' })
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await purchase({ body: { packageId: 'starter' } });
    expect(res._status).toBe(500);
    expect(JSON.stringify(res._json)).not.toMatch(/sk_|Invalid API Key/);
    // The detail is kept for us, in the server log.
    expect(errors.mock.calls.flat().join(' ')).toMatch(/StripeAuthenticationError/);
    errors.mockRestore();
  });
});

describe('POST /api/credits/subscribe — Studio Pro', () => {
  const subscribe = (overrides: Record<string, unknown> = {}) =>
    call('post', '/subscribe', mockReq({ body: { ...STUDIO_RETURN }, userId: USER, ...overrides }));
  const checkoutParams = () =>
    mocks.sessionsCreate.mock.calls[0][0] as unknown as {
      mode: string;
      line_items: Array<{ price_data: { unit_amount: number; recurring: { interval: string } } }>;
      client_reference_id: string;
      metadata: Record<string, string>;
      subscription_data: { metadata: Record<string, string> };
      customer?: string;
      success_url: string;
    };

  it('refuses a caller with no user, and refuses without a payment provider, before calling Stripe', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    expect((await subscribe({ userId: undefined }))._status).toBe(403);
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const res = await subscribe();
    expect(res._status).toBe(503);
    expect(res._json?.error).toBe('Payments not configured');
    expect(mocks.stripeCtor).not.toHaveBeenCalled();
  });

  it('starts a monthly subscription checkout: $15, recurring, owned by the caller, plan tagged for the webhook', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    const res = await subscribe();
    expect(res._status).toBe(200);
    expect(res._json?.checkoutUrl).toBe('https://checkout.example/cs_test_1');
    const p = checkoutParams();
    expect(p.mode).toBe('subscription');
    expect(p.line_items[0].price_data.unit_amount).toBe(1500);
    expect(p.line_items[0].price_data.recurring.interval).toBe('month');
    expect(p.client_reference_id).toBe(USER);
    expect(p.metadata).toEqual({ userId: USER, plan: 'studio_pro' });
    expect(p.subscription_data.metadata).toEqual({ userId: USER, plan: 'studio_pro' });
    expect(p.success_url).toBe(STUDIO_RETURN.successUrl);
    // Nothing is granted at checkout: the first paid invoice grants the first month.
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it('makes one Stripe customer for the user BEFORE checkout, and the checkout uses it', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    await subscribe();
    expect(mocks.ensureCustomer).toHaveBeenCalledWith(
      USER,
      { plan: 'studio_pro', livemode: false },
      expect.any(Function)
    );
    expect(mocks.customersCreate).toHaveBeenCalledWith({ metadata: { userId: USER } });
    expect(checkoutParams().customer).toBe('cus_new');
  });

  it('refuses a second subscription for someone already on Pro', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.getSubscription.mockResolvedValue({
      status: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      livemode: false,
    });
    const res = await subscribe();
    expect(res._status).toBe(409);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('asks Stripe, not only our row, whether the customer already pays: a slow webhook cannot open a second subscription', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    // The row still says nothing (the first webhook has not arrived), but the
    // customer saved before the first checkout already has a live subscription.
    mocks.getSubscription.mockResolvedValue({
      status: 'none',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
      livemode: false,
    });
    mocks.subscriptionsList.mockResolvedValueOnce({
      data: [
        {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          livemode: false,
          cancel_at_period_end: false,
          cancel_at: null,
          metadata: { userId: USER, plan: 'studio_pro' },
          items: { data: [{ current_period_end: 1_793_000_000 }] },
        },
      ],
    });
    const res = await subscribe();
    expect(res._status).toBe(409);
    expect(mocks.subscriptionsList).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 20 });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
    // The row catches up with what Stripe said.
    expect(mocks.recordSubscription.mock.calls[0][1]).toMatchObject({ stripeSubscriptionId: 'sub_1', status: 'active' });
  });

  it('a returning subscriber keeps their Stripe customer', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.getSubscription.mockResolvedValue({
      status: 'canceled',
      stripeCustomerId: 'cus_old',
      stripeSubscriptionId: 'sub_old',
      livemode: false,
    });
    await subscribe();
    expect(mocks.customersCreate).not.toHaveBeenCalled();
    expect(checkoutParams().customer).toBe('cus_old');
  });

  it('a practice subscription blocks nothing once the service is live, and its customer is not reused', async () => {
    // Joseph practises with a test key, then switches the icon to the live key.
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_configured');
    mocks.getSubscription.mockResolvedValue({
      status: 'active',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      livemode: false,
    });
    const res = await subscribe();
    expect(res._status).toBe(200);
    expect(mocks.customersCreate).toHaveBeenCalledTimes(1);
    expect(checkoutParams().customer).toBe('cus_new');
  });

  it('refuses with no return URL, and with one pointing away from the Studio', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    expect((await subscribe({ body: {} }))._status).toBe(400);
    const res = await subscribe({ body: { ...STUDIO_RETURN, successUrl: 'https://evil.example/thanks' } });
    expect(res._status).toBe(400);
    expect(res._json?.error).toBe('Return URL not allowed');
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/credits/portal — manage Studio Pro', () => {
  const portal = (overrides: Record<string, unknown> = {}) =>
    call(
      'post',
      '/portal',
      mockReq({ body: { returnUrl: 'https://holoscript.studio/settings?tab=credits' }, userId: USER, ...overrides })
    );
  const subscriber = { status: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', livemode: false };

  it('404s for an account with no subscription, one holding only a customer, or a practice one', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    expect((await portal())._status).toBe(404);
    mocks.getSubscription.mockResolvedValue({ ...subscriber, stripeSubscriptionId: null, status: 'none' });
    expect((await portal())._status).toBe(404);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_configured');
    mocks.getSubscription.mockResolvedValue(subscriber);
    expect((await portal())._status).toBe(404);
    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });

  it('opens the Stripe page for the subscriber customer, on our own configuration, returning to Settings', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.getSubscription.mockResolvedValue(subscriber);
    const res = await portal();
    expect(res._status).toBe(200);
    expect(res._json?.url).toBe('https://billing.example/p_1');
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://holoscript.studio/settings?tab=credits',
      configuration: 'bpc_new',
    });
  });

  it("never uses the account's default or someone else's configuration: it creates ours, exactly as Settings promises", async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.getSubscription.mockResolvedValue(subscriber);
    mocks.configList.mockResolvedValueOnce({
      data: [{ id: 'bpc_default' }, { id: 'bpc_marketplace', metadata: { createdBy: 'studio' } }],
    });
    await portal();
    expect(mocks.configCreate).toHaveBeenCalledTimes(1);
    const created = mocks.configCreate.mock.calls[0][0] as {
      features: Record<string, { enabled?: boolean; mode?: string }>;
      metadata: Record<string, string>;
    };
    expect(Object.keys(created.features).sort()).toEqual(['invoice_history', 'payment_method_update', 'subscription_cancel']);
    expect(created.features.subscription_cancel.mode).toBe('at_period_end');
    expect(created.metadata).toEqual({ createdBy: 'absorb-service', plan: 'studio_pro' });
    expect(mocks.portalCreate.mock.calls[0][0]).toMatchObject({ configuration: 'bpc_new' });
  });

  it('reuses our configuration once found, without listing again', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.getSubscription.mockResolvedValue(subscriber);
    mocks.configList.mockResolvedValueOnce({
      data: [{ id: 'bpc_other' }, { id: 'bpc_ours', metadata: { createdBy: 'absorb-service', plan: 'studio_pro' } }],
    });
    await portal();
    await portal();
    expect(mocks.configCreate).not.toHaveBeenCalled();
    expect(mocks.configList).toHaveBeenCalledTimes(1);
    expect(mocks.portalCreate.mock.calls.map((c) => (c[0] as { configuration: string }).configuration)).toEqual([
      'bpc_ours',
      'bpc_ours',
    ]);
  });

  it('looks our configuration up again once, when Stripe refuses the remembered one', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_configured');
    mocks.getSubscription.mockResolvedValue(subscriber);
    await portal(); // remembers bpc_new
    mocks.portalCreate.mockRejectedValueOnce(new Error('This configuration is inactive'));
    mocks.configList.mockResolvedValueOnce({
      data: [{ id: 'bpc_again', metadata: { createdBy: 'absorb-service', plan: 'studio_pro' } }],
    });
    const res = await portal();
    expect(res._status).toBe(200);
    expect(mocks.portalCreate.mock.calls.at(-1)?.[0]).toMatchObject({ configuration: 'bpc_again' });
  });
});
