/**
 * Stripe webhook signature compare (card-webhook-token-compare).
 *
 * verifyStripeSignature passed the presented `v1=` value and the expected hex
 * digest straight to crypto.timingSafeEqual. timingSafeEqual THROWS a
 * RangeError when the two buffers differ in length, so any unauthenticated
 * caller who sent a fresh `t=` and a short or long `v1=` made
 * handleTokenRoutes reject instead of answering 401. The createServer callback
 * in http-server.ts has no catch around the HoloMesh dispatcher and the
 * package installs no unhandledRejection handler, so the request got no answer
 * and, on Node >= 15, the rejection takes the process down.
 *
 * These cases pin: a length mismatch is a plain 401 signature_mismatch, a
 * correct signature still credits, a tampered same-length signature is a 401,
 * and a wrong-length v1 does not stop a later correct v1 from matching.
 */
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import type http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils', () => ({
  json(res: http.ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  },
  parseJsonBody(req: http.IncomingMessage) {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch {
          resolve(null);
        }
      });
    });
  },
}));

vi.mock('../../auth-utils', () => ({
  resolveRequestingAgent: () => ({ authenticated: false }),
  requireAuth: () => null,
}));

const processStripePayment = vi.fn();
vi.mock('../../identity/token-ledger', () => ({
  creditTokens: vi.fn(),
  debitTokens: vi.fn(),
  getBalance: vi.fn(),
  getBalanceInfo: vi.fn(),
  getLedgerHistory: vi.fn(),
  grantTokens: vi.fn(),
  revokeTokens: vi.fn(),
  processStripePayment: (...a: unknown[]) => processStripePayment(...a),
}));

import { handleTokenRoutes } from '../token-routes';

// Test-only value; not a real Stripe endpoint secret.
const TEST_SECRET = 'whsec_test_only_not_real';
const PATH = '/api/holomesh/tokens/stripe-webhook';

const EVENT = {
  id: 'evt_test_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', metadata: { holomesh_user_id: 'u1', token_amount: '10' } } },
};

interface CapturedRes extends http.ServerResponse {
  _status: number;
  _body: any;
}

function mockReq(body: string, headers: Record<string, string>): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = 'POST';
  req.url = PATH;
  req.headers = headers;
  setTimeout(() => {
    req.emit('data', Buffer.from(body, 'utf-8'));
    req.emit('end');
  }, 0);
  return req;
}

function mockRes(): CapturedRes {
  const captured = {
    _status: 0,
    _body: undefined as unknown,
    writeHead(status: number) {
      captured._status = status;
      return captured;
    },
    setHeader() {
      return captured;
    },
    end(data?: string) {
      if (data) captured._body = JSON.parse(data);
    },
  };
  return captured as unknown as CapturedRes;
}

function sig(t: number, body: string): string {
  return createHmac('sha256', TEST_SECRET).update(`${t}.${body}`).digest('hex');
}

async function post(header: (t: number, good: string) => string): Promise<CapturedRes> {
  const body = JSON.stringify(EVENT);
  const t = Math.floor(Date.now() / 1000);
  const res = mockRes();
  await handleTokenRoutes(
    mockReq(body, { 'stripe-signature': header(t, sig(t, body)) }),
    res,
    PATH,
    'POST',
    PATH
  );
  return res;
}

beforeEach(() => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', TEST_SECRET);
  processStripePayment.mockReset();
  processStripePayment.mockReturnValue({
    entry: { id: 'le_1' },
    balanceBefore: 0,
    balanceAfter: 10,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('stripe-webhook signature compare', () => {
  it('credits on the correct signature', async () => {
    const res = await post((t, good) => `t=${t},v1=${good}`);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ received: true, credited: true });
    expect(processStripePayment).toHaveBeenCalledTimes(1);
  });

  it('answers 401 for a tampered signature of the same length', async () => {
    const res = await post(
      (t, good) => `t=${t},v1=${(good[0] === '0' ? '1' : '0') + good.slice(1)}`
    );
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: 'invalid_signature', reason: 'signature_mismatch' });
    expect(processStripePayment).not.toHaveBeenCalled();
  });

  it.each([
    ['short', (good: string) => good.slice(0, 10)],
    ['long', (good: string) => good + '00'],
    ['empty', () => ''],
    ['same char count, more bytes', (good: string) => '\u00e9'.repeat(good.length)],
  ])('answers 401 (never throws) for a wrong-length v1: %s', async (_n, mk) => {
    let res: CapturedRes | undefined;
    await expect(
      (async () => {
        res = await post((t, good) => `t=${t},v1=${mk(good)}`);
      })()
    ).resolves.toBeUndefined();
    expect(res!._status).toBe(401);
    expect(res!._body).toMatchObject({ error: 'invalid_signature', reason: 'signature_mismatch' });
    expect(processStripePayment).not.toHaveBeenCalled();
  });

  it('a wrong-length v1 does not stop a later correct v1 from matching', async () => {
    const res = await post((t, good) => `t=${t},v1=abc,v1=${good}`);
    expect(res._status).toBe(200);
    expect(processStripePayment).toHaveBeenCalledTimes(1);
  });
});
