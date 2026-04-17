import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  X402HttpVerifier,
  createX402HttpVerifierFromEnv,
} from '../x402-http-verifier';

describe('X402HttpVerifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes when verifier is disabled', async () => {
    const verifier = new X402HttpVerifier({
      enabled: false,
      facilitatorUrl: 'https://facilitator.example.com',
      timeoutMs: 1000,
    });

    const result = await verifier.verifyPayment({
      paymentId: 'pay_1',
      transactionHash: '0xabc',
      network: 'base',
      asset: 'USDC',
      amount: 0.05,
      contentId: 'content_1',
    });

    expect(result.verified).toBe(true);
    expect(result.reason).toContain('disabled');
  });

  it('calls facilitator verify endpoint and accepts verified=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: true, transaction_hash: '0x123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const verifier = new X402HttpVerifier({
      enabled: true,
      facilitatorUrl: 'https://facilitator.example.com/x402',
      timeoutMs: 1000,
      apiKey: 'key_123',
    });

    const result = await verifier.verifyPayment({
      paymentId: 'pay_2',
      transactionHash: '0xdef',
      network: 'base',
      asset: 'USDC',
      amount: 0.25,
      contentId: 'content_2',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://facilitator.example.com/x402/verify',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.verified).toBe(true);
    expect(result.facilitatorTxHash).toBe('0x123');
  });

  it('returns failure for non-2xx facilitator response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'internal' }),
      })
    );

    const verifier = new X402HttpVerifier({
      enabled: true,
      facilitatorUrl: 'https://facilitator.example.com',
      timeoutMs: 1000,
    });

    const result = await verifier.verifyPayment({
      paymentId: 'pay_3',
      transactionHash: '0xghi',
      network: 'base',
      asset: 'USDC',
      amount: 0.15,
      contentId: 'content_3',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('500');
  });

  it('loads env configuration defaults', () => {
    const verifier = createX402HttpVerifierFromEnv({
      X402_VERIFIER_ENABLED: 'true',
      X402_FACILITATOR_URL: 'https://facilitator.env',
      X402_FACILITATOR_API_KEY: 'env_key',
      X402_VERIFIER_TIMEOUT_MS: '2500',
    });

    expect(verifier.isEnabled()).toBe(true);
  });
});
