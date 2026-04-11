/** @rate_management Trait — Dynamic pricing and rate control. @trait rate_management */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface RatePeriod { startDate: string; endDate: string; rate: number; minStay: number; }
export interface RateManagementConfig { baseRate: number; currency: string; seasons: RatePeriod[]; weekendMultiplier: number; dynamicPricingEnabled: boolean; minRate: number; maxRate: number; }
export interface RateManagementState { currentRate: number; occupancyPercent: number; revenueToday: number; }

const defaultConfig: RateManagementConfig = { baseRate: 100, currency: 'USD', seasons: [], weekendMultiplier: 1.2, dynamicPricingEnabled: false, minRate: 50, maxRate: 500 };

export function createRateManagementHandler(): TraitHandler<RateManagementConfig> {
  return { name: 'rate_management', defaultConfig,
    onAttach(n: HSPlusNode, c: RateManagementConfig, ctx: TraitContext) { n.__rateState = { currentRate: c.baseRate, occupancyPercent: 0, revenueToday: 0 }; ctx.emit?.('rate:configured', { base: c.baseRate }); },
    onDetach(n: HSPlusNode, _c: RateManagementConfig, ctx: TraitContext) { delete n.__rateState; ctx.emit?.('rate:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: RateManagementConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__rateState as RateManagementState | undefined; if (!s) return;
      if (e.type === 'rate:update_occupancy') {
        s.occupancyPercent = (e.payload?.occupancy as number) ?? 0;
        if (c.dynamicPricingEnabled) { s.currentRate = Math.min(c.maxRate, Math.max(c.minRate, c.baseRate * (1 + s.occupancyPercent / 100))); ctx.emit?.('rate:adjusted', { rate: s.currentRate, occupancy: s.occupancyPercent }); }
      }
      if (e.type === 'rate:record_sale') { s.revenueToday += s.currentRate; ctx.emit?.('rate:sale_recorded', { revenue: s.revenueToday }); }
    },
  };
}
