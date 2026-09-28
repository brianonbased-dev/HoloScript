import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { userUuid } from '../middleware/auth.js';
import { STUDIO_PRO_PLAN, subscriptionRecordFrom } from './subscriptionWebhook.js';

const router = Router();

/**
 * The Stripe secret key, or null when it is missing OR blank.
 *
 * Railway can hold a variable that is set but empty (absorb-service's
 * STRIPE_SECRET_KEY was exactly that on 2026-09-15), so "is it set" is the
 * wrong question: an empty or whitespace value is no payment provider at all.
 */
export function configuredStripeKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

/**
 * Granting credits without taking payment is a local-development convenience.
 * It must be asked for explicitly (ABSORB_DEV_CREDIT_GRANT=1) and it is never
 * available in production, whatever else is set. A missing payment key alone
 * must refuse purchases, not hand out credits.
 */
export function devCreditGrantEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.ABSORB_DEV_CREDIT_GRANT === '1';
}

const PAYMENTS_NOT_CONFIGURED = {
  error: 'Payments not configured',
  message:
    'Credit purchases are unavailable because the payment provider is not configured. No credits were granted.',
};

const RETURN_URL_NOT_ALLOWED = {
  error: 'Return URL not allowed',
  message: 'Stripe can only send the browser back to HoloScript Studio. Nothing was charged.',
};

/** The Studio, the one site Stripe may send a buyer back to. */
export const DEFAULT_RETURN_ORIGINS: readonly string[] = ['https://holoscript.studio'];

/**
 * The origins a return URL may point at: ABSORB_RETURN_ORIGINS (comma-separated,
 * for staging and local development) when set, else the Studio.
 */
export function allowedReturnOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ABSORB_RETURN_ORIGINS?.trim();
  const listed = raw ? raw.split(',') : [...DEFAULT_RETURN_ORIGINS];
  const origins: string[] = [];
  for (const entry of listed) {
    try {
      origins.push(new URL(entry.trim()).origin);
    } catch {
      // An entry that is not a URL allows nothing.
    }
  }
  return origins;
}

/**
 * The caller's return URL when it points at an allowed origin, else null, which
 * refuses the request before anything is charged.
 *
 * Until 2026-09-28 any caller's URL passed unchanged. Anyone with a GitHub
 * account can call this service directly, so anyone could mint a genuine
 * HoloScript checkout that returned the payer to a page of their choosing:
 * whoever paid funded the link-maker's account and then landed on the
 * link-maker's site. The PUBLIC_URL fallback that sat here led to
 * /api/credits/success, behind auth, which is a dead page for a browser. So the
 * Studio's own URL is the only way back.
 */
export function returnUrl(
  fromCaller: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!fromCaller) return null;
  let url: URL;
  try {
    url = new URL(fromCaller);
  } catch {
    return null;
  }
  return allowedReturnOrigins(env).includes(url.origin) ? fromCaller : null;
}

/**
 * Log what went wrong for us, and tell the caller only that it did. Stripe's
 * error text can name the key's mode and last four characters, the account id,
 * or a missing permission, and it used to be handed straight to the browser.
 */
function logFailure(where: string, error: unknown): void {
  const e = (error ?? {}) as { type?: string; code?: string; requestId?: string; message?: string };
  console.error(
    `[credits/${where}] Error: type=${e.type ?? 'n/a'} code=${e.code ?? 'n/a'} ` +
      `request=${e.requestId ?? 'n/a'}: ${e.message ?? String(error)}`
  );
}

/**
 * A purchase names EITHER an advertised package or a custom top-up.
 *
 * Until 2026-09-21 it accepted only `amountCents`, while the UI has always sent
 * `{ packageId }` — so every click of the four Buy Credits buttons parsed as a
 * ZodError and answered 400. Nothing anywhere mapped a package id to an amount,
 * and it could not have: the four advertised packages give BONUS credits
 * (Builder is 2,500 credits for $20), and a single number cannot be both what
 * Stripe charges and what the webhook grants. That is the real defect — the
 * payment path structurally could not express the prices on the page.
 *
 * So a package is resolved HERE, from the canonical table, never from the
 * client: the client says which package, the server decides both numbers.
 * `amountCents` stays for a custom top-up, where credits and cents are 1:1.
 */
