/** @cart Trait — Shopping cart management. @trait cart */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface CartItem { productId: string; quantity: number; price: number; variant?: string; name: string; }
export interface CartConfig { currency: string; items: CartItem[]; maxItems: number; taxRate: number; }
export interface CartState { items: CartItem[]; subtotal: number; tax: number; total: number; itemCount: number; }

const defaultConfig: CartConfig = { currency: 'USD', items: [], maxItems: 99, taxRate: 0 };

function computeTotals(items: CartItem[], taxRate: number): Pick<CartState, 'subtotal' | 'tax' | 'total' | 'itemCount'> {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = subtotal * taxRate;
  return { subtotal, tax, total: subtotal + tax, itemCount: items.reduce((sum, i) => sum + i.quantity, 0) };
}

export function createCartHandler(): TraitHandler<CartConfig> {
  return {
    name: 'cart', defaultConfig,
    onAttach(node: HSPlusNode, config: CartConfig, ctx: TraitContext) {
      const totals = computeTotals(config.items, config.taxRate);
      node.__cartState = { items: [...config.items], ...totals };
      ctx.emit?.('cart:created', { itemCount: totals.itemCount });
    },
    onDetach(node: HSPlusNode, _c: CartConfig, ctx: TraitContext) { delete node.__cartState; ctx.emit?.('cart:cleared'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, config: CartConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__cartState as CartState | undefined; if (!s) return;
      if (event.type === 'cart:add_item') {
        const item = event.payload as unknown as CartItem;
        const existing = s.items.find(i => i.productId === item.productId && i.variant === item.variant);
        if (existing) existing.quantity += item.quantity; else s.items.push({ ...item });
        Object.assign(s, computeTotals(s.items, config.taxRate));
        ctx.emit?.('cart:updated', { itemCount: s.itemCount, total: s.total });
      }
      if (event.type === 'cart:remove_item') {
        s.items = s.items.filter(i => i.productId !== (event.payload?.productId as string));
        Object.assign(s, computeTotals(s.items, config.taxRate));
        ctx.emit?.('cart:updated', { itemCount: s.itemCount, total: s.total });
      }
    },
  };
}
