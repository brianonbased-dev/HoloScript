/**
 * @incident_command Trait — Incident Command System (ICS)
 *
 * Implements the NIMS/ICS organizational structure for emergency
 * management. Tracks the Incident Commander, operational sectors,
 * staging areas, and communication channels.
 *
 * Usage in .hsplus:
 * ```hsplus
 * @incident_command {
 *   incidentName: "Warehouse Fire 2026-04"
 *   commanderName: "Chief Rodriguez"
 *   commanderRole: "incident_commander"
 *   sectors: ["alpha", "bravo", "charlie"]
 *   stagingAreas: ["parking_lot_A", "field_north"]
 *   channels: { command: "TAC-1", tactical: "TAC-2", logistics: "TAC-3" }
 * }
 * ```
 *
 * @trait incident_command
 * @category emergency-response
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, GeoCoordinate, IncidentSeverity } from './types';

// =============================================================================
// TYPES
// =============================================================================

export type ICSRole =
  | 'incident_commander'
  | 'operations_chief'
  | 'planning_chief'
  | 'logistics_chief'
  | 'finance_chief'
  | 'safety_officer'
  | 'public_info_officer'
  | 'liaison_officer'
  | 'sector_leader'
  | 'staging_manager';

export interface ICSSector {
  id: string;
  name: string;
  leader?: string;
  status: 'active' | 'cleared' | 'hazardous' | 'collapsed';
  assignedUnits: string[];
  boundary?: GeoCoordinate[];
}

export interface ICSStagingArea {
  id: string;
  name: string;
  manager?: string;
  capacity: number;
  currentUnits: number;
  location?: GeoCoordinate;
}

export interface ICSChannels {
  command: string;
  tactical?: string;
  logistics?: string;
  medical?: string;
  air?: string;
  [key: string]: string | undefined;
}

export interface IncidentCommandConfig {
  /** Incident name/identifier */
  incidentName: string;
  /** Incident Commander name */
  commanderName: string;
  /** IC's role in the ICS structure */
  commanderRole: ICSRole;
  /** Operational sector IDs */
  sectors: string[];
  /** Staging area IDs */
  stagingAreas: string[];
  /** Communication channel assignments */
  channels: ICSChannels;
  /** Overall incident severity */
  severity: IncidentSeverity;
  /** Whether unified command is active (multi-agency) */
  unifiedCommand: boolean;
  /** Incident start timestamp (ISO 8601) */
  startTime?: string;
  /** Current operational period number */
  operationalPeriod: number;
}

// =============================================================================
// STATE
// =============================================================================

