import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SUBSCRIPTION_PRICING } from '@/lib/absorb/pricing';
import {
  PURCHASE_RETURN_PARAM,
  creditBalanceFrom,
  creditsSettingsUrl,
  purchaseReturnNotice,
  purchaseReturnUrls,
  studioProFailure,
  studioProRedirect,
  studioProStateFrom,
} from '../purchase-return';

describe('purchase return', () => {
  it('sends the buyer back to Settings, on the Credits tab, with Stripe’s session template intact', () => {
    const urls = purchaseReturnUrls('https://holoscript.studio/');
    expect(urls.successUrl).toBe(
      'https://holoscript.studio/settings?tab=credits&purchase=success&session_id={CHECKOUT_SESSION_ID}'
    );
    expect(urls.cancelUrl).toBe(
      'https://holoscript.studio/settings?tab=credits&purchase=cancelled'
    );
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
    const back = (url: string) =>
      purchaseReturnNotice(new URL(url).searchParams.get(PURCHASE_RETURN_PARAM));

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
    expect(
      creditBalanceFrom({ balance: 0, tier: 'free', note: 'Credit service unavailable' })
    ).toBe(0);
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

  it('a Studio Pro checkout comes back as "subscribed", and the page says what was bought', () => {
    const { successUrl, cancelUrl } = purchaseReturnUrls(
      'https://holoscript.studio',
      'subscription'
    );
    expect(successUrl).toBe(
      'https://holoscript.studio/settings?tab=credits&purchase=subscribed&session_id={CHECKOUT_SESSION_ID}'
    );
    expect(cancelUrl).toBe('https://holoscript.studio/settings?tab=credits&purchase=cancelled');
    expect(z.string().url().safeParse(successUrl).success).toBe(true);

    const back = purchaseReturnNotice(new URL(successUrl).searchParams.get(PURCHASE_RETURN_PARAM));
    expect(back?.tone).toBe('ok');
    expect(back?.refreshBalance).toBe(true);
    // The monthly credits come from the table the webhook grants from.
    expect(back?.text).toContain(
      `${SUBSCRIPTION_PRICING.studioPro.includedCredits} monthly credits`
    );
  });

  it('the billing page returns to the Credits tab', () => {
    expect(creditsSettingsUrl('https://holoscript.studio/')).toBe(
      'https://holoscript.studio/settings?tab=credits'
    );
  });

  it('reads Studio Pro from the balance answer absorb sends', () => {
    // absorb /api/credits/balance: tier, plus subscription {plan, status,
    // currentPeriodEnd, cancelAtPeriodEnd} or null. JSON carries the date as a string.
    const end = '2026-10-28T00:00:00.000Z';
    expect(
      studioProStateFrom({
        tier: 'pro',
        subscription: {
          plan: 'studio_pro',
          status: 'active',
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
        },
      })
    ).toEqual({ isPro: true, periodEnd: new Date(end), ending: false, canManage: true });

    expect(
      studioProStateFrom({
        tier: 'pro',
        subscription: { currentPeriodEnd: end, cancelAtPeriodEnd: true },
      }).ending
    ).toBe(true);

    // Pro ended: free again, but there is still a Stripe customer with invoices.
    expect(
      studioProStateFrom({
        tier: 'free',
        subscription: { status: 'canceled', currentPeriodEnd: null },
      })
    ).toEqual({ isPro: false, periodEnd: null, ending: false, canManage: true });

    expect(studioProStateFrom({ tier: 'free', subscription: null })).toEqual({
      isPro: false,
      periodEnd: null,
      ending: false,
      canManage: false,
    });
    // The Studio's offline default has no subscription field at all.
    expect(studioProStateFrom({ balance: 0, tier: 'free', note: 'unavailable' }).canManage).toBe(
      false
    );
    expect(
      studioProStateFrom({ tier: 'pro', subscription: { currentPeriodEnd: 'not a date' } })
        .periodEnd
    ).toBeNull();
    expect(studioProStateFrom(null).isPro).toBe(false);
  });

  it('follows only the Stripe page each action answers with', () => {
    const checkout = 'https://checkout.stripe.com/c/pay/cs_test_1';
    const billing = 'https://billing.stripe.com/p/session/test_1';
    expect(studioProRedirect('subscribe', true, { checkoutUrl: checkout })).toBe(checkout);
    expect(studioProRedirect('portal', true, { url: billing })).toBe(billing);
    // The other action's field is not a way out.
    expect(studioProRedirect('subscribe', true, { url: billing })).toBeNull();
    expect(studioProRedirect('portal', true, { checkoutUrl: checkout })).toBeNull();
    // A refusal is never followed, and neither is anything that is not https.
    expect(studioProRedirect('subscribe', false, { checkoutUrl: checkout })).toBeNull();
    expect(studioProRedirect('subscribe', true, { checkoutUrl: 'javascript:alert(1)' })).toBeNull();
    expect(studioProRedirect('portal', true, { url: 'http://billing.stripe.com/p' })).toBeNull();
    expect(studioProRedirect('portal', true, null)).toBeNull();
  });

  it("says absorb's own reason, and that a failed subscribe charged nothing", () => {
    expect(
      studioProFailure('subscribe', {
        error: 'Already subscribed',
        message: 'You already have Studio Pro. You can manage or cancel it from Settings.',
      })
    ).toBe(
      'You already have Studio Pro. You can manage or cancel it from Settings. You were not charged.'
    );
    expect(studioProFailure('subscribe', { error: 'Payments not configured' })).toBe(
      'Payments not configured. You were not charged.'
    );
    expect(studioProFailure('subscribe')).toBe(
      'Studio Pro checkout could not be started. You were not charged.'
    );
    // Opening the billing page charges nothing, so it does not say so.
    expect(
      studioProFailure('portal', {
        message: 'This account has no Studio Pro subscription to manage.',
      })
    ).toBe('This account has no Studio Pro subscription to manage.');
    expect(studioProFailure('portal')).toBe('The billing page could not be opened.');
  });
});
