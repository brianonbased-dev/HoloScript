import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { x402PaymentService } from '../x402PaymentService';
import type { Request, Response } from 'express';

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('pg', () => {
  const MockPool = vi.fn(function (this: Record<string, unknown>) {
    this.query = mockQuery;
    this.end = mockEnd;
  });
  return { Pool: MockPool };
});

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    getTransactionReceipt: vi.fn(),
    getGasPrice: vi.fn().mockResolvedValue(100000n),
  })),
  http: vi.fn(),
  parseAbiItem: vi.fn(() => ({ type: 'event', name: 'Transfer' })),
  decodeEventLog: vi.fn(),
}));

vi.mock('viem/chains', () => ({
  base: { id: 8453, name: 'Base' },
  mainnet: { id: 1, name: 'Ethereum' },
}));

describe('Monetization Layer E2E Integration', () => {
  const paymentService = new x402PaymentService({
    facilitators: [{ name: 'coinbase', endpoint: 'https://cdp.coinbase.com/x402' }],
    networks: [{ name: 'base', rpc_url: 'https://base-mainnet.infura.io', chain_id: 8453 }],
    assets: [{ symbol: 'USDC' }],
    gasless: { enabled: true, subsidy_provider: 'coinbase', max_gas_price: 1000000 },
    receipt_storage: { provider: 'supabase', table: 'x402_receipts' },
    webhook_endpoint: '/api/payments/x402/callback',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterAll(async () => {
    await paymentService.destroy();
  });

  it('simulates the complete AR → VRR payment flow and 80/10/10 split', async () => {
    // Stage 1: User hits VRR endpoint from AR overlay, should be denied with 402 HTTP
    let resStatus = 0;
    let resHeaders: any = {};
    let resBody: any = {};

    const req1 = {
      headers: {},
      url: '/api/vrr/phoenix-brew',
      params: { twin_id: 'phoenix-brew' },
    } as unknown as Request;

    const res1 = {
      status: vi.fn().mockImplementation((code) => {
        resStatus = code;
        return res1;
      }),
      header: vi.fn().mockImplementation((key, val) => {
        resHeaders[key] = val;
        return res1;
      }),
      json: vi.fn().mockImplementation((data) => {
        resBody = data;
        return res1;
      }),
    } as unknown as Response;

    const next1 = vi.fn();
    const middleware = paymentService.requirePayment({ price: 10, asset: 'USDC', network: 'base' });
    await middleware(req1, res1, next1);

    expect(resStatus).toBe(402);
    expect(next1).not.toHaveBeenCalled();
    expect(resHeaders['WWW-Authenticate']).toContain('x402');

    const paymentId = resBody.payment_id;
    expect(paymentId).toBeDefined();

    // Stage 2: AI Agent handles the payment on behalf of user
    // The facilitator callback is hit indicating successful AI payment processing
    let callbackStatus = 0;
    let callbackBody: any = {};

    const req2 = {
      body: {
        payment_id: paymentId,
        transaction_hash: '0xHash123',
        network: 'base',
        creator_address: '0xPhoenixBrewOwner',
        agent_address: '0xConciergeAgent', // The agent completing the transaction for the user
      },
    } as unknown as Request;

    const res2 = {
      status: vi.fn().mockImplementation((code) => {
        callbackStatus = code;
        return res2;
      }),
      json: vi.fn().mockImplementation((data) => {
        callbackBody = data;
        return res2;
      }),
    } as unknown as Response;

    // We must mock the verifyPayment internal check to resolve true
    vi.spyOn(paymentService as any, 'verifyPayment').mockResolvedValue({
      payment_id: paymentId,
      amount: 10,
      content_id: 'phoenix-brew',
      access_granted: true,
    });

    await paymentService.facilitatorCallback(req2, res2);

    expect(callbackBody.success).toBe(true);
    expect(callbackBody.access_granted).toBe(true);

    // Validate 80/10/10 logic split
    expect(callbackBody.split).toBeDefined();
    expect(callbackBody.split.creator.address).toBe('0xPhoenixBrewOwner');
    expect(callbackBody.split.creator.amount).toBe(8); // 80% of 10
    expect(callbackBody.split.platform.amount).toBe(1); // 10%
    expect(callbackBody.split.agent.address).toBe('0xConciergeAgent');
    expect(callbackBody.split.agent.amount).toBe(1); // 10%

    // Stage 3: User makes request again with newly acquired payment ID
    // Should pass through successfully without 402 HTTP
    const req3 = {
      headers: {
        'x-payment-id': paymentId,
      },
      url: '/api/vrr/phoenix-brew',
      params: { twin_id: 'phoenix-brew' },
    } as unknown as Request;

    const res3 = {
      status: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next3 = vi.fn();
    await middleware(req3, res3, next3);

    expect(next3).toHaveBeenCalled();

    // VRR access is permanently unlocked! The E2E loop completes successfully.
  });
});
