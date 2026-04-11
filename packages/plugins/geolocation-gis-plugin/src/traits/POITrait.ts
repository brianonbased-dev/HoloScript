/** @poi Trait — Point of Interest. @trait poi */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface POIConfig { name: string; lat: number; lng: number; category: string; icon?: string; description?: string; rating?: number; }
const defaultConfig: POIConfig = { name: '', lat: 0, lng: 0, category: 'general' };

export function createPOIHandler(): TraitHandler<POIConfig> {
  return { name: 'poi', defaultConfig,
    onAttach(n: HSPlusNode, c: POIConfig, ctx: TraitContext) { n.__poiState = { visible: true, selected: false }; ctx.emit?.('poi:added', { name: c.name, category: c.category }); },
    onDetach(n: HSPlusNode, _c: POIConfig, ctx: TraitContext) { delete n.__poiState; ctx.emit?.('poi:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: POIConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__poiState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'poi:select') { s.selected = true; ctx.emit?.('poi:selected', { name: c.name }); }
      if (e.type === 'poi:deselect') { s.selected = false; ctx.emit?.('poi:deselected'); }
    },
  };
}
