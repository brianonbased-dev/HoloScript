import { describe, expect, it } from 'vitest';
import {
  validateX402MicropaymentBoundary,
  safeParseX402PaymentPayload,
  safeParseX402PaymentRequired,
} from './x402-boundary-schemas';

const minimalValidPayment = {
  x402Version: 1 as const,
  scheme: 'exact' as const,
  network: 'base' as const,
  payload: {
    signature: '0'.repeat(132),
    authorization: {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '50000',
      validAfter: '1',
      validBefore: '9999999999',
      nonce: '1234567890abcdef',
    },
  },
};

describe('x402 boundary schemas', () => {
  it('rejects trait-injected extra keys on payment', () => {
    const malicious = { ...minimalValidPayment, traitInjected: true };
    const r = safeParseX402PaymentPayload(malicious);
    expect(r.success).toBe(false);
  });

  it('rejects validAfter > validBefore', () => {
    const bad = {
      ...minimalValidPayment,
      payload: {
        ...minimalValidPayment.payload,
        authorization: {
          ...minimalValidPayment.payload.authorization,
          validAfter: '100',
          validBefore: '50',
        },
      },
    };
    const r = safeParseX402PaymentPayload(bad);
    expect(r.success).toBe(false);
  });

  it('validateX402MicropaymentBoundary accepts payment + requiredAmount', () => {
    const v = validateX402MicropaymentBoundary({
      payment: minimalValidPayment,
      requiredAmount: '1',
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.requiredAmount).toBe('1');
      expect(v.payment.scheme).toBe('exact');
    }
  });

  it('safeParseX402PaymentRequired validates 402 body shape', () => {
    const pr = {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: '50000',
          resource: '/api/x',
          description: 'test',
          payTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          maxTimeoutSeconds: 60,
        },
      ],
      error: 'Payment required',
    };
    const r = safeParseX402PaymentRequired(pr);
    expect(r.success).toBe(true);
  });
});
