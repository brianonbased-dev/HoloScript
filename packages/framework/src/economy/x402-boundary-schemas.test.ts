import { describe, expect, it } from 'vitest';
import { safeParseX402PaymentPayload, x402RequiredAmountSchema } from './x402-boundary-schemas';

const validPayload = {
  x402Version: 1,
  scheme: 'exact' as const,
  network: 'base' as const,
  payload: {
    signature: '0x' + 'a'.repeat(128),
    authorization: {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '50000',
      validAfter: '0',
      validBefore: '9999999999',
      nonce: 'nonce_test_12345678',
    },
  },
};

describe('safeParseX402PaymentPayload', () => {
  it('accepts a well-formed payload', () => {
    const r = safeParseX402PaymentPayload(validPayload);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.scheme).toBe('exact');
  });

  it('rejects unknown top-level keys (strict)', () => {
    const r = safeParseX402PaymentPayload({ ...validPayload, traitInjection: true });
    expect(r.success).toBe(false);
  });

  it('rejects wrong protocol version', () => {
    const r = safeParseX402PaymentPayload({ ...validPayload, x402Version: 99 });
    expect(r.success).toBe(false);
  });

  it('rejects non-digit value', () => {
    const r = safeParseX402PaymentPayload({
      ...validPayload,
      payload: {
        ...validPayload.payload,
        authorization: { ...validPayload.payload.authorization, value: '1e5' },
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('x402RequiredAmountSchema', () => {
  it('accepts digit-only base units', () => {
    expect(x402RequiredAmountSchema.safeParse('50000').success).toBe(true);
  });

  it('rejects scientific notation', () => {
    expect(x402RequiredAmountSchema.safeParse('5e4').success).toBe(false);
  });
});
