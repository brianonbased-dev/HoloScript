import { Router, Request, Response } from 'express';
import type Stripe from 'stripe';

const router = Router();

// Endpoint: POST /api/credits/webhook/stripe
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret || !process.env.STRIPE_SECRET_KEY) {
    console.error(`[credits/webhook] Webhook secret or Stripe key not configured`);
    res.status(400).send('Webhook environment missing');
    return;
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
        const userId = session.metadata.userId || 'anonymous';
        const amountCents = parseInt(session.metadata.amountCents || '0', 10);

        // Idempotent allocation inside the database transaction logic
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
