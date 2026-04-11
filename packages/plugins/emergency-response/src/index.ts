/**
 * @holoscript/plugin-emergency-response
 *
 * Domain plugin for emergency response simulation and management.
 * Provides four core traits for the ICS (Incident Command System):
 *
 *   - @triage — Mass casualty triage with START/JumpSTART/SALT/SMART
 *   - @evacuation_zone — Geographic zones with capacity and route tracking
 *   - @resource_dispatch — Unit dispatch with ETA and status management
 *   - @incident_command — NIMS/ICS organizational structure
 *
 * This plugin is data + handlers — zero modifications to HoloScript core.
 * Domain vocabulary enhances the schema mapper for emergency-specific terms.
 *
 * Usage:
 *   import { registerEmergencyResponsePlugin, triageHandler } from '@holoscript/plugin-emergency-response';
 *   registerEmergencyResponsePlugin(runtime);
 *
 * @module @holoscript/plugin-emergency-response
 */

// ─── Trait Handlers ────────────────────────────────────────────────────────────

export { triageHandler, TRIAGE_TRAIT } from './traits/TriageTrait';
export type { TriageConfig, TriagePriority, AssessmentMethod, TriageStatistics } from './traits/TriageTrait';

export { evacuationZoneHandler, EVACUATION_ZONE_TRAIT } from './traits/EvacuationZoneTrait';
export type { EvacuationZoneConfig, ZoneStatus, EvacuationRoute } from './traits/EvacuationZoneTrait';

export { resourceDispatchHandler, RESOURCE_DISPATCH_TRAIT } from './traits/ResourceDispatchTrait';
export type { ResourceDispatchConfig, DispatchStatus } from './traits/ResourceDispatchTrait';

export { incidentCommandHandler, INCIDENT_COMMAND_TRAIT } from './traits/IncidentCommandTrait';
export type {
  IncidentCommandConfig,
  ICSRole,
  ICSSector,
  ICSStagingArea,
  ICSChannels,
} from './traits/IncidentCommandTrait';

// ─── Shared Types ──────────────────────────────────────────────────────────────

export type { HSPlusNode, TraitHandler, TraitContext, TraitEvent, GeoCoordinate, UnitType, IncidentSeverity } from './traits/types';

// ─── Plugin Registration ───────────────────────────────────────────────────────

import { triageHandler } from './traits/TriageTrait';
import { evacuationZoneHandler } from './traits/EvacuationZoneTrait';
import { resourceDispatchHandler } from './traits/ResourceDispatchTrait';
import { incidentCommandHandler } from './traits/IncidentCommandTrait';
import type { TraitHandler } from './traits/types';

/** All trait handlers exported by this plugin */
export const EMERGENCY_RESPONSE_TRAITS: TraitHandler[] = [
  triageHandler,
  evacuationZoneHandler,
  resourceDispatchHandler,
  incidentCommandHandler,
];

/** Domain keywords for the schema mapper */
export const EMERGENCY_RESPONSE_KEYWORDS = [
  { term: 'triage', traits: ['triage'], spatialRole: 'zone', description: 'Mass casualty triage classification' },
  { term: 'evacuate', traits: ['evacuation_zone'], spatialRole: 'zone', description: 'Evacuation zone management' },
  { term: 'evacuation', traits: ['evacuation_zone'], spatialRole: 'zone', description: 'Evacuation zone management' },
  { term: 'dispatch', traits: ['resource_dispatch'], spatialRole: 'unit', description: 'Emergency unit dispatch' },
  { term: 'ambulance', traits: ['resource_dispatch'], spatialRole: 'unit', description: 'EMS ambulance unit' },
  { term: 'fire truck', traits: ['resource_dispatch'], spatialRole: 'unit', description: 'Fire apparatus' },
  { term: 'incident command', traits: ['incident_command'], spatialRole: 'command_post', description: 'ICS command structure' },
  { term: 'staging area', traits: ['incident_command'], spatialRole: 'zone', description: 'Resource staging area' },
  { term: 'hazmat', traits: ['resource_dispatch', 'evacuation_zone'], spatialRole: 'zone', description: 'Hazardous materials incident' },
  { term: 'mass casualty', traits: ['triage', 'incident_command'], spatialRole: 'zone', description: 'Mass casualty incident' },
  { term: 'perimeter', traits: ['evacuation_zone'], spatialRole: 'boundary', description: 'Incident perimeter' },
  { term: 'sector', traits: ['incident_command'], spatialRole: 'zone', description: 'ICS operational sector' },
];

/**
 * Register all emergency response traits with a HoloScript runtime.
 *
 * The runtime is typed as `unknown` to avoid a hard dependency on
 * @holoscript/core. It expects a `registerTrait(handler)` method.
 */
export function registerEmergencyResponsePlugin(runtime: unknown): void {
  const rt = runtime as { registerTrait?: (handler: TraitHandler) => void };

  if (typeof rt.registerTrait !== 'function') {
    throw new Error(
      'registerEmergencyResponsePlugin requires a runtime with registerTrait(handler). ' +
      'Pass the HoloScriptRuntime instance.'
    );
  }

  for (const handler of EMERGENCY_RESPONSE_TRAITS) {
    rt.registerTrait(handler);
  }
}

export const VERSION = '1.0.0';
