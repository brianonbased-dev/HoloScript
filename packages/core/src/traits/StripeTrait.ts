/**
 * StripeTrait — v5.1
 *
 * Stripe charge / payment intent.
 */

import type { TraitHandler } from './TraitTypes';

export interface StripeConfig {
  currency: string;
}

export const stripeHandler: TraitHandler<StripeConfig> = {
  name: 'stripe',
  defaultConfig: { currency: 'usd' },

  onAttach(node: any): void {
    node.__stripeState = { charges: 0, totalAmount: 0 };
  },
  onDetach(node: any): void {
    delete node.__stripeState;
  },
  onUpdate(): void {},

  onEvent(node: any, config: StripeConfig, context: any, event: any): void {
    const state = node.__stripeState as { charges: number; totalAmount: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    if (t === 'stripe:charge') {
      state.charges++;
      state.totalAmount += (event.amount as number) ?? 0;
      context.emit?.('stripe:charged', {
        chargeId: `ch_${Date.now()}`,
        amount: event.amount,
        currency: config.currency,
        customerId: event.customerId,
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
