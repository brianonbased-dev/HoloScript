/** @bom Trait — Bill of Materials management. @trait bom */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface BOMItem { partNumber: string; name: string; quantity: number; unit: string; supplier?: string; leadTimeDays: number; costPerUnit: number; }
export interface BOMConfig { items: BOMItem[]; revision: string; product: string; approvedBy?: string; }

const defaultConfig: BOMConfig = { items: [], revision: '1.0', product: '' };

export function createBOMHandler(): TraitHandler<BOMConfig> {
  return { name: 'bom', defaultConfig,
    onAttach(n: HSPlusNode, c: BOMConfig, ctx: TraitContext) {
      const totalCost = c.items.reduce((sum, i) => sum + i.costPerUnit * i.quantity, 0);
      n.__bomState = { totalCost, itemCount: c.items.length, longestLeadTime: Math.max(0, ...c.items.map(i => i.leadTimeDays)) };
      ctx.emit?.('bom:loaded', { items: c.items.length, totalCost });
    },
    onDetach(n: HSPlusNode, _c: BOMConfig, ctx: TraitContext) { delete n.__bomState; ctx.emit?.('bom:unloaded'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: BOMConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'bom:check_availability') { const missing = c.items.filter(i => i.leadTimeDays > 14); ctx.emit?.('bom:availability', { available: c.items.length - missing.length, delayed: missing.length }); }
    },
  };
}
