/**
 * RefundTrait — v5.1
 *
 * Refund processing with reason tracking.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface RefundConfig {
  max_refund_days: number;
}

export const refundHandler: TraitHandler<RefundConfig> = {
  name: 'refund',
  defaultConfig: { max_refund_days: 30 },

  onAttach(node: HSPlusNode): void {
    node.__refundState = {
      refunds: [] as Array<{ refundId: string; chargeId: string; amount: number; reason: string }>,
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__refundState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, _config: RefundConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__refundState as { refunds: Array<any> } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'refund:process') {
      const refundId = `ref_${Date.now()}`;
      state.refunds.push({
        refundId,
        chargeId: event.chargeId,
        amount: event.amount,
        reason: event.reason ?? '',
      });
      context.emit?.('refund:processed', {
        refundId,
        chargeId: event.chargeId,
        amount: event.amount,
      });
    }
  },
};

export default refundHandler;
