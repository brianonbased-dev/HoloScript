/**
 * SubscriptionTrait — v5.1
 *
 * Recurring subscription lifecycle.
 */

import type { TraitHandler } from './TraitTypes';

export interface SubscriptionConfig { plans: string[]; }

export const subscriptionHandler: TraitHandler<SubscriptionConfig> = {
  name: 'subscription',
  defaultConfig: { plans: ['free', 'pro', 'enterprise'] },

  onAttach(node: any): void { node.__subState = { subs: new Map<string, { plan: string; status: string; started: number }>() }; },
  onDetach(node: any): void { delete node.__subState; },
  onUpdate(): void {},

  onEvent(node: any, _config: SubscriptionConfig, context: any, event: any): void {
    const state = node.__subState as { subs: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'subscription:create': {
        const subId = `sub_${Date.now()}`;
        state.subs.set(subId, { plan: event.plan, status: 'active', started: Date.now() });
        context.emit?.('subscription:created', { subscriptionId: subId, plan: event.plan });
        break;
      }
      case 'subscription:cancel': {
        const sub = state.subs.get(event.subscriptionId as string);
        if (sub) { sub.status = 'cancelled'; }
        context.emit?.('subscription:cancelled', { subscriptionId: event.subscriptionId });
        break;
      }
      case 'subscription:upgrade': {
        const sub = state.subs.get(event.subscriptionId as string);
        if (sub) { sub.plan = event.newPlan as string; }
        context.emit?.('subscription:upgraded', { subscriptionId: event.subscriptionId, newPlan: event.newPlan });
        break;
      }
    }
  },
};

export default subscriptionHandler;
