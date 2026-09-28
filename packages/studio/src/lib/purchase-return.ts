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
import { SUBSCRIPTION_PRICING } from '@/lib/absorb/pricing';

/** The query parameter the Settings page reads when a buyer comes back. */
export const PURCHASE_RETURN_PARAM = 'purchase';

export interface PurchaseReturnUrls {
  successUrl: string;
  cancelUrl: string;
}

/** The Settings page, Credits tab, where the Buy buttons and Studio Pro live. */
export function creditsSettingsUrl(origin: string): string {
  return `${origin.replace(/\/+$/u, '')}/settings?tab=credits`;
}

/**
 * Both return URLs for a checkout started from the Studio at `origin`: back to
 * Settings, Credits tab. A credit purchase comes back as `success`, a Studio Pro
 * subscription as `subscribed`, and either one abandoned as `cancelled`.
 */
export function purchaseReturnUrls(
  origin: string,
  kind: 'purchase' | 'subscription' = 'purchase'
): PurchaseReturnUrls {
  const base = `${creditsSettingsUrl(origin)}&${PURCHASE_RETURN_PARAM}=`;
  return {
    // Stripe swaps {CHECKOUT_SESSION_ID} for the session id itself, so it must
    // reach Stripe exactly like this, unencoded.
    successUrl: `${base}${kind === 'subscription' ? 'subscribed' : 'success'}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}cancelled`,
  };
}

export interface PurchaseReturnNotice {
  tone: 'ok' | 'info';
  text: string;
  /** The webhook adds the credits a moment later; the page should re-read the balance. */
  refreshBalance: boolean;
}

/**
 * The balance, in credits, from a `/api/absorb/credits` answer. absorb-service
 * answers `balanceCents`; only the Studio proxy's own offline default says
 * `balance`. Settings read `balance` alone, so whenever absorb answered, the card
 * showed 0 (found 2026-09-28), and a buyer told "your credits will show above"
 * would have watched them not appear.
 */
export function creditBalanceFrom(data: unknown): number {
  const d = (data ?? {}) as { balanceCents?: unknown; balance?: unknown };
  const value = typeof d.balanceCents === 'number' ? d.balanceCents : d.balance;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** What to tell a buyer arriving with `?purchase=<value>`, or null when they are not returning from checkout. */
export function purchaseReturnNotice(
  value: string | null | undefined
): PurchaseReturnNotice | null {
  if (value === 'success') {
    return {
      tone: 'ok',
      text: 'Payment received. Thank you! Your new credits will show in the balance above within a minute.',
      refreshBalance: true,
    };
  }
  if (value === 'subscribed') {
    return {
      tone: 'ok',
      text: `Welcome to Studio Pro! Your first ${SUBSCRIPTION_PRICING.studioPro.includedCredits.toLocaleString()} monthly credits will show in the balance above within a minute.`,
      refreshBalance: true,
    };
  }
  if (value === 'cancelled') {
    return {
      tone: 'info',
      text: 'Payment cancelled. You were not charged.',
      refreshBalance: false,
    };
  }
  return null;
}

/** What the Studio Pro card shows, from the `/api/absorb/credits` answer. */
export interface StudioProState {
  isPro: boolean;
  /** When the paid month ends, if Stripe told us. */
  periodEnd: Date | null;
  /** True when the subscriber has cancelled and Pro ends at periodEnd. */
  ending: boolean;
  /** True when there is a Stripe customer to manage (Pro now, or Pro before). */
  canManage: boolean;
}

/** The Studio Pro actions the Settings page asks the Studio's credits route for. */
export type StudioProAction = 'subscribe' | 'portal';

/**
 * Where to send the user after a Studio Pro action, or null when the answer
 * gives nowhere to go. `subscribe` answers with Stripe's `checkoutUrl`, `portal`
 * with the billing page's `url`; both are Stripe pages, so anything that is not
 * https is not followed.
 */
export function studioProRedirect(
  action: StudioProAction,
  ok: boolean,
  data: unknown
): string | null {
  const d = (data ?? {}) as { checkoutUrl?: unknown; url?: unknown };
  const next = action === 'subscribe' ? d.checkoutUrl : d.url;
  return ok && typeof next === 'string' && /^https:\/\//u.test(next) ? next : null;
}

/** What to tell the user when a Studio Pro action did not open a Stripe page. */
export function studioProFailure(action: StudioProAction, data?: unknown): string {
  const d = (data ?? {}) as { message?: unknown; error?: unknown };
  const said =
    (typeof d.message === 'string' && d.message.trim()) ||
    (typeof d.error === 'string' && d.error.trim()) ||
    (action === 'subscribe'
      ? 'Studio Pro checkout could not be started.'
      : 'The billing page could not be opened.');
  // An `error` is a label ("Payments not configured"), not a sentence.
  const reason = /[.!?]$/u.test(said) ? said : `${said}.`;
  return action === 'subscribe' ? `${reason} You were not charged.` : reason;
}

export function studioProStateFrom(data: unknown): StudioProState {
  const d = (data ?? {}) as {
    tier?: unknown;
    subscription?: { currentPeriodEnd?: unknown; cancelAtPeriodEnd?: unknown } | null;
  };
  const end = d.subscription?.currentPeriodEnd;
  const periodEnd = typeof end === 'string' || end instanceof Date ? new Date(end) : null;
  return {
    isPro: d.tier === 'pro',
    periodEnd: periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null,
    ending: d.subscription?.cancelAtPeriodEnd === true,
    canManage: Boolean(d.subscription),
  };
}
