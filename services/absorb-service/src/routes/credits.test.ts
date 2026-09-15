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
}));

vi.mock('../db/client.js', () => ({ getDb: vi.fn(() => null) }));

vi.mock('@holoscript/absorb-service/credits', () => ({
  addCredits: mocks.addCredits,
  getOrCreateAccount: vi.fn(),
  checkBalance: vi.fn(),
  getUsageHistory: vi.fn(async () => []),
}));

vi.mock('stripe', () => ({
  default: class FakeStripe {
    checkout = { sessions: { create: mocks.sessionsCreate, retrieve: mocks.sessionsRetrieve } };
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

function purchase(reqOverrides: Record<string, unknown> = {}): Promise<MockRes> {
  return call('post', '/purchase', mockReq({ body: { amountCents: 100000 }, userId: USER, ...reqOverrides }));
}

beforeEach(() => {
  mocks.addCredits.mockClear();
  mocks.stripeCtor.mockClear();
  mocks.sessionsCreate.mockClear();
  mocks.sessionsRetrieve.mockClear();
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
