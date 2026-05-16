/**
 * DeviceAdapterBacklog
 *
 * Typed backlog for physical-device adapters that instantiate the
 * digital-twin adapter contract after ADR-2026-05-14 trust primitives.
 */

import type { TrustPermissionEnvelope, TrustSyncState } from './TrustReceipt';

export type DeviceAdapterPriority = 1 | 2 | 3;

export type DeviceAdapterMode =
  | 'read_only_telemetry'
  | 'guarded_bidirectional'
  | 'display_projection'
  | 'voice_command_bridge';

export type DeviceAdapterMutationClass = 'none' | 'guarded' | 'break_glass';

export type DeviceAdapterReadiness =
  | 'ready_for_contract'
  | 'blocked_on_health_trust_spine';

export type DeviceAdapterDomain =
  | 'home'
  | 'vehicle'
  | 'voice'
  | 'display'
  | 'health'
  | 'manufacturing';

export interface DeviceAdapterGate {
  digitalTwinPromotion: 'satisfied';
  evidence: string[];
}

export interface DeviceAdapterTrustContract {
  permissionEnvelope: TrustPermissionEnvelope;
  outboundMutation: DeviceAdapterMutationClass;
  actorPassportDidRequired: true;
  trustReceiptRequired: true;
  layer3OracleRefKind: 'simulation_contract_replay';
  allowedSyncStates: TrustSyncState[];
  localPrivateDataRedaction: boolean;
}

export interface DeviceAdapterContractInstance {
  id: string;
  title: string;
  domain: DeviceAdapterDomain;
  priority: DeviceAdapterPriority;
  mode: DeviceAdapterMode;
  standards: string[];
  readiness: DeviceAdapterReadiness;
  twinSignals: string[];
  trust: DeviceAdapterTrustContract;
  gate: DeviceAdapterGate;
  source: string;
}

export interface DeviceAdapterValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DeviceAdapterBacklogSummary {
  total: number;
  byPriority: Record<DeviceAdapterPriority, number>;
  blockedIds: string[];
  guardedMutationIds: string[];
}

const TRUST_PRIMITIVE_EVIDENCE = [
  'docs/architecture/2026-05-14_trust-primitives-decision-record.md',
  'packages/core/src/trust/TrustReceipt.ts',
  'packages/core/src/trust/TrustLedger.ts',
] as const;