const PurchaseSchema = z
  .object({
    packageId: z.string().min(1).optional(),
    amountCents: z.number().int().min(100).max(100000).optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .refine((b) => Boolean(b.packageId) !== (b.amountCents !== undefined), {
    message: 'Name exactly one of packageId or amountCents',
  });

/** What Stripe charges, what we credit, and what the line item is called. */
export interface ResolvedPurchase {
  priceCents: number;
  credits: number;
  label: string;
}

/**
 * Resolve a validated purchase body to the two numbers a checkout needs.
 * Returns null for a package id that is not on the canonical list, so an
 * unknown id refuses instead of silently charging something else.
 */
export function resolvePurchase(
  body: { packageId?: string; amountCents?: number },
  packages: ReadonlyArray<{ id: string; label: string; credits: number; priceCents: number }>
): ResolvedPurchase | null {
  if (body.packageId) {
    const pkg = packages.find((p) => p.id === body.packageId);
    if (!pkg) return null;
    return {
      priceCents: pkg.priceCents,
      credits: pkg.credits,
      label: `${pkg.label} — ${pkg.credits} credits`,
    };
  }
  if (body.amountCents === undefined) return null;
  // Custom top-up: 1 credit = 1 cent, which is the documented base rate.
  return {
    priceCents: body.amountCents,
    credits: body.amountCents,
    label: `${body.amountCents} credits for codebase intelligence`,
  };
}

// GET /balance — Check credit balance
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { getOrCreateAccount, checkBalance } = await import('@holoscript/absorb-service/credits');
    // user_id is a uuid column — service/API-key callers (no user uuid) have no
    // credit account. Return a default free balance instead of crashing on the
    // 'anonymous'→uuid cast (the credits /balance 500).
    const userId = userUuid(req);
    if (!userId) {
      res.json({
        userId: null,
        balanceCents: 0,
        tier: 'free',
        canAfford: false,
        lifetimeSpent: 0,
        lifetimePurchased: 0,
      });
      return;
    }

    const account = await getOrCreateAccount(userId);
    const balance = await (checkBalance as Function)(userId, 0) as any;
    // Studio Pro state, for Settings to show "renews on" or a manage button. A
    // missing subscription table (boot step failed) must not break the balance.
    // A row from the other Stripe mode (a practice subscription) or one holding
    // only the customer is not a subscription to show.
    const { getSubscription, stripeKeyLivemode, subscriptionInMode, tierInMode } = await import(
      '@holoscript/absorb-service/credits'
    );
    const livemode = stripeKeyLivemode(configuredStripeKey());
    const stored = await getSubscription(userId).catch(() => null);
    const sub = subscriptionInMode(stored, livemode);

    res.json({
      subscription: sub?.stripeSubscriptionId
        ? {
            plan: sub.plan,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      userId,
      balanceCents: account?.balanceCents ?? 0,
      tier: tierInMode(account?.tier ?? 'free', stored, livemode),
      canAfford: balance.sufficient,
      lifetimeSpent: account?.lifetimeSpentCents ?? 0,
      lifetimePurchased: account?.lifetimePurchasedCents ?? 0,
    });
  } catch (error: any) {
    console.error('[credits/balance] Error:', error.message);
    res.status(500).json({ error: 'Failed to check balance', message: error.message });
  }
});

