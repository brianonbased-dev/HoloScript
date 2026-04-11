/** @shipping_rate Trait — Shipping cost calculation. @trait shipping_rate */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ShippingMethod = 'standard' | 'express' | 'overnight' | 'freight' | 'pickup';
export interface ShippingRateConfig { carrier: string; method: ShippingMethod; weightKg: number; dimensions: { lengthCm: number; widthCm: number; heightCm: number; }; origin: string; destination: string; rate: number; estimatedDays: number; }

const defaultConfig: ShippingRateConfig = { carrier: '', method: 'standard', weightKg: 0, dimensions: { lengthCm: 0, widthCm: 0, heightCm: 0 }, origin: '', destination: '', rate: 0, estimatedDays: 5 };

export function createShippingRateHandler(): TraitHandler<ShippingRateConfig> {
  return {
    name: 'shipping_rate', defaultConfig,
    onAttach(node: HSPlusNode, config: ShippingRateConfig, ctx: TraitContext) { node.__shippingState = { calculatedRate: config.rate, carrier: config.carrier }; ctx.emit?.('shipping:rate_set', { rate: config.rate, method: config.method }); },
    onDetach(node: HSPlusNode, _c: ShippingRateConfig, ctx: TraitContext) { delete node.__shippingState; ctx.emit?.('shipping:cleared'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, config: ShippingRateConfig, ctx: TraitContext, event: TraitEvent) {
      if (event.type === 'shipping:calculate') { ctx.emit?.('shipping:calculated', { rate: config.rate, estimatedDays: config.estimatedDays, carrier: config.carrier }); }
    },
  };
}
