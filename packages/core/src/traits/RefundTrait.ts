/**
 * RefundTrait — v5.1
 *
 * Refund processing with reason tracking.
 */

import type { TraitHandler } from './TraitTypes';

export interface RefundConfig { max_refund_days: number; }

export const refundHandler: TraitHandler<RefundConfig> = {
  name: 'refund',
  defaultConfig: { max_refund_days: 30 },

  onAttach(node: any): void { node.__refundState = { refunds: [] as Array<{ refundId: string; chargeId: string; amount: number; reason: string }> }; },
  onDetach(node: any): void { delete node.__refundState; },
  onUpdate(): void {},

  onEvent(node: any, _config: RefundConfig, context: any, event: any): void {
    const state = node.__refundState as { refunds: Array<any> } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'refund:process') {
      const refundId = `ref_${Date.now()}`;
      state.refunds.push({ refundId, chargeId: event.chargeId, amount: event.amount, reason: event.reason ?? '' });
      context.emit?.('refund:processed', { refundId, chargeId: event.chargeId, amount: event.amount });
    }
  },
};

export default refundHandler;
