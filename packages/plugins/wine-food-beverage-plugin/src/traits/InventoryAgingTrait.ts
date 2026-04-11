/** @inventory_aging Trait — Cellar/barrel aging and inventory management. @trait inventory_aging */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface AgingItem { id: string; product: string; barrelType?: string; startDate: string; targetAgingMonths: number; currentMonths: number; temperature: number; humidity: number; }
export interface InventoryAgingConfig { items: AgingItem[]; cellarCapacity: number; optimalTempC: number; optimalHumidityPercent: number; }
export interface InventoryAgingState { totalItems: number; readyToBottle: number; avgAgingMonths: number; }

const defaultConfig: InventoryAgingConfig = { items: [], cellarCapacity: 100, optimalTempC: 13, optimalHumidityPercent: 70 };

export function createInventoryAgingHandler(): TraitHandler<InventoryAgingConfig> {
  return { name: 'inventory_aging', defaultConfig,
    onAttach(n: HSPlusNode, c: InventoryAgingConfig, ctx: TraitContext) {
      const ready = c.items.filter(i => i.currentMonths >= i.targetAgingMonths).length;
      const avg = c.items.length > 0 ? c.items.reduce((s, i) => s + i.currentMonths, 0) / c.items.length : 0;
      n.__agingState = { totalItems: c.items.length, readyToBottle: ready, avgAgingMonths: avg };
      ctx.emit?.('aging:loaded', { items: c.items.length, ready });
    },
    onDetach(n: HSPlusNode, _c: InventoryAgingConfig, ctx: TraitContext) { delete n.__agingState; ctx.emit?.('aging:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: InventoryAgingConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'aging:check_ready') {
        const ready = c.items.filter(i => i.currentMonths >= i.targetAgingMonths);
        ctx.emit?.('aging:ready_list', { count: ready.length, items: ready.map(i => ({ id: i.id, product: i.product, months: i.currentMonths })) });
      }
      if (e.type === 'aging:environment_alert') {
        const temp = (e.payload?.temperature as number) ?? c.optimalTempC;
        const hum = (e.payload?.humidity as number) ?? c.optimalHumidityPercent;
        if (Math.abs(temp - c.optimalTempC) > 3 || Math.abs(hum - c.optimalHumidityPercent) > 10) ctx.emit?.('aging:environment_warning', { temp, humidity: hum });
      }
    },
  };
}
