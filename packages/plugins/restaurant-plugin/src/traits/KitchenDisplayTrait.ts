/** @kitchen_display Trait — Kitchen display system (KDS). @trait kitchen_display */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface KitchenTicket { orderId: string; items: string[]; priority: 'normal' | 'rush' | 'vip'; receivedAt: number; startedAt: number | null; completedAt: number | null; }
export interface KitchenDisplayConfig { stations: string[]; maxActiveTickets: number; targetPrepTimeMin: number; }
export interface KitchenDisplayState { activeTickets: KitchenTicket[]; completedToday: number; avgPrepTimeMin: number; }

const defaultConfig: KitchenDisplayConfig = { stations: ['grill', 'salad', 'dessert'], maxActiveTickets: 20, targetPrepTimeMin: 15 };

export function createKitchenDisplayHandler(): TraitHandler<KitchenDisplayConfig> {
  return { name: 'kitchen_display', defaultConfig,
    onAttach(n: HSPlusNode, _c: KitchenDisplayConfig, ctx: TraitContext) { n.__kdsState = { activeTickets: [], completedToday: 0, avgPrepTimeMin: 0 }; ctx.emit?.('kds:online'); },
    onDetach(n: HSPlusNode, _c: KitchenDisplayConfig, ctx: TraitContext) { delete n.__kdsState; ctx.emit?.('kds:offline'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: KitchenDisplayConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__kdsState as KitchenDisplayState | undefined; if (!s) return;
      if (e.type === 'kds:new_ticket') {
        const ticket: KitchenTicket = { orderId: (e.payload?.orderId as string) ?? '', items: (e.payload?.items as string[]) ?? [], priority: (e.payload?.priority as KitchenTicket['priority']) ?? 'normal', receivedAt: Date.now(), startedAt: null, completedAt: null };
        if (s.activeTickets.length < c.maxActiveTickets) { s.activeTickets.push(ticket); ctx.emit?.('kds:ticket_received', { orderId: ticket.orderId }); }
        else ctx.emit?.('kds:queue_full');
      }
      if (e.type === 'kds:complete_ticket') {
        const idx = s.activeTickets.findIndex(t => t.orderId === (e.payload?.orderId as string));
        if (idx >= 0) { const t = s.activeTickets.splice(idx, 1)[0]; t.completedAt = Date.now(); s.completedToday++;
          const prepTime = (t.completedAt - t.receivedAt) / 60000;
          s.avgPrepTimeMin = (s.avgPrepTimeMin * (s.completedToday - 1) + prepTime) / s.completedToday;
          ctx.emit?.('kds:ticket_done', { orderId: t.orderId, prepMin: Math.round(prepTime) });
          if (prepTime > c.targetPrepTimeMin) ctx.emit?.('kds:slow_ticket', { orderId: t.orderId, prepMin: Math.round(prepTime) });
        }
      }
    },
  };
}
