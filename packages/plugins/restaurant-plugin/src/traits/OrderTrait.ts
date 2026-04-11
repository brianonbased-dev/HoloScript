/** @order Trait — Customer order lifecycle. @trait order */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'paid' | 'cancelled';
export interface OrderItem { menuItemId: string; name: string; quantity: number; price: number; modifications?: string[]; }
export interface OrderConfig { tableNumber: number; items: OrderItem[]; orderType: 'dine_in' | 'takeout' | 'delivery'; }
export interface OrderState { status: OrderStatus; orderId: string; subtotal: number; createdAt: number; }

const defaultConfig: OrderConfig = { tableNumber: 0, items: [], orderType: 'dine_in' };

export function createOrderHandler(): TraitHandler<OrderConfig> {
  return { name: 'order', defaultConfig,
    onAttach(n: HSPlusNode, c: OrderConfig, ctx: TraitContext) {
      const subtotal = c.items.reduce((s, i) => s + i.price * i.quantity, 0);
      n.__orderState = { status: 'new' as OrderStatus, orderId: `ORD-${Date.now()}`, subtotal, createdAt: Date.now() };
      ctx.emit?.('order:created', { table: c.tableNumber, items: c.items.length, subtotal });
    },
    onDetach(n: HSPlusNode, _c: OrderConfig, ctx: TraitContext) { delete n.__orderState; ctx.emit?.('order:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: OrderConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__orderState as OrderState | undefined; if (!s) return;
      const flow: OrderStatus[] = ['new','confirmed','preparing','ready','served','paid'];
      if (e.type === 'order:advance') { const i = flow.indexOf(s.status); if (i < flow.length - 1) { s.status = flow[i+1]; ctx.emit?.('order:status_changed', { status: s.status, orderId: s.orderId }); } }
      if (e.type === 'order:cancel') { s.status = 'cancelled'; ctx.emit?.('order:cancelled', { orderId: s.orderId }); }
    },
  };
}
