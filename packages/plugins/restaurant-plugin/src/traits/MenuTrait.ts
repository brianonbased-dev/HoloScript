/** @menu Trait — Restaurant menu management. @trait menu */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface MenuItem { id: string; name: string; price: number; category: string; description: string; allergens: string[]; calories?: number; available: boolean; }
export interface MenuConfig { items: MenuItem[]; currency: string; taxRate: number; serviceChargePercent: number; }

const defaultConfig: MenuConfig = { items: [], currency: 'USD', taxRate: 0.08, serviceChargePercent: 0 };

export function createMenuHandler(): TraitHandler<MenuConfig> {
  return { name: 'menu', defaultConfig,
    onAttach(n: HSPlusNode, c: MenuConfig, ctx: TraitContext) { n.__menuState = { availableItems: c.items.filter(i => i.available).length, categories: [...new Set(c.items.map(i => i.category))] }; ctx.emit?.('menu:loaded', { items: c.items.length }); },
    onDetach(n: HSPlusNode, _c: MenuConfig, ctx: TraitContext) { delete n.__menuState; ctx.emit?.('menu:unloaded'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: MenuConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'menu:search') { const q = ((e.payload?.query as string) ?? '').toLowerCase(); const results = c.items.filter(i => i.available && (i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))); ctx.emit?.('menu:results', { count: results.length, items: results.map(r => ({ id: r.id, name: r.name, price: r.price })) }); }
      if (e.type === 'menu:toggle_availability') { const item = c.items.find(i => i.id === (e.payload?.itemId as string)); if (item) { item.available = !item.available; ctx.emit?.('menu:availability_changed', { item: item.name, available: item.available }); } }
    },
  };
}