export const DEVICE_ADAPTER_CONTRACT_BACKLOG: readonly DeviceAdapterContractInstance[] = [
  {
    id: 'matter-thread-home',
    title: 'Matter/Thread home digital-twin adapter',
    domain: 'home',
    priority: 1,
    mode: 'guarded_bidirectional',
    standards: ['Matter', 'Thread'],
    readiness: 'ready_for_contract',
    twinSignals: ['device_state', 'occupancy', 'energy_usage', 'actuator_command'],
    trust: {
      permissionEnvelope: 'guarded_execute',
      outboundMutation: 'guarded',
      actorPassportDidRequired: true,
      trustReceiptRequired: true,
      layer3OracleRefKind: 'simulation_contract_replay',
      allowedSyncStates: ['local_only', 'redacted_sync'],
      localPrivateDataRedaction: true,
    },
    gate: {
      digitalTwinPromotion: 'satisfied',
      evidence: [...TRUST_PRIMITIVE_EVIDENCE],
    },
    source: 'device R&D matrix, 2026-05-14 session',
  },
  {
    id: 'obd-ii-advisory',
    title: 'OBD-II vehicle advisory adapter',
    domain: 'vehicle',
    priority: 2,
    mode: 'read_only_telemetry',
    standards: ['OBD-II'],
    readiness: 'ready_for_contract',
    twinSignals: ['diagnostic_code', 'rpm', 'speed', 'coolant_temperature'],
    trust: {
      permissionEnvelope: 'read_only',
      outboundMutation: 'none',
      actorPassportDidRequired: true,
      trustReceiptRequired: true,
      layer3OracleRefKind: 'simulation_contract_replay',
      allowedSyncStates: ['local_only', 'redacted_sync'],
      localPrivateDataRedaction: true,
    },
    gate: {
      digitalTwinPromotion: 'satisfied',
      evidence: [...TRUST_PRIMITIVE_EVIDENCE],
    },
    source: 'device R&D matrix, 2026-05-14 session',
  },
  {
    id: 'sovereign-voice-puck',
    title: 'Sovereign voice-puck spec plus thin Alexa bridge',
    domain: 'voice',
    priority: 2,
    mode: 'voice_command_bridge',
    standards: ['local voice puck', 'Alexa transitional bridge'],
    readiness: 'ready_for_contract',
    twinSignals: ['wake_intent', 'command_transcript', 'device_route', 'approval_state'],
    trust: {
      permissionEnvelope: 'guarded_execute',
      outboundMutation: 'guarded',
      actorPassportDidRequired: true,
      trustReceiptRequired: true,
      layer3OracleRefKind: 'simulation_contract_replay',
      allowedSyncStates: ['local_only', 'redacted_sync'],
      localPrivateDataRedaction: true,
    },
    gate: {
      digitalTwinPromotion: 'satisfied',
      evidence: [...TRUST_PRIMITIVE_EVIDENCE],
    },
    source: 'device R&D matrix, 2026-05-14 session',
  },
  {
    id: 'tv-hololand-display-node',
    title: 'TV as HoloLand display node',
    domain: 'display',
    priority: 2,
    mode: 'display_projection',
    standards: ['HDMI', 'Chromecast-compatible projection'],
    readiness: 'ready_for_contract',
    twinSignals: ['display_session', 'scene_hash', 'frame_witness', 'viewer_presence'],
    trust: {
      permissionEnvelope: 'guarded_execute',
      outboundMutation: 'none',
      actorPassportDidRequired: true,
      trustReceiptRequired: true,
      layer3OracleRefKind: 'simulation_contract_replay',
      allowedSyncStates: ['local_only', 'redacted_sync'],
      localPrivateDataRedaction: false,
    },
    gate: {
      digitalTwinPromotion: 'satisfied',
      evidence: [...TRUST_PRIMITIVE_EVIDENCE],
    },
    source: 'device R&D matrix, 2026-05-14 session',
  },
  {
    id: 'health-wearables-bridge',
    title: 'Health and wearables bridge',
    domain: 'health',
    priority: 3,
    mode: 'read_only_telemetry',
    standards: ['Bluetooth LE', 'FHIR projection'],
    readiness: 'blocked_on_health_trust_spine',
    twinSignals: ['heart_rate', 'activity', 'sleep', 'device_battery'],
    trust: {
      permissionEnvelope: 'read_only',
      outboundMutation: 'none',
      actorPassportDidRequired: true,
      trustReceiptRequired: true,
      layer3OracleRefKind: 'simulation_contract_replay',
      allowedSyncStates: ['local_only', 'redacted_sync'],
      localPrivateDataRedaction: true,
    },
    gate: {
      digitalTwinPromotion: 'satisfied',
      evidence: [...TRUST_PRIMITIVE_EVIDENCE],
    },
    source: 'device R&D matrix, 2026-05-14 session',
  },
  {
    id: 'manufacturing-ros2-fill',
    title: 'Manufacturing fill package plus ROS2 bridge',
    domain: 'manufacturing',
    priority: 3,
    mode: 'guarded_bidirectional',
    standards: ['ROS2', 'manufacturing fill package'],
    readiness: 'ready_for_contract',
    twinSignals: ['robot_state', 'fill_level', 'cycle_phase', 'motion_command'],
    trust: {
      permissionEnvelope: 'break_glass',
      outboundMutation: 'break_glass',
      actorPassportDidRequired: true,
      trustReceiptRequired: true,
      layer3OracleRefKind: 'simulation_contract_replay',
      allowedSyncStates: ['local_only', 'redacted_sync'],
      localPrivateDataRedaction: true,
    },
    gate: {
      digitalTwinPromotion: 'satisfied',
      evidence: [...TRUST_PRIMITIVE_EVIDENCE],
    },
    source: 'device R&D matrix, 2026-05-14 session',
  },
] as const;

