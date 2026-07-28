/**
 * StripeTrait — v5.1
 *
 * Stripe charge / payment intent.
 *
 * WIRING SPEC (2026-05-25 deep-ratchet):
 * Current implementation echoes stripe:charged with a fake chargeId.
 * Real wiring requires:
 *   1. Stripe SDK (`stripe` npm package) or REST API call to `https://api.stripe.com/v1/charges`
 *   2. Configurable secret_key (NOT committed — use env var or vault)
 *   3. Idempotency key per charge to prevent duplicates
 *   4. Emit stripe:charged with real Stripe charge object on success
 *   5. Emit stripe:error on network/auth/validation failure
 * RISK: Payment processing is founder-gate adjacent (F.066/F.071). Do NOT wire
 * without a concrete payment-flow design review.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { emitUnwired } from './unwired';

export interface StripeConfig {
  currency: string;
}

export const stripeHandler: TraitHandler<StripeConfig> = {
  name: 'stripe',
  defaultConfig: { currency: 'usd' },

  onAttach(node: HSPlusNode): void {
    node.__stripeState = { charges: 0, totalAmount: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__stripeState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: StripeConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__stripeState as { charges: number; totalAmount: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    if (t === 'stripe:charge') {
      state.charges++;
      state.totalAmount += (event.amount as number) ?? 0;
      // Backend not wired — emit an honest error, NEVER a fabricated stripe:charged (WIRING SPEC).
      emitUnwired(context, 'stripe:error', {
        capability: 'stripe',
        wiring: 'Stripe SDK + vault secret_key + per-charge idempotency key',
        requested: {
          amount: event.amount,
          currency: config.currency,
          customerId: event.customerId,
        },
      });
    } else if (t === 'stripe:get_stats') {
      context.emit?.('stripe:stats', {
        charges: state.charges,
        totalAmount: state.totalAmount,
        currency: config.currency,
      });
    }
  },
};

export default stripeHandler;
