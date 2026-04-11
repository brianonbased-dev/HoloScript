/** @geocode Trait — Address to coordinate conversion. @trait geocode */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface GeocodeConfig { address: string; provider: 'nominatim' | 'google' | 'mapbox'; language: string; }
const defaultConfig: GeocodeConfig = { address: '', provider: 'nominatim', language: 'en' };

export function createGeocodeHandler(): TraitHandler<GeocodeConfig> {
  return { name: 'geocode', defaultConfig,
    onAttach(n: HSPlusNode, _c: GeocodeConfig, ctx: TraitContext) { n.__geocodeState = { result: null, isGeocoding: false }; ctx.emit?.('geocode:ready'); },
    onDetach(n: HSPlusNode, _c: GeocodeConfig, ctx: TraitContext) { delete n.__geocodeState; ctx.emit?.('geocode:detached'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: GeocodeConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__geocodeState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'geocode:lookup') { s.isGeocoding = true; ctx.emit?.('geocode:searching', { address: e.payload?.address }); }
      if (e.type === 'geocode:result') { s.result = e.payload; s.isGeocoding = false; ctx.emit?.('geocode:found', e.payload); }
    },
  };
}
