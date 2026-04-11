/** @garment Trait — Clothing item definition. @trait garment */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type GarmentCategory = 'top' | 'bottom' | 'dress' | 'outerwear' | 'footwear' | 'accessory' | 'swimwear' | 'activewear';
export interface GarmentConfig { name: string; category: GarmentCategory; sizes: string[]; colors: string[]; fabric: string; weight_gsm: number; season: 'spring' | 'summer' | 'fall' | 'winter' | 'all'; price: number; sku: string; }

const defaultConfig: GarmentConfig = { name: '', category: 'top', sizes: ['S','M','L'], colors: ['black'], fabric: 'cotton', weight_gsm: 200, season: 'all', price: 0, sku: '' };

export function createGarmentHandler(): TraitHandler<GarmentConfig> {
  return { name: 'garment', defaultConfig,
    onAttach(n: HSPlusNode, c: GarmentConfig, ctx: TraitContext) { n.__garmentState = { variants: c.sizes.length * c.colors.length, inStock: true }; ctx.emit?.('garment:created', { name: c.name, category: c.category }); },
    onDetach(n: HSPlusNode, _c: GarmentConfig, ctx: TraitContext) { delete n.__garmentState; ctx.emit?.('garment:removed'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: GarmentConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'garment:check_fit') { ctx.emit?.('garment:fit_result', { garment: c.name, sizes: c.sizes }); }
    },
  };
}
