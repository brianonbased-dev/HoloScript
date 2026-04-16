/**
 * x402 payment service — Vitest scaffolding.
 * Mocks Express Request/Response, pg Pool, and establishes facilitator / platform boundaries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = mockQuery;
    end = vi.fn().mockResolvedValue(undefined);
  },
}));

import { x402PaymentService, type x402PaymentServiceOptions } from './x402PaymentService.js';

function createBaseOptions(
  overrides: Partial<x402PaymentServiceOptions> = {}
): x402PaymentServiceOptions {
  return {
    facilitators: [
      { name: 'coinbase', endpoint: 'https://facilitator.example/x402' },
    ],
    networks: [
      { name: 'base', rpc_url: 'http://127.0.0.1:8545', chain_id: 8453 },
      { name: 'ethereum', rpc_url: 'http://127.0.0.1:8546', chain_id: 1 },
    ],
    assets: [{ symbol: 'USDC' }],
    gasless: {
      enabled: false,
      subsidy_provider: 'coinbase',
      max_gas_price: 1_000_000_000,
    },
    receipt_storage: { provider: 'postgresql', table: 'x402_receipts' },
    webhook_endpoint: '/api/payments/x402/callback',
    platform_wallet: '0x000000000000000000000000000000000000dEaD',
    ...overrides,
  };
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('x402PaymentService', () => {
  let service: x402PaymentService;

  beforeEach(() => {
    mockQuery.mockReset();
    service = new x402PaymentService(createBaseOptions());
  });

  afterEach(async () => {
    if (service) await service.destroy();
  });

  describe('facilitator boundary (WWW-Authenticate + first facilitator)', () => {
    it('return402Response sets 402, x402 WWW-Authenticate, and JSON body with facilitator URL', () => {
      const res = createMockRes();
      service.return402Response(res, {
        payment_id: 'pay_test_1',
        price: 5,
        asset: 'USDC',
        network: 'base',
        facilitator: 'https://facilitator.example/x402',
        content_id: 'twin_phoenix',
      });

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'x402 facilitator="https://facilitator.example/x402" price="5" asset="USDC" network="base"'
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment required',
          price: 5,
          asset: 'USDC',
          network: 'base',
          facilitator: 'https://facilitator.example/x402',
          payment_id: 'pay_test_1',
          content_id: 'twin_phoenix',
        })
      );
    });

    it('requirePayment uses options.facilitators[0].endpoint in the 402 response when no payment id', async () => {
      const middleware = service.requirePayment({
        price: 10,
        asset: 'USDC',
        network: 'base',
      });

      const req = {
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.1' },
        headers: {},
        params: { twin_id: 'my_twin' },
      } as unknown as Request;

      const res = createMockRes();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(402);
      const headerCall = (res.header as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(headerCall[1]).toContain('facilitator="https://facilitator.example/x402"');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          facilitator: 'https://facilitator.example/x402',
          content_id: 'my_twin',
        })
      );
    });
  });

  describe('processRevenueSplit', () => {
    it('splits 80/10/10 when an agent address is present', () => {
      const split = service.processRevenueSplit(100, '0xCreator', '0xAgent');
      expect(split.creator.amount).toBe(80);
      expect(split.agent?.amount).toBe(10);
      expect(split.platform.amount).toBe(10);
    });

    it('allocates agent share to platform when no agent', () => {
      const split = service.processRevenueSplit(100, '0xCreator');
      expect(split.platform.amount).toBe(20);
      expect(split.agent).toBeNull();
    });
  });

  describe('verifyPayment (DB + platform recipient boundary)', () => {
    it('returns null when payment id is missing or not in database', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await expect(service.verifyPayment('')).resolves.toBeNull();
      await expect(service.verifyPayment('unknown')).resolves.toBeNull();
      expect(mockQuery).toHaveBeenCalled();
    });
  });
});
