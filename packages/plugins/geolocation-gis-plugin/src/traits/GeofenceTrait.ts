/** @geofence Trait — Geographic boundary monitoring. @trait geofence */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface GeofenceConfig { center: { lat: number; lng: number }; radiusM: number; shape: 'circle' | 'polygon'; polygonPoints?: Array<{ lat: number; lng: number }>; triggerOnEnter: boolean; triggerOnExit: boolean; }
const defaultConfig: GeofenceConfig = { center: { lat: 0, lng: 0 }, radiusM: 100, shape: 'circle', triggerOnEnter: true, triggerOnExit: true };

export function createGeofenceHandler(): TraitHandler<GeofenceConfig> {
  return { name: 'geofence', defaultConfig,
    onAttach(n: HSPlusNode, c: GeofenceConfig, ctx: TraitContext) { n.__geofenceState = { isInside: false, lastCheck: null }; ctx.emit?.('geofence:created', { radius: c.radiusM, shape: c.shape }); },
    onDetach(n: HSPlusNode, _c: GeofenceConfig, ctx: TraitContext) { delete n.__geofenceState; ctx.emit?.('geofence:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: GeofenceConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__geofenceState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'geofence:check') {
        const pos = e.payload as unknown as { lat: number; lng: number };
        const dist = Math.sqrt(Math.pow(pos.lat - c.center.lat, 2) + Math.pow(pos.lng - c.center.lng, 2)) * 111320;
        const inside = dist <= c.radiusM;
        const wasInside = s.isInside as boolean;
        s.isInside = inside; s.lastCheck = Date.now();
        if (inside && !wasInside && c.triggerOnEnter) ctx.emit?.('geofence:entered');
        if (!inside && wasInside && c.triggerOnExit) ctx.emit?.('geofence:exited');
      }
    },
  };
}
