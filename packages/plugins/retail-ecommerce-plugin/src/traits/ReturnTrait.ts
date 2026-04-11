/** @return Trait — Return and refund management. @trait return */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ReturnStatus = 'requested' | 'approved' | 'shipped' | 'received' | 'refunded' | 'denied';
export interface ReturnConfig { orderId: string; reason: string; status: ReturnStatus; refundAmount: number; returnWindowDays: number; }

const defaultConfig: ReturnConfig = { orderId: '', reason: '', status: 'requested', refundAmount: 0, returnWindowDays: 30 };

export function createReturnHandler(): TraitHandler<ReturnConfig> {
  return {
    name: 'return', defaultConfig,
    onAttach(node: HSPlusNode, config: ReturnConfig, ctx: TraitContext) { node.__returnState = { ...config, requestedAt: Date.now() }; ctx.emit?.('return:created', { orderId: config.orderId }); },
    onDetach(node: HSPlusNode, _c: ReturnConfig, ctx: TraitContext) { delete node.__returnState; ctx.emit?.('return:cancelled'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, _c: ReturnConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__returnState as Record<string, unknown> | undefined; if (!s) return;
      if (event.type === 'return:approve') { s.status = 'approved'; ctx.emit?.('return:approved'); }
      if (event.type === 'return:ship') { s.status = 'shipped'; ctx.emit?.('return:shipped'); }
      if (event.type === 'return:receive') { s.status = 'received'; ctx.emit?.('return:received'); }
      if (event.type === 'return:refund') { s.status = 'refunded'; ctx.emit?.('return:refunded', { amount: s.refundAmount }); }
    },
  };
}
