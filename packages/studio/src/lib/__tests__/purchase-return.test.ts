import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PURCHASE_RETURN_PARAM, purchaseReturnNotice, purchaseReturnUrls } from '../purchase-return';

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

  it('says nothing to a visitor who is not coming back from checkout', () => {
    expect(purchaseReturnNotice(null)).toBeNull();
    expect(purchaseReturnNotice(undefined)).toBeNull();
    expect(purchaseReturnNotice('')).toBeNull();
    expect(purchaseReturnNotice('refund')).toBeNull();
  });
});
