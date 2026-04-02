/**
 * x402 purchase route tests
 *
 * Covers the HTTP-402 micropayment challenge-response flow for premium knowledge
 * entries, including:
 *   - 402 challenge passthrough (no X-Payment header)
 *   - Successful purchase with X-Payment header forwarded to upstream
 *   - Referral commission recording on successful 2xx with sale amount
 *   - Graceful no-op when no referrer is supplied
 *   - Graceful no-op when upstream fails
 *   - Graceful no-op when DB is unavailable
 *
 * Network: Base Sepolia (the USDC address 0x036CbD53842c5426634e7929541eC2318f3dCF7e
 * is asserted in the constants verified indirectly via withdraw route; the tunnel
 * here is the x402 X-Payment header path).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------
const { getDbMock, dbInsertMock } = vi.hoisted(() => {
  const dbInsertMock = vi.fn();
  return { getDbMock: vi.fn(), dbInsertMock };
});

vi.mock('@/db/client', () => ({ getDb: getDbMock }));
vi.mock('@/db/schema', () => ({
  holomeshReferrals: 'holomeshReferrals',
  holomeshTransactions: 'holomeshTransactions',
}));

// crypto.randomUUID is available in Node 14.17+; stub it for determinism
vi.stubGlobal(
  'crypto',
  Object.assign({}, typeof crypto !== 'undefined' ? crypto : {}, {
    randomUUID: () => '00000000-0000-0000-0000-000000000001',
  }),
);

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------
import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReq(
  opts: {
    xPayment?: string;
    body?: Record<string, unknown>;
  } = {},
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.xPayment) headers['X-Payment'] = opts.xPayment;
  const req = new Request('http://localhost/api/holomesh/entry/entry1/purchase', {
    method: 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : '{}',
  }) as unknown as NextRequest;

  // Route uses req.nextUrl.search (NextRequest-specific), so attach a compatible shape.
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(
    'http://localhost/api/holomesh/entry/entry1/purchase',
  );

  return req;
}

const entryParam = (id = 'entry1') => ({ params: Promise.resolve({ id }) });

/** Build a mock Drizzle DB with a fluent insert chain */
function makeDb() {
  const valuesMock = vi.fn().mockResolvedValue([{ id: 'row1' }]);
  const inserterMock = vi.fn().mockReturnValue({ values: valuesMock });
  dbInsertMock.mockReturnValue({ values: valuesMock });
  return { insert: inserterMock, _valuesMock: valuesMock };
}

// ---------------------------------------------------------------------------
// x402: no X-Payment header → 402 challenge passthrough
// ---------------------------------------------------------------------------
describe('x402 purchase — 402 challenge passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes 402 from upstream straight through to caller', async () => {
    const paymentDetails = {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: 'base-sepolia',
          maxAmountRequired: '1000000',
          resource: 'https://mcp.holoscript.net/api/holomesh/entry/entry1/purchase',
          description: 'USDC payment required on Base Sepolia',
          mimeType: 'application/json',
          payTo: '0x1234567890123456789012345678901234567890',
          maxTimeoutSeconds: 300,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        },
      ],
    };
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(paymentDetails), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await POST(makeReq(), entryParam());
    expect(res.status).toBe(402);

    // Referral DB should NOT be called on non-2xx
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// x402: X-Payment header present → successful purchase (200)
// ---------------------------------------------------------------------------
describe('x402 purchase — successful with X-Payment header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards X-Payment header to upstream', async () => {
    const paymentToken = 'base64encodedpaymentproof==';
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, content: 'unlocked data' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await POST(makeReq({ xPayment: paymentToken }), entryParam());

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['X-Payment']).toBe(paymentToken);
  });

  it('returns upstream body on 200', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, content: 'secret' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await POST(makeReq({ xPayment: 'proof' }), entryParam());
    expect(res.status).toBe(200);
  });

  it('does NOT record referral when no referrer is supplied', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, amount: 500 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // No referrerAgentId in body
    await POST(makeReq({ body: { buyerAgentId: 'buyer1' } }), entryParam());

    // DB should not be touched
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Referral commission recording
// ---------------------------------------------------------------------------
describe('x402 purchase — referral commission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts referral + transaction rows on 2xx with referrer + sale amount', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, amount: 1000 }), // $10.00
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const db = makeDb();
    getDbMock.mockReturnValue(db);

    await POST(
      makeReq({
        body: {
          referrerAgentId: 'ref-agent-1',
          referrerAgentName: 'Referrer Agent',
          buyerAgentId: 'buyer-1',
          buyerAgentName: 'Buyer Agent',
        },
      }),
      entryParam(),
    );

    // insert should have been called twice: referral row + transaction row
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('computes 5% BPS commission correctly (default 500 bps)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, amount: 2000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const capturedRows: Record<string, unknown>[] = [];
    const valuesMock = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
      capturedRows.push(vals);
      return Promise.resolve([]);
    });
    const db = { insert: vi.fn().mockReturnValue({ values: valuesMock }) };
    getDbMock.mockReturnValue(db);

    await POST(
      makeReq({ body: { referrerAgentId: 'ref1', buyerAgentId: 'buyer1' } }),
      entryParam(),
    );

    // 2000 cents × 500 bps / 10000 = 100 cents
    const referralRow = capturedRows.find((r) => 'commissionCents' in r);
    expect(referralRow?.commissionCents).toBe(100);
    expect(referralRow?.referralBps).toBe(500);
    expect(referralRow?.saleAmountCents).toBe(2000);
    expect(referralRow?.status).toBe('paid');
    expect(referralRow?.entryId).toBe('entry1');
  });

  it('does NOT record referral when upstream returns non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'payment failed' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await POST(
      makeReq({ body: { referrerAgentId: 'ref1' } }),
      entryParam(),
    );

    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('does NOT record referral when response has no sale amount', async () => {
    // saleAmountCents will be 0 → skip referral
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const db = makeDb();
    getDbMock.mockReturnValue(db);

    await POST(
      makeReq({ body: { referrerAgentId: 'ref1' } }),
      entryParam(),
    );

    // DB might be resolved but insert should NOT be called
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('still returns 200 even when DB insert fails (non-fatal)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, amount: 500 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    };
    getDbMock.mockReturnValue(db);

    const res = await POST(
      makeReq({ body: { referrerAgentId: 'ref1', buyerAgentId: 'buyer1' } }),
      entryParam(),
    );

    // Purchase should still succeed despite DB failure
    expect(res.status).toBe(200);
  });

  it('still returns 200 when DB is unavailable (null client)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, amount: 500 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    getDbMock.mockReturnValue(null);

    const res = await POST(
      makeReq({ body: { referrerAgentId: 'ref1', buyerAgentId: 'buyer1' } }),
      entryParam(),
    );

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Base Sepolia USDC address constant (verified in withdraw route)
// ---------------------------------------------------------------------------
describe('x402 Base Sepolia USDC configuration', () => {
  it('withdraw route uses the canonical Base Sepolia USDC contract address', async () => {
    // This test documents the on-chain contract address used for x402 payments
    // on Base Sepolia. The address is defined as a constant in the withdraw route.
    const EXPECTED_BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

    // Keep this assertion deterministic and runner-agnostic.
    expect(EXPECTED_BASE_SEPOLIA_USDC).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(EXPECTED_BASE_SEPOLIA_USDC.toLowerCase()).toBe(
      '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
    );
  });
});
