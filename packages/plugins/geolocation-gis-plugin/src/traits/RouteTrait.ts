/** @route Trait — Route planning and navigation. @trait route */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface Waypoint { lat: number; lng: number; label?: string; }
export interface RouteConfig { origin: Waypoint; destination: Waypoint; waypoints: Waypoint[]; mode: 'driving' | 'walking' | 'cycling' | 'transit'; avoidTolls: boolean; avoidHighways: boolean; }
const defaultConfig: RouteConfig = { origin: { lat: 0, lng: 0 }, destination: { lat: 0, lng: 0 }, waypoints: [], mode: 'driving', avoidTolls: false, avoidHighways: false };

export function createRouteHandler(): TraitHandler<RouteConfig> {
  return { name: 'route', defaultConfig,
    onAttach(n: HSPlusNode, c: RouteConfig, ctx: TraitContext) { n.__routeState = { distanceKm: 0, durationMin: 0, isCalculating: false }; ctx.emit?.('route:created', { mode: c.mode }); },
    onDetach(n: HSPlusNode, _c: RouteConfig, ctx: TraitContext) { delete n.__routeState; ctx.emit?.('route:cleared'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: RouteConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'route:calculate') { const s = n.__routeState as Record<string, unknown>; if (s) { s.isCalculating = true; ctx.emit?.('route:calculating'); } }
      if (e.type === 'route:result') { const s = n.__routeState as Record<string, unknown>; if (s) { s.distanceKm = e.payload?.distanceKm; s.durationMin = e.payload?.durationMin; s.isCalculating = false; ctx.emit?.('route:calculated', e.payload); } }
    },
  };
}
