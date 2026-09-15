import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { userUuid } from '../middleware/auth.js';

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

const PurchaseSchema = z.object({
  amountCents: z.number().int().min(100).max(100000),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

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

    res.json({
      userId,
      // @ts-ignore - Automatic remediation for TS2339
      balanceCents: account?.balanceCents ?? 0,
      // @ts-ignore - Automatic remediation for TS2339
      tier: account?.tier ?? 'free',
      canAfford: balance.sufficient,
      // @ts-ignore - Automatic remediation for TS2339
      lifetimeSpent: account?.lifetimeSpentCents ?? 0,
      // @ts-ignore - Automatic remediation for TS2339
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
      await addCredits(userId, body.amountCents, 'Direct purchase (dev mode)', {
        metadata: { mode: 'development' },
      });

      res.json({
        mode: 'development',
        credited: body.amountCents,
        message: 'Credits added directly (ABSORB_DEV_CREDIT_GRANT=1, Stripe not configured)',
      });
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
              description: `${body.amountCents} credits for codebase intelligence`,
            },
            unit_amount: body.amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: body.successUrl || `${process.env.PUBLIC_URL || 'http://localhost:3005'}/api/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancelUrl || `${process.env.PUBLIC_URL || 'http://localhost:3005'}/api/credits/cancel`,
      metadata: {
        userId,
        amountCents: String(body.amountCents),
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
    console.error('[credits/purchase] Error:', error.message);
    res.status(500).json({ error: 'Failed to create purchase', message: error.message });
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
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';
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
  } catch (error: any) {
    console.error('[credits/success] Error:', error.message);
    res.status(500).json({ error: 'Failed to process payment', message: error.message });
  }
});

export { router as creditsRouter };
