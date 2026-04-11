/**
 * @evacuation_zone Trait — Evacuation Zone Management
 *
 * Defines geographic evacuation zones with capacity tracking,
 * route management, and real-time status updates.
 *
 * Usage in .hsplus:
 * ```hsplus
 * @evacuation_zone {
 *   radiusMeters: 500
 *   capacity: 200
 *   status: "active"
 *   routes: ["north_highway", "riverside_path"]
 * }
 * ```
 *
 * @trait evacuation_zone
 * @category emergency-response
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, GeoCoordinate } from './types';

// =============================================================================
// TYPES
// =============================================================================

export type ZoneStatus = 'active' | 'cleared' | 'blocked' | 'standby' | 'compromised';

export interface EvacuationRoute {
  id: string;
  name: string;
  status: 'open' | 'congested' | 'blocked' | 'closed';
  capacityPerHour: number;
  distanceKm: number;
}

export interface EvacuationZoneConfig {
  /** Zone radius in meters from center point */
  radiusMeters: number;
  /** Maximum evacuee capacity */
  capacity: number;
  /** Current zone status */
  status: ZoneStatus;
  /** Current evacuee count */
  currentOccupancy: number;
  /** Named evacuation route IDs */
  routes: string[];
  /** Zone center coordinate */
  center?: GeoCoordinate;
  /** Zone priority level (1 = highest) */
  priorityLevel: number;
  /** Whether zone perimeter is secured */
  perimeterSecured: boolean;
  /** Assembly point identifier */
  assemblyPointId?: string;
}

// =============================================================================
// STATE
// =============================================================================

const zoneRoutes = new Map<string, EvacuationRoute[]>();
const zoneOccupancy = new Map<string, number>();

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const evacuationZoneHandler: TraitHandler<EvacuationZoneConfig> = {
  name: 'evacuation_zone',

  defaultConfig: {
    radiusMeters: 300,
    capacity: 100,
    status: 'standby',
    currentOccupancy: 0,
    routes: [],
    priorityLevel: 3,
    perimeterSecured: false,
  },

  onAttach(node: HSPlusNode, config: EvacuationZoneConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';

    // Initialize route state from config
    const routes: EvacuationRoute[] = config.routes.map((routeId) => ({
      id: routeId,
      name: routeId,
      status: 'open' as const,
      capacityPerHour: 50,
      distanceKm: 1.0,
    }));
    zoneRoutes.set(id, routes);
    zoneOccupancy.set(id, config.currentOccupancy);

    ctx.emit?.('evacuation_zone:attached', {
      nodeId: id,
      radiusMeters: config.radiusMeters,
      capacity: config.capacity,
      status: config.status,
      routeCount: routes.length,
    });
  },

  onDetach(node: HSPlusNode, _config: EvacuationZoneConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';
    zoneRoutes.delete(id);
    zoneOccupancy.delete(id);
    ctx.emit?.('evacuation_zone:detached', { nodeId: id });
  },

  onUpdate(node: HSPlusNode, config: EvacuationZoneConfig, ctx: TraitContext, _delta: number): void {
    const id = node.id ?? 'unknown';
    const occupancy = zoneOccupancy.get(id) ?? 0;

    // Emit capacity warning at 80% and 100%
    const ratio = occupancy / config.capacity;
    if (ratio >= 1.0 && config.status === 'active') {
      ctx.emit?.('evacuation_zone:at_capacity', {
        nodeId: id,
        occupancy,
        capacity: config.capacity,
      });
    } else if (ratio >= 0.8 && config.status === 'active') {
      ctx.emit?.('evacuation_zone:near_capacity', {
        nodeId: id,
        occupancy,
        capacity: config.capacity,
        ratio,
      });
    }
  },

  onEvent(node: HSPlusNode, config: EvacuationZoneConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? 'unknown';
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'evacuation_zone:update_status': {
        const newStatus = event.payload?.status as ZoneStatus | undefined;
        if (newStatus && ['active', 'cleared', 'blocked', 'standby', 'compromised'].includes(newStatus)) {
          const oldStatus = config.status;
          config.status = newStatus;
          ctx.emit?.('evacuation_zone:status_changed', {
            nodeId: id,
            from: oldStatus,
            to: newStatus,
          });
        }
        break;
      }

      case 'evacuation_zone:evacuees_arrived': {
        const count = (event.payload?.count as number) ?? 1;
        const current = (zoneOccupancy.get(id) ?? 0) + count;
        zoneOccupancy.set(id, current);
        config.currentOccupancy = current;
        ctx.emit?.('evacuation_zone:occupancy_updated', {
          nodeId: id,
          occupancy: current,
          capacity: config.capacity,
        });
        break;
      }

      case 'evacuation_zone:evacuees_departed': {
        const count = (event.payload?.count as number) ?? 1;
        const current = Math.max(0, (zoneOccupancy.get(id) ?? 0) - count);
        zoneOccupancy.set(id, current);
        config.currentOccupancy = current;
        ctx.emit?.('evacuation_zone:occupancy_updated', {
          nodeId: id,
          occupancy: current,
          capacity: config.capacity,
        });
        break;
      }

      case 'evacuation_zone:route_blocked': {
        const routeId = event.payload?.routeId as string | undefined;
        const routes = zoneRoutes.get(id);
        if (routeId && routes) {
          const route = routes.find((r) => r.id === routeId);
          if (route) {
            route.status = 'blocked';
            ctx.emit?.('evacuation_zone:route_status_changed', {
              nodeId: id,
              routeId,
              status: 'blocked',
            });

            // Check if all routes are blocked
            if (routes.every((r) => r.status === 'blocked' || r.status === 'closed')) {
              config.status = 'compromised';
              ctx.emit?.('evacuation_zone:all_routes_blocked', { nodeId: id });
            }
          }
        }
        break;
      }

      case 'evacuation_zone:get_routes': {
        const routes = zoneRoutes.get(id) ?? [];
        ctx.emit?.('evacuation_zone:routes', { nodeId: id, routes });
        break;
      }
    }
  },
};

export const EVACUATION_ZONE_TRAIT = {
  name: 'evacuation_zone',
  category: 'emergency-response',
  description: 'Geographic evacuation zone with capacity tracking and route management',
  compileTargets: ['node', 'python', 'headless', 'r3f'],
  requiresRenderer: false,
  parameters: [
    { name: 'radiusMeters', type: 'number', required: true, description: 'Zone radius in meters' },
    { name: 'capacity', type: 'number', required: true, description: 'Max evacuee capacity' },
    { name: 'status', type: 'enum', required: false, enumValues: ['active', 'cleared', 'blocked', 'standby', 'compromised'], default: 'standby', description: 'Current zone status' },
    { name: 'currentOccupancy', type: 'number', required: false, default: 0, description: 'Current evacuee count' },
    { name: 'routes', type: 'array', required: false, default: [], description: 'Evacuation route IDs' },
    { name: 'center', type: 'object', required: false, description: 'Zone center {lat, lng, alt}' },
    { name: 'priorityLevel', type: 'number', required: false, default: 3, description: 'Priority level (1=highest)' },
    { name: 'perimeterSecured', type: 'boolean', required: false, default: false, description: 'Whether perimeter is secured' },
    { name: 'assemblyPointId', type: 'string', required: false, description: 'Assembly point identifier' },
  ],
};

export default evacuationZoneHandler;
