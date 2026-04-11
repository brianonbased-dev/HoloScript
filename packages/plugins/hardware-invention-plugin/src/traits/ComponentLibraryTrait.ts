/** @component_library Trait — Electronic component database. @trait component_library */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ComponentCategory = 'resistor' | 'capacitor' | 'inductor' | 'ic' | 'connector' | 'led' | 'transistor' | 'diode' | 'sensor' | 'mcu' | 'power';
export interface Component { partNumber: string; name: string; category: ComponentCategory; package: string; value?: string; voltage?: number; footprint: string; datasheet?: string; supplier: string; unitCost: number; inStock: number; }
export interface ComponentLibraryConfig { components: Component[]; preferredSuppliers: string[]; }

const defaultConfig: ComponentLibraryConfig = { components: [], preferredSuppliers: [] };

export function createComponentLibraryHandler(): TraitHandler<ComponentLibraryConfig> {
  return { name: 'component_library', defaultConfig,
    onAttach(n: HSPlusNode, c: ComponentLibraryConfig, ctx: TraitContext) { n.__compLibState = { count: c.components.length }; ctx.emit?.('component_library:loaded', { components: c.components.length }); },
    onDetach(n: HSPlusNode, _c: ComponentLibraryConfig, ctx: TraitContext) { delete n.__compLibState; ctx.emit?.('component_library:unloaded'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: ComponentLibraryConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'component_library:search') { const q = ((e.payload?.query as string) ?? '').toLowerCase(); const results = c.components.filter(comp => comp.name.toLowerCase().includes(q) || comp.partNumber.toLowerCase().includes(q)); ctx.emit?.('component_library:results', { count: results.length, components: results.slice(0, 20).map(r => ({ part: r.partNumber, name: r.name, cost: r.unitCost })) }); }
      if (e.type === 'component_library:bom_cost') { const ids = (e.payload?.partNumbers as string[]) ?? []; const total = ids.reduce((sum, id) => { const comp = c.components.find(c2 => c2.partNumber === id); return sum + (comp?.unitCost ?? 0); }, 0); ctx.emit?.('component_library:bom_total', { total, parts: ids.length }); }
    },
  };
}