const incidentSectors = new Map<string, ICSSector[]>();
const incidentStagingAreas = new Map<string, ICSStagingArea[]>();
const incidentTimeline = new Map<string, Array<{ timestamp: number; action: string; actor?: string }>>();

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const incidentCommandHandler: TraitHandler<IncidentCommandConfig> = {
  name: 'incident_command',

  defaultConfig: {
    incidentName: '',
    commanderName: '',
    commanderRole: 'incident_commander',
    sectors: [],
    stagingAreas: [],
    channels: { command: 'TAC-1' },
    severity: 'moderate',
    unifiedCommand: false,
    operationalPeriod: 1,
  },

  onAttach(node: HSPlusNode, config: IncidentCommandConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';

    // Initialize sectors from config
    const sectors: ICSSector[] = config.sectors.map((sectorId) => ({
      id: sectorId,
      name: sectorId,
      status: 'active' as const,
      assignedUnits: [],
    }));
    incidentSectors.set(id, sectors);

    // Initialize staging areas from config
    const staging: ICSStagingArea[] = config.stagingAreas.map((areaId) => ({
      id: areaId,
      name: areaId,
      capacity: 20,
      currentUnits: 0,
    }));
    incidentStagingAreas.set(id, staging);

    // Initialize timeline
    incidentTimeline.set(id, [{
      timestamp: Date.now(),
      action: 'Incident command established',
      actor: config.commanderName,
    }]);

    if (!config.startTime) {
      config.startTime = new Date().toISOString();
    }

    ctx.emit?.('incident_command:attached', {
      nodeId: id,
      incidentName: config.incidentName,
      commander: config.commanderName,
      severity: config.severity,
      sectorCount: sectors.length,
      stagingCount: staging.length,
    });
  },

  onDetach(node: HSPlusNode, _config: IncidentCommandConfig, ctx: TraitContext): void {
    const id = node.id ?? 'unknown';
    incidentSectors.delete(id);
    incidentStagingAreas.delete(id);
    incidentTimeline.delete(id);
    ctx.emit?.('incident_command:detached', { nodeId: id });
  },

  onUpdate(node: HSPlusNode, _config: IncidentCommandConfig, _ctx: TraitContext, _delta: number): void {
    // ICS is event-driven; no per-frame updates needed.
    // Could be extended for periodic situation reports.
  },

  onEvent(node: HSPlusNode, config: IncidentCommandConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? 'unknown';
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'incident_command:transfer': {
        const newCommander = event.payload?.commanderName as string | undefined;
        const newRole = event.payload?.role as ICSRole | undefined;
        if (newCommander) {
          const oldCommander = config.commanderName;
          config.commanderName = newCommander;
          if (newRole) config.commanderRole = newRole;

          const timeline = incidentTimeline.get(id);
          timeline?.push({
            timestamp: Date.now(),
            action: `Command transferred from ${oldCommander} to ${newCommander}`,
            actor: newCommander,
          });

          ctx.emit?.('incident_command:transferred', {
            nodeId: id,
            from: oldCommander,
            to: newCommander,
            role: config.commanderRole,
          });
        }
        break;
      }

      case 'incident_command:add_sector': {
        const sectorId = event.payload?.sectorId as string | undefined;
        const leader = event.payload?.leader as string | undefined;
        if (sectorId) {
          const sectors = incidentSectors.get(id) ?? [];
          sectors.push({
            id: sectorId,
            name: event.payload?.name as string ?? sectorId,
            leader,
            status: 'active',
            assignedUnits: [],
          });
          incidentSectors.set(id, sectors);
          config.sectors.push(sectorId);

          const timeline = incidentTimeline.get(id);
          timeline?.push({
            timestamp: Date.now(),
            action: `Sector ${sectorId} established`,
            actor: leader,
          });

          ctx.emit?.('incident_command:sector_added', {
            nodeId: id,
            sectorId,
            leader,
            totalSectors: sectors.length,
          });
        }
        break;
      }

      case 'incident_command:update_sector': {
        const sectorId = event.payload?.sectorId as string | undefined;
        const newStatus = event.payload?.status as ICSSector['status'] | undefined;
        if (sectorId) {
          const sectors = incidentSectors.get(id) ?? [];
          const sector = sectors.find((s) => s.id === sectorId);
          if (sector && newStatus) {
            sector.status = newStatus;

            const timeline = incidentTimeline.get(id);
            timeline?.push({
              timestamp: Date.now(),
              action: `Sector ${sectorId} status → ${newStatus}`,
            });

            ctx.emit?.('incident_command:sector_updated', {
              nodeId: id,
              sectorId,
              status: newStatus,
            });
          }
        }
        break;
      }

      case 'incident_command:assign_unit': {
        const sectorId = event.payload?.sectorId as string | undefined;
        const unitId = event.payload?.unitId as string | undefined;
        if (sectorId && unitId) {
          const sectors = incidentSectors.get(id) ?? [];
          const sector = sectors.find((s) => s.id === sectorId);
          if (sector && !sector.assignedUnits.includes(unitId)) {
            sector.assignedUnits.push(unitId);

            ctx.emit?.('incident_command:unit_assigned', {
              nodeId: id,
              sectorId,
              unitId,
              totalUnitsInSector: sector.assignedUnits.length,
            });
          }
        }
        break;
      }

      case 'incident_command:escalate': {
        const newSeverity = event.payload?.severity as IncidentSeverity | undefined;
        if (newSeverity && ['minor', 'moderate', 'major', 'catastrophic'].includes(newSeverity)) {
          const oldSeverity = config.severity;
          config.severity = newSeverity;

          const timeline = incidentTimeline.get(id);
          timeline?.push({
            timestamp: Date.now(),
            action: `Incident escalated: ${oldSeverity} → ${newSeverity}`,
            actor: config.commanderName,
          });

          ctx.emit?.('incident_command:escalated', {
            nodeId: id,
            from: oldSeverity,
            to: newSeverity,
            incidentName: config.incidentName,
          });
        }
        break;
      }

      case 'incident_command:new_operational_period': {
        config.operationalPeriod += 1;

        const timeline = incidentTimeline.get(id);
        timeline?.push({
          timestamp: Date.now(),
          action: `Operational period ${config.operationalPeriod} started`,
          actor: config.commanderName,
        });

        ctx.emit?.('incident_command:operational_period', {
          nodeId: id,
          period: config.operationalPeriod,
          incidentName: config.incidentName,
        });
        break;
      }

      case 'incident_command:get_sitrep': {
        const sectors = incidentSectors.get(id) ?? [];
        const staging = incidentStagingAreas.get(id) ?? [];
        const timeline = incidentTimeline.get(id) ?? [];

        ctx.emit?.('incident_command:sitrep', {
          nodeId: id,
          incidentName: config.incidentName,
          commander: config.commanderName,
          severity: config.severity,
          operationalPeriod: config.operationalPeriod,
          sectors: sectors.map((s) => ({ id: s.id, status: s.status, units: s.assignedUnits.length })),
          stagingAreas: staging.map((a) => ({ id: a.id, units: a.currentUnits, capacity: a.capacity })),
          timelineEntries: timeline.length,
          unifiedCommand: config.unifiedCommand,
          channels: config.channels,
        });
        break;
      }
    }
  },
};

export const INCIDENT_COMMAND_TRAIT = {
  name: 'incident_command',
  category: 'emergency-response',
  description: 'NIMS/ICS incident command with sectors, staging, and communication management',
  compileTargets: ['node', 'python', 'headless', 'r3f'],
  requiresRenderer: false,
  parameters: [
    { name: 'incidentName', type: 'string', required: true, description: 'Incident name/identifier' },
    { name: 'commanderName', type: 'string', required: true, description: 'Incident Commander name' },
    { name: 'commanderRole', type: 'enum', required: false, enumValues: ['incident_commander', 'operations_chief', 'planning_chief', 'logistics_chief', 'finance_chief', 'safety_officer', 'public_info_officer', 'liaison_officer', 'sector_leader', 'staging_manager'], default: 'incident_commander', description: 'IC role' },
    { name: 'sectors', type: 'array', required: false, default: [], description: 'Operational sector IDs' },
    { name: 'stagingAreas', type: 'array', required: false, default: [], description: 'Staging area IDs' },
    { name: 'channels', type: 'object', required: false, description: 'Communication channel map' },
    { name: 'severity', type: 'enum', required: false, enumValues: ['minor', 'moderate', 'major', 'catastrophic'], default: 'moderate', description: 'Incident severity' },
    { name: 'unifiedCommand', type: 'boolean', required: false, default: false, description: 'Whether unified command (multi-agency) is active' },
    { name: 'operationalPeriod', type: 'number', required: false, default: 1, description: 'Current operational period number' },
  ],
};

export default incidentCommandHandler;
