/** @map_view Trait — Interactive map display. @trait map_view */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface MapViewConfig { center: { lat: number; lng: number }; zoom: number; tileProvider: 'osm' | 'mapbox' | 'google' | 'custom'; style: 'streets' | 'satellite' | 'terrain' | 'dark'; maxZoom: number; minZoom: number; }
const defaultConfig: MapViewConfig = { center: { lat: 0, lng: 0 }, zoom: 10, tileProvider: 'osm', style: 'streets', maxZoom: 18, minZoom: 1 };

export function createMapViewHandler(): TraitHandler<MapViewConfig> {
  return { name: 'map_view', defaultConfig,
    onAttach(n: HSPlusNode, c: MapViewConfig, ctx: TraitContext) { n.__mapState = { center: c.center, zoom: c.zoom, bounds: null }; ctx.emit?.('map:ready', { center: c.center }); },
    onDetach(n: HSPlusNode, _c: MapViewConfig, ctx: TraitContext) { delete n.__mapState; ctx.emit?.('map:destroyed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: MapViewConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__mapState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'map:pan') { s.center = e.payload?.center; ctx.emit?.('map:moved', { center: s.center }); }
      if (e.type === 'map:zoom') { s.zoom = e.payload?.zoom; ctx.emit?.('map:zoomed', { zoom: s.zoom }); }
    },
  };
}
