import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PURCHASE_RETURN_PARAM, creditBalanceFrom, purchaseReturnNotice, purchaseReturnUrls } from '../purchase-return';

describe('purchase return', () => {
  it('sends the buyer back to Settings, on the Credits tab, with Stripe’s session template intact', () => {
    const urls = purchaseReturnUrls('https://holoscript.studio/');
    expect(urls.successUrl).toBe(
      'https://holoscript.studio/settings?tab=credits&purchase=success&session_id={CHECKOUT_SESSION_ID}'
    );
    expect(urls.cancelUrl).toBe('https://holoscript.studio/settings?tab=credits&purchase=cancelled');
  });

  it('passes the same URL check absorb-service applies to successUrl and cancelUrl', () => {
    // absorb's purchase schema: successUrl/cancelUrl: z.string().url().optional().
    // A URL it rejected would turn every purchase into a 400.
    const urls = purchaseReturnUrls('https://holoscript.studio');
    expect(z.string().url().safeParse(urls.successUrl).success).toBe(true);
    expect(z.string().url().safeParse(urls.cancelUrl).success).toBe(true);
  });

  it('what the route writes is what the Settings page reads back', () => {
    const { successUrl, cancelUrl } = purchaseReturnUrls('https://holoscript.studio');
    const back = (url: string) => purchaseReturnNotice(new URL(url).searchParams.get(PURCHASE_RETURN_PARAM));

    const paid = back(successUrl);
    expect(paid?.tone).toBe('ok');
    expect(paid?.refreshBalance).toBe(true);
    expect(paid?.text).toMatch(/Payment received/);

    const cancelled = back(cancelUrl);
    expect(cancelled?.tone).toBe('info');
    expect(cancelled?.refreshBalance).toBe(false);
    expect(cancelled?.text).toMatch(/not charged/);
  });

  it('reads the balance absorb actually sends (balanceCents), not only the offline default (balance)', () => {
    // absorb /api/credits/balance answers balanceCents; Settings read `balance`
    // and showed 0 for every real account.
    expect(creditBalanceFrom({ balanceCents: 1200, tier: 'free', canAfford: true })).toBe(1200);
    expect(creditBalanceFrom({ balance: 0, tier: 'free', note: 'Credit service unavailable' })).toBe(0);
    expect(creditBalanceFrom({ balanceCents: 700, balance: 5 })).toBe(700);
    expect(creditBalanceFrom({ balanceCents: 'lots' })).toBe(0);
    expect(creditBalanceFrom(null)).toBe(0);
  });

  it('says nothing to a visitor who is not coming back from checkout', () => {
    expect(purchaseReturnNotice(null)).toBeNull();
    expect(purchaseReturnNotice(undefined)).toBeNull();
    expect(purchaseReturnNotice('')).toBeNull();
    expect(purchaseReturnNotice('refund')).toBeNull();
  });
});