// POST /purchase — Create Stripe checkout session
router.post('/purchase', async (req: Request, res: Response) => {
  try {
    const body = PurchaseSchema.parse(req.body);

    // Credits belong to a signed-in user (a uuid). A service-key or orchestrator
    // caller has no credit account: its checkout used to carry userId
    // 'anonymous', so the payment was taken and the webhook then failed to
    // credit anyone. Refuse before any money or credit moves.
    const userId = userUuid(req);
    if (!userId) {
      res.status(403).json({
        error: 'User identity required',
        message: 'Credits belong to a signed-in user. Sign in with GitHub to buy credits.',
      });
      return;
    }

    const { CREDIT_PACKAGES } = await import('@holoscript/absorb-service/credits');
    const purchase = resolvePurchase(body, CREDIT_PACKAGES);
    if (!purchase) {
      res.status(400).json({
        error: 'Unknown package',
        message: `No such credit package: ${body.packageId}`,
      });
      return;
    }

    const stripeKey = configuredStripeKey();
    if (!stripeKey) {
      if (!devCreditGrantEnabled()) {
        // Fail closed: no payment provider means no purchase and no credits.
        console.error('[credits/purchase] Refused: STRIPE_SECRET_KEY is missing or blank');
        res.status(503).json(PAYMENTS_NOT_CONFIGURED);
        return;
      }

      // Explicit local-development grant (ABSORB_DEV_CREDIT_GRANT=1, never in production).
      const { addCredits } = await import('@holoscript/absorb-service/credits');
      await addCredits(userId, purchase.credits, 'Direct purchase (dev mode)', {
        metadata: { mode: 'development', priceCents: purchase.priceCents },
      });

      res.json({
        mode: 'development',
        credited: purchase.credits,
        message: 'Credits added directly (ABSORB_DEV_CREDIT_GRANT=1, Stripe not configured)',
      });
      return;
    }

    const successUrl = returnUrl(body.successUrl);
    const cancelUrl = returnUrl(body.cancelUrl);
    if (!successUrl || !cancelUrl) {
      res.status(400).json(RETURN_URL_NOT_ALLOWED);
      return;
    }

    // Production: Create Stripe checkout session
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'HoloScript Absorb Credits',
              description: purchase.label,
            },
            // Stripe charges the PRICE; the webhook grants the CREDITS. Two
            // numbers, because a package's bonus lives in the gap between them.
            unit_amount: purchase.priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        // creditsWebhook reads metadata.amountCents and passes it straight to
        // addCredits, so this field is the CREDITS TO GRANT, not the money
        // taken. Keeping the key means the webhook needs no change and a
        // package's bonus arrives correctly.
        amountCents: String(purchase.credits),
        pricePaidCents: String(purchase.priceCents),
        // Carried so the LEDGER can record what was sold, not just how many
        // credits were granted. A custom-amount purchase has no package, hence
        // the fallback rather than an omitted key.
        packageId: body.packageId ?? 'custom',
      },
    });

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    logFailure('purchase', error);
    res.status(500).json({
      error: 'Failed to create purchase',
      message: 'The purchase could not be started. Nothing was charged.',
    });
  }
});

// ─── Studio Pro ──────────────────────────────────────────────────────────────

export { STUDIO_PRO_PLAN };

const SubscribeSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const PortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});

const ALREADY_SUBSCRIBED = {
  error: 'Already subscribed',
  message: 'You already have Studio Pro. You can manage or cancel it from Settings.',
};

/** The subset of the Stripe client the billing-portal code uses. */
export interface PortalStripeClient {
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string; configuration: string }): Promise<{ url: string }>;
    };
    configurations: {
      list(params: { active: boolean; limit: number }): Promise<{
        data: ReadonlyArray<{ id: string; metadata?: Record<string, string> | null }>;
      }>;
      create(params: Record<string, unknown>): Promise<{ id: string }>;
    };
  };
}

/** How our portal configuration is told apart from the account's others. */
export const PORTAL_CONFIGURATION_TAG = { createdBy: 'absorb-service', plan: STUDIO_PRO_PLAN } as const;

const portalConfigurationIds = new Map<string, string>();

/** For tests: forget the configuration ids learned so far. */
export function resetPortalConfigurationCache(): void {
  portalConfigurationIds.clear();
}

/**
 * The billing-portal configuration every Studio Pro portal session names: ours,
 * found by its metadata or created once, and never the account's default.
 *
 * Sessions used to open with no configuration, which hands them to the
 * account's DEFAULT, and a fallback took the first active configuration listed.
 * Either can allow what Settings does not promise: switching to another price,
 * promotion codes, cancelling at once with a proration credit. Settings promises
 * exactly three things (cancel at the end of the paid month, change the card,
 * see invoices), so only a configuration that does exactly those is used. Kept
 * per Stripe mode, because test and live configurations are separate objects.
 */
