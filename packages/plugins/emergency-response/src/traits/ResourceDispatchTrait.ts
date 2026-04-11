/**
 * @resource_dispatch Trait — Emergency Resource Dispatch
 *
 * Manages dispatch of emergency response units (fire, EMS, police,
 * HAZMAT, search & rescue) with ETA tracking, status management,
 * and coordinate-based deployment.
 *
 * Usage in .hsplus:
 * ```hsplus
 * @resource_dispatch {
 *   unitType: "ems"
 *   unitId: "ambulance-7"
 *   status: "en_route"
 *   etaSeconds: 240
 *   destination: { lat: 40.7128, lng: -74.0060 }
 * }
 * ```
 *
 * @trait resource_dispatch
 * @category emergency-response
 * @version 1.0.0
 */

import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  GeoCoordinate,
  UnitType,
} from './types';

// =============================================================================
// TYPES
// =============================================================================

export type DispatchStatus =
  | 'available'
  | 'dispatched'
  | 'en_route'
  | 'on_scene'
  | 'returning'
  | 'out_of_service';

export interface ResourceDispatchConfig {
  /** Type of response unit */
  unitType: UnitType;
  /** Unique unit identifier */
  unitId: string;
  /** Current dispatch status */
  status: DispatchStatus;
  /** Estimated time of arrival in seconds */
  etaSeconds: number;
  /** Current unit position */
  position?: GeoCoordinate;
  /** Dispatch destination */
  destination?: GeoCoordinate;
  /** Number of personnel on the unit */
  personnelCount: number;
  /** Whether the unit carries specialized equipment */
  specializedEquipment: string[];
  /** Radio channel assigned */
  radioChannel?: string;
  /** Incident ID this unit is assigned to */
  incidentId?: string;
}

// =============================================================================
// STATE
// =============================================================================

