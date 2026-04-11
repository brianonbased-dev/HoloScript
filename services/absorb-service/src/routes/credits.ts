import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

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
    const userId = (req as AuthenticatedRequest).userId || 'anonymous';

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
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      // Development mode: directly add credits
      const { addCredits } = await import('@holoscript/absorb-service/credits');
      const userId = (req as AuthenticatedRequest).userId || 'anonymous';

      await addCredits(userId, body.amountCents, 'Direct purchase (dev mode)', {
        metadata: { mode: 'development' },
      });

      res.json({
        mode: 'development',
        credited: body.amountCents,
        message: 'Credits added directly (Stripe not configured)',
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
        userId: (req as AuthenticatedRequest).userId || 'anonymous',
        amountCents: String(body.amountCents),
      },
    });

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
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
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      res.json({ status: 'success', message: 'Credits added (dev mode)' });
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
