import { describe, expect, test, vi } from 'vitest';
import { x402PaymentService } from '../x402PaymentService';
import type { Request, Response } from 'express';

describe('x402PaymentService', () => {
  const service = new x402PaymentService({
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
  });

  test('should return 402 Payment Required for unauthenticated requests', async () => {
    const req = {
      headers: {},
      url: '/api/v1/exclusive-agent-content',
      params: { twin_id: '123' },
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
    // Mock verifyPayment method
    vi.spyOn(service as any, 'verifyPayment').mockResolvedValue({ access_granted: true });

    const req = {
      headers: {
        'x-payment-id': '0xvalidhash',
      },
      url: '/api/v1/exclusive-agent-content',
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

  test('processRevenueSplit divides revenue 80/10/10 between Creators, Platform, and Agents', () => {
    const amount = 50.0; // $50 payment
    const split = service.processRevenueSplit(amount, '0xCreator', '0xAgent');

    expect(split.creator.amount).toBe(40.0); // 80%
    expect(split.platform.amount).toBe(5.0); // 10%
    expect(split.agent?.amount).toBe(5.0); // 10%
    expect(split.creator.address).toBe('0xCreator');
    expect(split.agent?.address).toBe('0xAgent');
  });

  test('processRevenueSplit defaults to 80/20 if no executing agent was used', () => {
    const amount = 100.0; // $100 payment
    const split = service.processRevenueSplit(amount, '0xCreator');

    expect(split.creator.amount).toBe(80.0); // 80%
    expect(split.platform.amount).toBe(20.0); // 10% + agent 10%
    expect(split.agent).toBeNull();
  });
});
