/**
 * Where Stripe sends a buyer after checkout, and what the Studio says when they
 * get back. Both halves live here so the address the purchase route writes and
 * the parameter the Settings page reads cannot drift apart.
 *
 * Until 2026-09-28 the Buy button sent only `packageId`, so absorb-service chose
 * the return address itself: `${PUBLIC_URL || 'http://localhost:3005'}/api/credits/success`.
 * PUBLIC_URL was unset in production, so a buyer who had just paid was sent to
 * localhost on their own computer. With PUBLIC_URL set it would have been no
 * better: absorb's /api/credits/success sits behind its auth middleware, and a
 * browser returning from Stripe carries no API key, so it meets a 401. The money
 * and the credits were never at risk (the Stripe webhook grants the credits);
 * the page the buyer landed on was.
 *
 * The purchase route sets these URLs itself and overwrites any the client sent,
 * so it cannot be used to aim a checkout at somebody else's page.
 */

/** The query parameter the Settings page reads when a buyer comes back. */
export const PURCHASE_RETURN_PARAM = 'purchase';

export interface PurchaseReturnUrls {
  successUrl: string;
  cancelUrl: string;
}

/**
 * Both return URLs for a checkout started from the Studio at `origin`: the
 * Settings page, on the Credits tab, where the Buy buttons are.
 */
export function purchaseReturnUrls(origin: string): PurchaseReturnUrls {
  const base = `${origin.replace(/\/+$/u, '')}/settings?tab=credits&${PURCHASE_RETURN_PARAM}=`;
  return {
    // Stripe swaps {CHECKOUT_SESSION_ID} for the session id itself, so it must
    // reach Stripe exactly like this, unencoded.
    successUrl: `${base}success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}cancelled`,
  };
}

export interface PurchaseReturnNotice {
  tone: 'ok' | 'info';
  text: string;
  /** The webhook adds the credits a moment later; the page should re-read the balance. */
  refreshBalance: boolean;
}

/** What to tell a buyer arriving with `?purchase=<value>`, or null when they are not returning from checkout. */
export function purchaseReturnNotice(value: string | null | undefined): PurchaseReturnNotice | null {
  if (value === 'success') {
    return {
      tone: 'ok',
      text: 'Payment received. Thank you! Your new credits will show in the balance above within a minute.',
      refreshBalance: true,
    };
  }
  if (value === 'cancelled') {
    return { tone: 'info', text: 'Payment cancelled. You were not charged.', refreshBalance: false };
  }
  return null;
}
