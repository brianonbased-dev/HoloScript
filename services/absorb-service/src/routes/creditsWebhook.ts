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
              // The money and the credits are two different numbers now, and
              // this line used to print the credits and call them cents. Since
              // the purchase route redefined metadata.amountCents as the
              // CREDITS to grant, a Builder refusal read "2500 cents were paid"
              // when the customer paid 2000 — wrong by the bonus, in the
              // direction that over-refunds, for every package but Starter.
              // session.amount_total is what Stripe actually captured.
              `${session.amount_total ?? 'unknown'} cents were paid (${amountCents} credits ` +
                `were owed) and NOT credited. Attribute it by hand.`
          );
          res.json({ received: true, credited: false, reason: 'missing userId' });
          return;
        }

        // addCredits is idempotent on stripeSessionId and runs in one
        // transaction; a redelivery of this event returns the existing balance
        // rather than adding again.
        // THE LEDGER HAS TO RECORD THE SALE, NOT ONLY THE GRANT.
        //
        // Since the purchase route redefined metadata.amountCents as the CREDITS
        // to grant, the ledger row and lifetimePurchasedCents both carry the
        // credit figure -- so a $20.00 Builder sale is recorded as 2500, the
        // bonus included, and /balance reports lifetimePurchased 2500 for two
        // thousand cents of revenue. Nothing in our own database could then
        // reconcile a refund, because the money paid was never written down.
        //
        // amountCents stays the credits (that is what a balance is denominated
        // in); what was actually charged, and what was sold, go alongside it.
        const pricePaidCents = Number(session.metadata.pricePaidCents ?? session.amount_total ?? 0);
        const granted = await addCredits(userId, amountCents, 'Stripe purchase', {
          stripeSessionId: session.id,
          metadata: {
            pricePaidCents,
            packageId: session.metadata.packageId ?? 'unknown',
            creditsGranted: amountCents,
          },
        });

        // A NULL RETURN IS A FAILED GRANT, AND IT MUST NOT ANSWER 200.
        //
        // addCredits returns null WITHOUT throwing when the database is
        // unavailable, when the account update matches no row, or when the
        // client cannot give it a transaction. This handler is now the only
        // path that credits a real purchase — /success deliberately no longer
        // does — so swallowing that meant: money captured, zero credits, a log
        // line claiming success, and a 200 telling Stripe the event is handled
        // so it never retries. A transient database outage during a webhook
        // burst silently ate paid purchases.
        //
        // This is the one failure where a redelivery WOULD fix things, and the
        // handler was the thing preventing it. 500 asks for that redelivery,
        // which the idempotence guard above now makes safe to accept.
        if (!granted) {
          console.error(
            `[credits/webhook] GRANT FAILED for user ${userId}, session ${session.id}: ` +
              `${amountCents} credits were NOT applied. Answering 500 so Stripe redelivers.`
          );
          res.status(500).json({ received: true, credited: false, reason: 'grant failed' });
          return;
        }

        console.log(
          `[credits/webhook] Provisioned ${amountCents} credits for user ${userId} ` +
            `via Session ${session.id}; balance now ${granted.balanceCents}`
        );
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