const VALID_PERMISSION_ENVELOPES: readonly TrustPermissionEnvelope[] = [
  'read_only',
  'guarded_execute',
  'break_glass',
];

export function validateDeviceAdapterContractInstance(
  instance: DeviceAdapterContractInstance
): DeviceAdapterValidationResult {
  const errors: string[] = [];

  if (!instance.id) errors.push('Missing id');
  if (!instance.title) errors.push('Missing title');
  if (!Number.isInteger(instance.priority) || instance.priority < 1 || instance.priority > 3) {
    errors.push(`Invalid priority: ${instance.priority}`);
  }
  if (!Array.isArray(instance.standards) || instance.standards.length === 0) {
    errors.push('Missing standards');
  }
  if (!Array.isArray(instance.twinSignals) || instance.twinSignals.length === 0) {
    errors.push('Missing twinSignals');
  }
  if (instance.gate?.digitalTwinPromotion !== 'satisfied') {
    errors.push('Digital-twin promotion gate is not satisfied');
  }
  if (!Array.isArray(instance.gate?.evidence) || instance.gate.evidence.length === 0) {
    errors.push('Missing digital-twin promotion evidence');
  }
  if (!instance.trust?.actorPassportDidRequired) {
    errors.push('Device adapters must require actor.passportDid');
  }
  if (!instance.trust?.trustReceiptRequired) {
    errors.push('Device adapters must emit TrustReceipt evidence');
  }
  if (instance.trust?.layer3OracleRefKind !== 'simulation_contract_replay') {
    errors.push('Device adapters must name SimulationContract replay as Layer 3 oracle');
  }
  if (!VALID_PERMISSION_ENVELOPES.includes(instance.trust?.permissionEnvelope)) {
    errors.push(`Invalid permissionEnvelope: ${instance.trust?.permissionEnvelope}`);
  }
  if (instance.trust?.outboundMutation === 'guarded' && instance.trust.permissionEnvelope === 'read_only') {
    errors.push('Guarded outbound mutation cannot use read_only permission');
  }
  if (instance.trust?.outboundMutation === 'break_glass' && instance.trust.permissionEnvelope !== 'break_glass') {
    errors.push('Break-glass outbound mutation must use break_glass permission');
  }
  if (
    instance.domain === 'health' &&
    (!instance.trust?.localPrivateDataRedaction ||
      !instance.trust.allowedSyncStates.includes('redacted_sync'))
  ) {
    errors.push('Health adapters require local-private redaction and redacted sync support');
  }

  return { valid: errors.length === 0, errors };
}

export function summarizeDeviceAdapterBacklog(
  instances: readonly DeviceAdapterContractInstance[] = DEVICE_ADAPTER_CONTRACT_BACKLOG
): DeviceAdapterBacklogSummary {
  const summary: DeviceAdapterBacklogSummary = {
    total: instances.length,
    byPriority: { 1: 0, 2: 0, 3: 0 },
    blockedIds: [],
    guardedMutationIds: [],
  };

  for (const instance of instances) {
    summary.byPriority[instance.priority] += 1;
    if (instance.readiness !== 'ready_for_contract') {
      summary.blockedIds.push(instance.id);
    }
    if (instance.trust.outboundMutation !== 'none') {
      summary.guardedMutationIds.push(instance.id);
    }
  }

  return summary;
}

export function getDeviceAdapterContractInstance(
  id: string,
  instances: readonly DeviceAdapterContractInstance[] = DEVICE_ADAPTER_CONTRACT_BACKLOG
): DeviceAdapterContractInstance | undefined {
  return instances.find((instance) => instance.id === id);
}
