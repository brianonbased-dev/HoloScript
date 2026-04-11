/** @itinerary Trait — Trip itinerary planning. @trait itinerary */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface ItineraryItem { id: string; day: number; time: string; activity: string; location: string; durationMin: number; bookingRef?: string; notes?: string; }
export interface ItineraryConfig { tripName: string; startDate: string; endDate: string; travelers: number; items: ItineraryItem[]; }
export interface ItineraryState { currentDay: number; completedItems: string[]; totalDays: number; }

const defaultConfig: ItineraryConfig = { tripName: '', startDate: '', endDate: '', travelers: 1, items: [] };

export function createItineraryHandler(): TraitHandler<ItineraryConfig> {
  return { name: 'itinerary', defaultConfig,
    onAttach(n: HSPlusNode, c: ItineraryConfig, ctx: TraitContext) {
      const days = c.startDate && c.endDate ? Math.max(1, Math.ceil((new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / 86400000)) : 1;
      n.__itinState = { currentDay: 1, completedItems: [], totalDays: days };
      ctx.emit?.('itinerary:planned', { days, items: c.items.length });
    },
    onDetach(n: HSPlusNode, _c: ItineraryConfig, ctx: TraitContext) { delete n.__itinState; ctx.emit?.('itinerary:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: ItineraryConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__itinState as ItineraryState | undefined; if (!s) return;
      if (e.type === 'itinerary:complete_item') { const id = e.payload?.itemId as string; if (!s.completedItems.includes(id)) { s.completedItems.push(id); ctx.emit?.('itinerary:item_done', { id, completed: s.completedItems.length }); } }
      if (e.type === 'itinerary:next_day') { s.currentDay = Math.min(s.totalDays, s.currentDay + 1); ctx.emit?.('itinerary:day_changed', { day: s.currentDay }); }
    },
  };
}