const unitEtaCountdowns = new Map<string, number>();
const dispatchLog = new Map<string, Array<{ timestamp: number; status: DispatchStatus; note?: string }>>();

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const resourceDispatchHandler: TraitHandler<ResourceDispatchConfig> = {
  name: 'resource_dispatch',

  defaultConfig: {
    unitType: 'ems',
    unitId: '',
    status: 'available',
    etaSeconds: 0,
    personnelCount: 2,
    specializedEquipment: [],
  },

  onAttach(node: HSPlusNode, config: ResourceDispatchConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';

    // Initialize dispatch log
    dispatchLog.set(id, [{
      timestamp: Date.now(),
      status: config.status,
      note: 'Unit registered',
    }]);

    // Initialize ETA countdown
    unitEtaCountdowns.set(id, config.etaSeconds);

    ctx.emit?.('resource_dispatch:attached', {
      nodeId: id,
      unitType: config.unitType,
      unitId: config.unitId,
      status: config.status,
    });
  },

  onDetach(node: HSPlusNode, _config: ResourceDispatchConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';
    unitEtaCountdowns.delete(id);
    dispatchLog.delete(id);
    ctx.emit?.('resource_dispatch:detached', { nodeId: id });
  },

  onUpdate(node: HSPlusNode, config: ResourceDispatchConfig, ctx: TraitContext, delta: number): void {
    const id = node.id ?? 'unknown';

    // Count down ETA when en_route
    if (config.status === 'en_route' || config.status === 'dispatched') {
      const remaining = Math.max(0, (unitEtaCountdowns.get(id) ?? 0) - delta);
      unitEtaCountdowns.set(id, remaining);
      config.etaSeconds = remaining;

      if (remaining <= 0 && config.status === 'en_route') {
        config.status = 'on_scene';
        const log = dispatchLog.get(id);
        log?.push({ timestamp: Date.now(), status: 'on_scene', note: 'ETA reached' });

        ctx.emit?.('resource_dispatch:arrived', {
          nodeId: id,
          unitId: config.unitId,
          unitType: config.unitType,
        });
      }
    }
  },

  onEvent(node: HSPlusNode, config: ResourceDispatchConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? 'unknown';
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'resource_dispatch:dispatch': {
        const destination = event.payload?.destination as GeoCoordinate | undefined;
        const eta = (event.payload?.etaSeconds as number) ?? 300;
        const incidentId = event.payload?.incidentId as string | undefined;

        config.status = 'dispatched';
        config.etaSeconds = eta;
        config.destination = destination;
        config.incidentId = incidentId;
        unitEtaCountdowns.set(id, eta);

        const log = dispatchLog.get(id);
        log?.push({
          timestamp: Date.now(),
          status: 'dispatched',
          note: `Dispatched to incident ${incidentId ?? 'unknown'}`,
        });

        ctx.emit?.('resource_dispatch:dispatched', {
          nodeId: id,
          unitId: config.unitId,
          unitType: config.unitType,
          destination,
          etaSeconds: eta,
          incidentId,
        });
        break;
      }

      case 'resource_dispatch:en_route': {
        config.status = 'en_route';
        const log = dispatchLog.get(id);
        log?.push({ timestamp: Date.now(), status: 'en_route' });

        ctx.emit?.('resource_dispatch:status_changed', {
          nodeId: id,
          unitId: config.unitId,
          status: 'en_route',
          etaSeconds: config.etaSeconds,
        });
        break;
      }

      case 'resource_dispatch:on_scene': {
        config.status = 'on_scene';
        config.etaSeconds = 0;
        unitEtaCountdowns.set(id, 0);

        const log = dispatchLog.get(id);
        log?.push({ timestamp: Date.now(), status: 'on_scene' });

        ctx.emit?.('resource_dispatch:arrived', {
          nodeId: id,
          unitId: config.unitId,
          unitType: config.unitType,
        });
        break;
      }

      case 'resource_dispatch:return': {
        config.status = 'returning';
        config.destination = undefined;
        config.incidentId = undefined;

        const log = dispatchLog.get(id);
        log?.push({ timestamp: Date.now(), status: 'returning' });

        ctx.emit?.('resource_dispatch:returning', {
          nodeId: id,
          unitId: config.unitId,
        });
        break;
      }

      case 'resource_dispatch:update_position': {
        const position = event.payload?.position as GeoCoordinate | undefined;
        if (position) {
          config.position = position;
          ctx.emit?.('resource_dispatch:position_updated', {
            nodeId: id,
            unitId: config.unitId,
            position,
          });
        }
        break;
      }

      case 'resource_dispatch:get_log': {
        const log = dispatchLog.get(id) ?? [];
        ctx.emit?.('resource_dispatch:log', { nodeId: id, unitId: config.unitId, log });
        break;
      }
    }
  },
};

export const RESOURCE_DISPATCH_TRAIT = {
  name: 'resource_dispatch',
  category: 'emergency-response',
  description: 'Emergency unit dispatch with ETA tracking and status management',
  compileTargets: ['node', 'python', 'headless', 'r3f'],
  requiresRenderer: false,
  parameters: [
    { name: 'unitType', type: 'enum', required: true, enumValues: ['fire', 'ems', 'police', 'hazmat', 'search_rescue'], description: 'Type of response unit' },
    { name: 'unitId', type: 'string', required: true, description: 'Unique unit identifier' },
    { name: 'status', type: 'enum', required: false, enumValues: ['available', 'dispatched', 'en_route', 'on_scene', 'returning', 'out_of_service'], default: 'available', description: 'Dispatch status' },
    { name: 'etaSeconds', type: 'number', required: false, default: 0, description: 'ETA in seconds' },
    { name: 'position', type: 'object', required: false, description: 'Current position {lat, lng, alt}' },
    { name: 'destination', type: 'object', required: false, description: 'Destination {lat, lng, alt}' },
    { name: 'personnelCount', type: 'number', required: false, default: 2, description: 'Number of personnel' },
    { name: 'specializedEquipment', type: 'array', required: false, default: [], description: 'Specialized equipment list' },
    { name: 'radioChannel', type: 'string', required: false, description: 'Assigned radio channel' },
    { name: 'incidentId', type: 'string', required: false, description: 'Assigned incident ID' },
  ],
};

export default resourceDispatchHandler;