export async function studioProPortalConfiguration(
  stripe: PortalStripeClient,
  mode: string
): Promise<string> {
  const known = portalConfigurationIds.get(mode);
  if (known) return known;
  const listed = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const ours = listed.data.find(
    (c) =>
      c.metadata?.createdBy === PORTAL_CONFIGURATION_TAG.createdBy &&
      c.metadata?.plan === PORTAL_CONFIGURATION_TAG.plan
  );
  const id =
    ours?.id ??
    (
      await stripe.billingPortal.configurations.create({
        features: {
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
        },
        business_profile: { headline: 'HoloScript Studio Pro' },
        metadata: { ...PORTAL_CONFIGURATION_TAG },
      })
    ).id;
  portalConfigurationIds.set(mode, id);
  return id;
}

/**
 * A Stripe billing-portal session on our configuration: the page where a
 * subscriber changes card, sees invoices, or cancels. A remembered configuration
 * that Stripe refuses (deactivated in the dashboard) is looked up again once.
 */
export async function createPortalSession(
  stripe: PortalStripeClient,
  customer: string,
  returnUrl: string,
  mode: string
): Promise<{ url: string }> {
  const remembered = portalConfigurationIds.has(mode);
  const configuration = await studioProPortalConfiguration(stripe, mode);
  try {
    return await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl, configuration });
  } catch (error: unknown) {
    if (!remembered) throw error;
    portalConfigurationIds.delete(mode);
    const fresh = await studioProPortalConfiguration(stripe, mode);
    return await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl, configuration: fresh });
  }
}

// POST /subscribe — Stripe Checkout for the monthly Studio Pro subscription
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const body = SubscribeSchema.parse(req.body ?? {});

    const userId = userUuid(req);
    if (!userId) {
      res.status(403).json({
        error: 'User identity required',
        message: 'Studio Pro belongs to a signed-in user. Sign in with GitHub to subscribe.',
      });
      return;
    }

    const successUrl = returnUrl(body.successUrl);
    const cancelUrl = returnUrl(body.cancelUrl);
    if (!successUrl || !cancelUrl) {
      res.status(400).json(RETURN_URL_NOT_ALLOWED);
      return;
    }

    // No development shortcut here, unlike /purchase: a subscription is either
    // real or it does not exist.
    const stripeKey = configuredStripeKey();
    if (!stripeKey) {
      console.error('[credits/subscribe] Refused: STRIPE_SECRET_KEY is missing or blank');
      res.status(503).json(PAYMENTS_NOT_CONFIGURED);
      return;
    }

    const {
      SUBSCRIPTION_PRICING,
      getSubscription,
      subscriptionInMode,
      stripeKeyLivemode,
      tierForSubscriptionStatus,
      ensureSubscriptionCustomer,
      recordSubscription,
    } = await import('@holoscript/absorb-service/credits');
    const livemode = stripeKeyLivemode(stripeKey);
    const existing = subscriptionInMode(await getSubscription(userId), livemode);
    if (existing?.stripeSubscriptionId && tierForSubscriptionStatus(existing.status) === 'pro') {
      res.status(409).json(ALREADY_SUBSCRIBED);
      return;
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey);

    // One Stripe customer per user, saved before the first checkout, so a second
    // click cannot open a second subscription on a second customer.
    const customer = await ensureSubscriptionCustomer(
      userId,
      { plan: STUDIO_PRO_PLAN, livemode },
      async () => (await stripe.customers.create({ metadata: { userId } })).id
    );
    if (!customer) {
      res.status(503).json({
        error: 'Subscriptions unavailable',
        message: 'Studio Pro cannot be started right now. Nothing was charged.',
      });
      return;
    }

    // Our row lags the webhook, so ask Stripe itself whether this customer
    // already has a live Studio Pro subscription, and catch the row up if so.
    const current = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
    const live = current.data.find(
      (s) => s.metadata?.plan === STUDIO_PRO_PLAN && tierForSubscriptionStatus(s.status) === 'pro'
    );
    if (live) {
      await recordSubscription(userId, subscriptionRecordFrom(live, customer)).catch(() => null);
      res.status(409).json(ALREADY_SUBSCRIBED);
      return;
    }

    const pro = SUBSCRIPTION_PRICING.studioPro;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `HoloScript ${pro.label}`,
              description: `${pro.includedCredits.toLocaleString('en-US')} credits every month`,
            },
            unit_amount: pro.priceCentsMonthly,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      customer,
      client_reference_id: userId,
      metadata: { userId, plan: STUDIO_PRO_PLAN },
      // Copied onto the subscription, so its invoices and later events say whose
      // it is without a database lookup.
      subscription_data: { metadata: { userId, plan: STUDIO_PRO_PLAN } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    logFailure('subscribe', error);
    res.status(500).json({
      error: 'Failed to start the subscription',
      message: 'Studio Pro checkout could not be started. Nothing was charged.',
    });
  }
});

