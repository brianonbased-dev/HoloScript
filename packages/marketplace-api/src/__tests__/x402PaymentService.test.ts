import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { x402PaymentService } from '../x402PaymentService';
import type { Request, Response } from 'express';

// Mock pg Pool
const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('pg', () => {
  const MockPool = vi.fn(function (this: Record<string, unknown>) {
    this.query = mockQuery;
    this.end = mockEnd;
  });
  return { Pool: MockPool };
});

// Mock viem
const mockGetTransactionReceipt = vi.fn();
const mockGetGasPrice = vi.fn().mockResolvedValue(100000n);

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    getTransactionReceipt: mockGetTransactionReceipt,
    getGasPrice: mockGetGasPrice,
  })),
  http: vi.fn(),
  parseAbiItem: vi.fn(() => ({ type: 'event', name: 'Transfer' })),
  decodeEventLog: vi.fn(),
}));

vi.mock('viem/chains', () => ({
  base: { id: 8453, name: 'Base' },
  mainnet: { id: 1, name: 'Ethereum' },
}));

function createService(overrides?: Partial<ConstructorParameters<typeof x402PaymentService>[0]>) {
  return new x402PaymentService({
    facilitators: [{ name: 'coinbase', endpoint: 'https://cdp.coinbase.com/x402' }],
    networks: [{ name: 'base', rpc_url: 'https://base-mainnet.infura.io', chain_id: 8453 }],
    assets: [{ symbol: 'USDC' }],
    gasless: {
      enabled: true,
      subsidy_provider: 'coinbase',
      max_gas_price: 1000000000,
    },
    receipt_storage: {
      provider: 'supabase',
      table: 'x402_receipts',
    },
    webhook_endpoint: '/api/payments/x402/callback',
    platform_wallet: '0x1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  });
}

describe('x402PaymentService', () => {
  let service: x402PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    service = createService();
  });

  afterEach(async () => {
    await service.destroy();
  });

  // ─── requirePayment middleware ───────────────────────────────────────────

  test('should return 402 Payment Required for unauthenticated requests', async () => {
    const req = {
      headers: {},
      url: '/api/v1/exclusive-agent-content',
      params: { twin_id: '123' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;

    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.header = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);

    const next = vi.fn();
    const middleware = service.requirePayment({ price: 5, asset: 'USDC', network: 'base' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.header).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('x402'));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Payment required',
        price: 5,
        asset: 'USDC',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next() if payment receipt is valid', async () => {
    vi.spyOn(service as unknown as { verifyPayment: () => unknown }, 'verifyPayment').mockResolvedValue({
      access_granted: true,
    });

    const req = {
      headers: {
        'x-payment-id': 'x402_valid_payment',
      },
      url: '/api/v1/exclusive-agent-content',
      ip: '127.0.0.2',
      socket: { remoteAddress: '127.0.0.2' },
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      header: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn();
    const middleware = service.requirePayment({ price: 5, asset: 'USDC', network: 'base' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should reject invalid payment ID format', async () => {
    const req = {
      headers: {
        'x-payment-id': 'DROP TABLE; --',
      },
      url: '/api/v1/content',
      ip: '127.0.0.3',
      socket: { remoteAddress: '127.0.0.3' },
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      header: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn();
    const middleware = service.requirePayment({ price: 5, asset: 'USDC', network: 'base' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid payment identifier format' });
    expect(next).not.toHaveBeenCalled();
  });

  // ─── Rate Limiting ──────────────────────────────────────────────────────

  test('should rate limit excessive requests from same IP', async () => {
    const rateLimitedService = createService();
    const middleware = rateLimitedService.requirePayment({ price: 5, asset: 'USDC', network: 'base' });

    const makeReq = () =>
      ({
        headers: {},
        url: '/api/test',
        params: { twin_id: 'test' },
        ip: '10.0.0.99',
        socket: { remoteAddress: '10.0.0.99' },
      }) as unknown as Request;

    const makeRes = () => {
      const r = {} as Response;
      r.status = vi.fn().mockReturnValue(r);
      r.header = vi.fn().mockReturnValue(r);
      r.json = vi.fn().mockReturnValue(r);
      return r;
    };

    // Fire 31 requests (limit is 30)
    const results: Response[] = [];
    for (let i = 0; i < 31; i++) {
      const res = makeRes();
      results.push(res);
      await middleware(makeReq(), res, vi.fn());
    }

    // First 30 should get 402, last one should get 429
    expect(results[0].status).toHaveBeenCalledWith(402);
    expect(results[30].status).toHaveBeenCalledWith(429);

    await rateLimitedService.destroy();
  });

  // ─── Revenue Split ──────────────────────────────────────────────────────

  test('processRevenueSplit divides revenue 80/10/10 between Creators, Platform, and Agents', () => {
    const amount = 50.0;
    const split = service.processRevenueSplit(amount, '0xCreator', '0xAgent');

    expect(split.creator.amount).toBe(40.0); // 80%
    expect(split.platform.amount).toBe(5.0); // 10%
    expect(split.agent?.amount).toBe(5.0); // 10%
    expect(split.creator.address).toBe('0xCreator');
    expect(split.agent?.address).toBe('0xAgent');
  });

  test('processRevenueSplit defaults to 80/20 if no executing agent was used', () => {
    const amount = 100.0;
    const split = service.processRevenueSplit(amount, '0xCreator');

    expect(split.creator.amount).toBe(80.0); // 80%
    expect(split.platform.amount).toBe(20.0); // 10% + agent 10%
    expect(split.agent).toBeNull();
  });

  // ─── Gasless Subsidy ────────────────────────────────────────────────────

  test('gaslessSubsidy returns subsidized for small Base L2 payments', async () => {
    const result = await service.gaslessSubsidy(500_000n, 'base');

    expect(result.subsidized).toBe(true);
    expect(result.reason).toContain('Base L2');
  });

  test('gaslessSubsidy rejects non-Base networks', async () => {
    const result = await service.gaslessSubsidy(500_000n, 'ethereum');

    expect(result.subsidized).toBe(false);
    expect(result.reason).toContain('Base L2');
  });

  test('gaslessSubsidy rejects amounts above threshold', async () => {
    // 2 USDC = 2_000_000 raw units, above default 1 USDC threshold
    const result = await service.gaslessSubsidy(2_000_000n, 'base');

    expect(result.subsidized).toBe(false);
    expect(result.reason).toContain('threshold');
  });

  test('gaslessSubsidy returns not subsidized when disabled', async () => {
    const disabledService = createService({
      gasless: {
        enabled: false,
        subsidy_provider: 'coinbase',
        max_gas_price: 1000000000,
      },
    });

    const result = await disabledService.gaslessSubsidy(500_000n, 'base');
    expect(result.subsidized).toBe(false);
    expect(result.reason).toContain('disabled');

    await disabledService.destroy();
  });

  // ─── Subscription Management ────────────────────────────────────────────

  test('createSubscription returns a valid subscription grant', async () => {
    const grant = await service.createSubscription(
      'pay_001',
      'content_phoenix',
      '0xPayerAddress',
      'monthly'
    );

    expect(grant.payment_id).toBe('pay_001');
    expect(grant.content_id).toBe('content_phoenix');
    expect(grant.payer_address).toBe('0xPayerAddress');
    expect(grant.tier).toBe('monthly');
    expect(grant.active).toBe(true);
    expect(grant.expires_at).toBeGreaterThan(grant.granted_at);
    // Monthly: ~30 days
    expect(grant.expires_at - grant.granted_at).toBe(30 * 24 * 60 * 60);
  });

  test('createSubscription annual has 12x monthly duration', async () => {
    const grant = await service.createSubscription(
      'pay_002',
      'content_vr_menu',
      '0xPayerAddress',
      'annual'
    );

    expect(grant.tier).toBe('annual');
    // Annual: ~365 days
    expect(grant.expires_at - grant.granted_at).toBe(30 * 24 * 60 * 60 * 12);
  });

  test('checkSubscription returns null when no subscription exists', async () => {
    const result = await service.checkSubscription('0xNonExistent', 'content_xyz');
    expect(result).toBeNull();
  });

  // ─── Input Validation ───────────────────────────────────────────────────

  test('return402Response includes all required x402 fields', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    service.return402Response(res, {
      payment_id: 'test_pay_123',
      price: 10,
      asset: 'USDC',
      network: 'base',
      facilitator: 'https://cdp.coinbase.com/x402',
      content_id: 'content_abc',
    });

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('x402')
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_id: 'test_pay_123',
        price: 10,
        asset: 'USDC',
        network: 'base',
        content_id: 'content_abc',
      })
    );
  });

  // ─── Expired Subscription Access ────────────────────────────────────────

  test('should reject expired subscription receipts', async () => {
    const expiredReceipt = {
      payment_id: 'expired_sub_001',
      transaction_hash: '0x1234',
      block_number: 1,
      timestamp: 0,
      payer_address: '0x1234',
      recipient_address: '0x5678',
      amount: 5,
      asset: 'USDC',
      network: 'base',
      content_id: 'test',
      access_granted: true,
      access_expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    };

    vi.spyOn(service as unknown as { verifyPayment: () => unknown }, 'verifyPayment').mockResolvedValue(
      expiredReceipt
    );

    const req = {
      headers: { 'x-payment-id': 'expired_sub_001' },
      url: '/api/v1/content',
      params: { twin_id: 'test' },
      ip: '127.0.0.50',
      socket: { remoteAddress: '127.0.0.50' },
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn();
    const middleware = service.requirePayment({ price: 5, asset: 'USDC', network: 'base' });
    await middleware(req, res, next);

    // Should return 402 instead of granting access
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  // ─── Destroy / cleanup ─────────────────────────────────────────────────

  test('destroy cleans up resources', async () => {
    const svc = createService();
    await svc.destroy();
    expect(mockEnd).toHaveBeenCalled();
  });
});
