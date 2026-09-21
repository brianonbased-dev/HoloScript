import { Router, Request, Response } from 'express';
import type Stripe from 'stripe';
import { configuredStripeKey } from './credits.js';

const router = Router();

// Endpoint: POST /api/credits/webhook/stripe
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ? process.env.STRIPE_WEBHOOK_SECRET : '';
  // A blank value counts as missing (Railway can hold set-but-empty variables).
  const stripeKey = configuredStripeKey();

  if (!endpointSecret || !stripeKey) {
    console.error(`[credits/webhook] Webhook secret or Stripe key not configured`);
    res.status(400).send('Webhook environment missing');
    return;
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;

  try {
    // req.body MUST be a raw Buffer here for signature verification to succeed
    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
  } catch (err: any) {
    console.error(`[credits/webhook] Error verifying signature:`, err.message);
    res.status(400).send(`Webhook Signature Verification Failed: ${err.message}`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Ensure the session was actually paid and has our metadata attached
      if (session.payment_status === 'paid' && session.metadata) {
        const { addCredits } = await import('@holoscript/absorb-service/credits');
        const userId = session.metadata.userId;
        const amountCents = parseInt(session.metadata.amountCents || '0', 10);

        // A paid session with no userId is money we cannot attribute, and the
        // fallback here used to be the literal string 'anonymous'. That is not a
        // spare bucket: entry-lookup.ts defines 'anonymous' as the id every
        // UNAUTHENTICATED caller carries, so a paying customer's balance landed
        // under the name reserved for people who are not signed in. Stop, keep
        // the money unattributed, and say so loudly enough to be found. 200 is
        // deliberate: a retry cannot supply the id Stripe never sent, so asking
        // Stripe to redeliver would only loop.
        if (!userId) {
          console.error(
            `[credits/webhook] REFUSED: paid session ${session.id} carries no metadata.userId. ` +
              `${amountCents} cents were paid and NOT credited. Attribute it by hand.`
          );
          res.json({ received: true, credited: false, reason: 'missing userId' });
          return;
        }

        // addCredits is idempotent on stripeSessionId and runs in one
        // transaction; a redelivery of this event returns the existing balance
        // rather than adding again.
        await addCredits(userId, amountCents, 'Stripe purchase', {
          stripeSessionId: session.id,
        });

        console.log(`[credits/webhook] Successfully provisioned ${amountCents} cents in credits for user ${userId} via Session ${session.id}`);
      } else {
         console.log(`[credits/webhook] Session ${session.id} completed but not paid, or missing metadata.`);
      }
    }

    // Always return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (err: any) {
    console.error(`[credits/webhook] Error processing event logic:`, err.message);
    res.status(500).send(`Webhook Handler Internal Error`);
  }
});

export { router as creditsWebhookRouter };