// POST /portal — open Stripe's manage-subscription page
router.post('/portal', async (req: Request, res: Response) => {
  try {
    const body = PortalSchema.parse(req.body ?? {});

    const userId = userUuid(req);
    if (!userId) {
      res.status(403).json({
        error: 'User identity required',
        message: 'Sign in with GitHub to manage Studio Pro.',
      });
      return;
    }

    const back = returnUrl(body.returnUrl);
    if (!back) {
      res.status(400).json(RETURN_URL_NOT_ALLOWED);
      return;
    }

    const stripeKey = configuredStripeKey();
    if (!stripeKey) {
      res.status(503).json(PAYMENTS_NOT_CONFIGURED);
      return;
    }

    const { getSubscription, subscriptionInMode, stripeKeyLivemode } = await import(
      '@holoscript/absorb-service/credits'
    );
    const livemode = stripeKeyLivemode(stripeKey);
    const sub = subscriptionInMode(await getSubscription(userId), livemode);
    if (!sub?.stripeSubscriptionId) {
      res.status(404).json({
        error: 'No subscription',
        message: 'This account has no Studio Pro subscription to manage.',
      });
      return;
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey) as unknown as PortalStripeClient;
    const portal = await createPortalSession(stripe, sub.stripeCustomerId, back, String(livemode));
    res.json({ url: portal.url });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    logFailure('portal', error);
    res.status(500).json({
      error: 'Failed to open subscription management',
      message: 'The billing page could not be opened.',
    });
  }
});

// GET /history — Transaction log
router.get('/history', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { getUsageHistory } = await import('@holoscript/absorb-service/credits');
    // userUuid(), not truthiness, and not 'anonymous'. This column is a uuid,
    // so the literal string crashes the query with "invalid input syntax for
    // type uuid" -> 500. The same fault is named and fixed three other times in
    // this change; it survived here, in the file that fixes it.
    const userId = userUuid(req);
    if (!userId) {
      res.json({ transactions: [], total: 0 });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const history = await getUsageHistory(userId, limit);

    res.json({ userId, transactions: history });
  } catch (error: any) {
    console.error('[credits/history] Error:', error.message);
    res.status(500).json({ error: 'Failed to get history', message: error.message });
  }
});

// GET /success — Stripe checkout success callback
router.get('/success', async (req: Request, res: Response) => {
  const sessionId = req.query.session_id as string;
  if (!sessionId) {
    res.status(400).json({ error: 'Missing session_id' });
    return;
  }

  try {
    const stripeKey = configuredStripeKey();
    if (!stripeKey) {
      if (devCreditGrantEnabled()) {
        res.json({ status: 'success', message: 'Credits added (dev mode)' });
        return;
      }
      // Never report a success the payment provider did not confirm.
      res.status(503).json(PAYMENTS_NOT_CONFIGURED);
      return;
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' && session.metadata) {
      const amountCents = parseInt(session.metadata.amountCents || '0', 10);
      
      // Note: addCredits is now handled purely by the background POST webhook
      // to guarantee safe, asynchronous provisioning even if the user closes their browser.
      res.json({ 
        status: 'success', 
        message: 'Payment confirmed. Credits are being provisioned by the webhook asynchronously.',
        amountExpected: amountCents 
      });
    } else {
      res.status(400).json({ error: 'Payment not completed' });
    }
  } catch (error: unknown) {
    logFailure('success', error);
    res.status(500).json({
      error: 'Failed to process payment',
      message: 'The payment could not be checked right now. If you paid, your credits still arrive on their own.',
    });
  }
});

export { router as creditsRouter };
