/**
 * Integration tests for the X402 AST asset licensing HTTP surface.
 *
 * Drives the express router by invoking handlers directly with mocked
 * Request / Response objects (same pattern as MonetizationE2E.test.ts).
 * No supertest dependency required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import {
  createASTAssetRouter,
  getRegistryFromRouter,
  requireASTLicense,
} from '../ast-licensing-middleware';
import {
  ASTLicenseRegistry,
  X402_VERSION,
  X402Facilitator,
  type X402PaymentPayload,
} from '@holoscript/framework/economy';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Response helper — captures status + body + headers like supertest.
// ─────────────────────────────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): MockResponse;
  header(name: string, value: string): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  json(body: unknown): MockResponse;
}

function mockRes(): MockResponse & Response {
  const r: MockResponse = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    header(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return r as MockResponse & Response;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

// Drive a single route by walking the router.stack until we find a match.
async function invoke(
  router: ReturnType<typeof createASTAssetRouter>,
  method: string,
  path: string,
  req: Partial<Request> = {}
): Promise<MockResponse & Response> {
  const res = mockRes();
  const layers = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ method: string; handle: (req: Request, res: Response, next: () => void) => unknown }> } }> }).stack;
  for (const layer of layers) {
    if (!layer.route) continue;
    // Convert express path patterns like "/ast-assets/:assetId" into a regex.
    const pattern = new RegExp('^' + layer.route.path.replace(/:([^/]+)/g, '(?<$1>[^/]+)') + '$');
    const match = pattern.exec(path);
    if (!match) continue;
    const handlerStack = layer.route.stack.filter((s) => s.method === method.toLowerCase());
    if (handlerStack.length === 0) continue;
    const params = (match.groups ?? {}) as Record<string, string>;
    const fullReq = mockReq({ ...req, params });

    // Run handlers sequentially; the chain is middleware then final handler.
    for (let i = 0; i < handlerStack.length; i++) {
      const handler = handlerStack[i].handle;
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };
      const out = handler(fullReq, res, next);
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        await out;
      }
      if (!nextCalled) break;
    }
    return res;
  }
  res.status(404).json({ error: 'no route matched in test', path });
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const RECIPIENT = '0x4242424242424242424242424242424242424242';
const PAYER = '0x1111111111111111111111111111111111111111';
const AUTHOR = '0xfeedfacefeedfacefeedfacefeedfacefeedface';
const VIEW_ONLY_SOURCE = `object Cube { position: [0, 1, 0] }`;
const PAID_SOURCE = `object PaidCube { position: [0, 1, 0] }`;

function paidLicense(price = 0.05) {
  return {
    licenseId: 'http-test',
    kind: 'commercial' as const,
    priceUSDC: price,
    chain: 'base' as const,
    recipient: RECIPIENT,
    terms: 'one project',
  };
}

function buildPayment(opts: {
  amountBaseUnits: string;
  to: string;
  from?: string;
  nonce?: string;
}): X402PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: X402_VERSION,
    scheme: 'exact',
    network: 'base',
    payload: {
      signature: '0x' + 'cd'.repeat(65),
      authorization: {
        from: opts.from ?? PAYER,
        to: opts.to,
        value: opts.amountBaseUnits,
        validAfter: String(now - 60),
        validBefore: String(now + 600),
        nonce: opts.nonce ?? `n-${Math.random().toString(36).slice(2)}-${now}`,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AST asset licensing HTTP surface', () => {
  let router: ReturnType<typeof createASTAssetRouter>;
  let registry: ASTLicenseRegistry;

  beforeEach(() => {
    registry = new ASTLicenseRegistry();
    router = createASTAssetRouter({ registry });
  });

  it('exposes the registry via getRegistryFromRouter for orchestration', () => {
    const fromHelper = getRegistryFromRouter(router);
    expect(fromHelper).toBe(registry);
  });

  it('POST /ast-assets registers a view-only asset and returns the manifest', async () => {
    const res = await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: VIEW_ONLY_SOURCE,
        author: AUTHOR,
        license: { ...paidLicense(0), kind: 'view-only' },
        assetId: 'free-1',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.body as { manifest: { assetId: string }; licenseFromAST: boolean };
    expect(body.manifest.assetId).toBe('free-1');
    expect(body.licenseFromAST).toBe(false);
  });

  it('POST /ast-assets rejects malformed bodies (no source)', async () => {
    const res = await invoke(router, 'POST', '/ast-assets', { body: { author: AUTHOR } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /ast-assets rejects duplicate asset IDs with 409', async () => {
    const body = {
      source: VIEW_ONLY_SOURCE,
      author: AUTHOR,
      license: paidLicense(0),
      assetId: 'dup-1',
    };
    const r1 = await invoke(router, 'POST', '/ast-assets', { body });
    expect(r1.statusCode).toBe(201);
    const r2 = await invoke(router, 'POST', '/ast-assets', { body });
    expect(r2.statusCode).toBe(409);
  });

  it('GET /ast-assets lists registered manifests', async () => {
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: VIEW_ONLY_SOURCE,
        author: AUTHOR,
        license: { ...paidLicense(0), kind: 'view-only' },
        assetId: 'list-a',
      },
    });
    const res = await invoke(router, 'GET', '/ast-assets');
    expect(res.statusCode).toBe(200);
    const body = res.body as { count: number; items: Array<{ assetId: string }> };
    expect(body.count).toBe(1);
    expect(body.items[0].assetId).toBe('list-a');
  });

  it('GET /ast-assets/:id/manifest returns public manifest without payment', async () => {
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: PAID_SOURCE,
        author: AUTHOR,
        license: paidLicense(0.05),
        assetId: 'paid-1',
      },
    });
    const res = await invoke(router, 'GET', '/ast-assets/paid-1/manifest');
    expect(res.statusCode).toBe(200);
    const body = res.body as { manifest: { assetId: string; license: { priceUSDC: number } } };
    expect(body.manifest.assetId).toBe('paid-1');
    expect(body.manifest.license.priceUSDC).toBeCloseTo(0.05);
  });

  it('GET /ast-assets/:id returns 402 with WWW-Authenticate when no payment is attached', async () => {
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: PAID_SOURCE,
        author: AUTHOR,
        license: paidLicense(0.05),
        assetId: 'paid-2',
      },
    });
    const res = await invoke(router, 'GET', '/ast-assets/paid-2');
    expect(res.statusCode).toBe(402);
    expect(res.headers['www-authenticate']).toContain('x402');
    expect(res.headers['www-authenticate']).toContain('USDC');
    const body = res.body as { error: string; requiredAmountBaseUnits: string };
    expect(body.error).toBe('Payment required');
    expect(body.requiredAmountBaseUnits).toBe('50000');
  });

  it('GET /ast-assets/:id releases payload after a valid X-PAYMENT', async () => {
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: PAID_SOURCE,
        author: AUTHOR,
        license: paidLicense(0.05),
        assetId: 'paid-3',
      },
    });
    const payment = buildPayment({ amountBaseUnits: '50000', to: RECIPIENT });
    const encoded = X402Facilitator.encodeXPaymentHeader(payment);
    const res = await invoke(router, 'GET', '/ast-assets/paid-3', {
      headers: { 'x-payment': encoded } as never,
    });
    expect(res.statusCode).toBe(200);
    const body = res.body as { manifest: { assetId: string }; source: string; ast: unknown };
    expect(body.manifest.assetId).toBe('paid-3');
    expect(body.source).toBe(PAID_SOURCE);
    expect(body.ast).toBeTruthy();
    // Echo X-PAYMENT-RESPONSE so client can persist receipt.
    expect(res.headers['x-payment-response']).toBeTruthy();
  });

  it('GET /ast-assets/:id rejects malformed X-PAYMENT with 400', async () => {
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: PAID_SOURCE,
        author: AUTHOR,
        license: paidLicense(0.05),
        assetId: 'paid-4',
      },
    });
    const res = await invoke(router, 'GET', '/ast-assets/paid-4', {
      headers: { 'x-payment': 'not-base64-not-json' } as never,
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /ast-assets/:id 404s for unknown asset id', async () => {
    const res = await invoke(router, 'GET', '/ast-assets/does-not-exist');
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 immediately for free / view-only licenses', async () => {
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: VIEW_ONLY_SOURCE,
        author: AUTHOR,
        license: { ...paidLicense(0), kind: 'view-only' },
        assetId: 'free-2',
      },
    });
    const res = await invoke(router, 'GET', '/ast-assets/free-2');
    expect(res.statusCode).toBe(200);
    const body = res.body as { source: string };
    expect(body.source).toBe(VIEW_ONLY_SOURCE);
  });
});

// Sanity test for the middleware factory without going through the router.
describe('requireASTLicense middleware', () => {
  it('falls through next() when access is granted', async () => {
    const reg = new ASTLicenseRegistry();
    const router = createASTAssetRouter({ registry: reg });
    await invoke(router, 'POST', '/ast-assets', {
      body: {
        source: VIEW_ONLY_SOURCE,
        author: AUTHOR,
        license: { ...paidLicense(0), kind: 'view-only' },
        assetId: 'mw-1',
      },
    });
    const middleware = requireASTLicense(reg);
    const req = mockReq({ params: { assetId: 'mw-1' }, headers: {} });
    const res = mockRes();
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });
});
