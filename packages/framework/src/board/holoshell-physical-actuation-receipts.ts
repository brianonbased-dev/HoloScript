/**
 * HoloShell Physical Actuation Receipts
 *
 * Reusable substrate contract for hardware actions that can affect the physical
 * world. HoloLand owns the room and operator experience; HoloScript owns the
 * receipt vocabulary that proves simulation, freshness, safe stop, rollback
 * limits, replay, and taskability.
 */

import type { ArtifactHashAlgorithm } from './board-types';
import type {
  DeviceActionReceipt,
  HoloShellDeviceSafetyReceiptPack,
  ReplayLessonReceipt,
} from './holoshell-device-safety-receipts';
import type { HoloShellPermissionGateReceiptPack } from './holoshell-permission-gate-receipts';

export const HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION =
  'hololand.holoshell.physical-actuation.v0.1.0';

export const PHYSICAL_ACTUATION_WORKFLOW = 'physical-actuation-safety' as const;

export const PHYSICAL_ACTUATION_ACTIONS = [
  'read_status',
  'trigger_haptic',
  'start_xr_session',
  'move_robot',
  'mirror_avatar',
  'calibrate_device',
  'write_device_state',
  'capture_sensor',
] as const;
export type PhysicalActuationAction = (typeof PHYSICAL_ACTUATION_ACTIONS)[number];

export const PHYSICAL_ACTUATION_STATUSES = [
  'planned',
  'simulated',
  'freshness_verified',
  'ready',
  'executed',
  'safe_stopped',
  'blocked',
  'failed',
] as const;
export type PhysicalActuationStatus = (typeof PHYSICAL_ACTUATION_STATUSES)[number];

export const ACTUATION_SIMULATION_STATUSES = ['passed', 'failed', 'blocked'] as const;
export type ActuationSimulationStatus = (typeof ACTUATION_SIMULATION_STATUSES)[number];

export const SAFE_STOP_STATUSES = ['not_required', 'armed', 'triggered', 'unavailable'] as const;
export type SafeStopStatus = (typeof SAFE_STOP_STATUSES)[number];

export const PHYSICAL_ROLLBACK_CLASSES = [
  'software_replayable',
  'physical_limited',
  'irreversible_blocked',
] as const;
export type PhysicalRollbackClass = (typeof PHYSICAL_ROLLBACK_CLASSES)[number];

export interface ActuationSimulationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION;
  workflow: typeof PHYSICAL_ACTUATION_WORKFLOW;
  action: PhysicalActuationAction | string;
  actorId: string;
  simulatedAt: string;
  status: ActuationSimulationStatus | string;
  deterministicPreview: boolean;
  expectedDeltaHash: string;
  safeRangeNames: string[];
  humanVisibleSummary: string;
  failureReason?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface SensorFreshnessReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION;
  workflow: typeof PHYSICAL_ACTUATION_WORKFLOW;
  actorId: string;
  checkedAt: string;
  sensorFresh: boolean;
  approvalFresh: boolean;
  adapterHealthy: boolean;
  maxSensorAgeMs: number;
  observedSensorAgeMs: number;
  approvalAgeMs?: number;
  ownerLaneFresh: boolean;
  staleReason?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface SafeStopReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION;
  workflow: typeof PHYSICAL_ACTUATION_WORKFLOW;
  actorId: string;
  status: SafeStopStatus | string;
  armedAt?: string;
  triggeredAt?: string;
  stopAvailable: boolean;
  ownerHandoffRequired: boolean;
  stopInstruction: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface PhysicalRollbackLimitReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION;
  workflow: typeof PHYSICAL_ACTUATION_WORKFLOW;
  actorId: string;
  rollbackClass: PhysicalRollbackClass | string;
  softwareReplayAvailable: boolean;
  physicalUndoGuaranteed: false;
  rollbackNote: string;
  irreversibleEffectWarning?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellPhysicalActuationReceiptPack {
  id: string;
  schemaVersion: typeof HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION;
  workflow: typeof PHYSICAL_ACTUATION_WORKFLOW;
  status: PhysicalActuationStatus | string;
  actorId: string;
  action: PhysicalActuationAction | string;
  deviceSafety?: HoloShellDeviceSafetyReceiptPack;
  permissionGate?: HoloShellPermissionGateReceiptPack;
  simulation: ActuationSimulationReceipt;
  freshness: SensorFreshnessReceipt;
  safeStop: SafeStopReceipt;
  rollbackLimit: PhysicalRollbackLimitReceipt;
  deviceAction?: DeviceActionReceipt;
  replay?: ReplayLessonReceipt;
  taskFiled: boolean;
  humanVisibleSummary: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateTimestamp(label: string, value: string | undefined, errors: string[]): void {
  if (!isIsoTimestamp(value)) errors.push(`${label} must be a valid ISO-8601 timestamp.`);
}

function validateHash(label: string, hash: string | undefined, algorithm: string | undefined, errors: string[]): void {
  if (!isNonEmptyString(hash)) errors.push(`${label}.hash is required.`);
  if (algorithm !== 'sha256') errors.push(`${label}.hashAlgorithm must be sha256.`);
}

function validateSchemaWorkflow(
  label: string,
  schemaVersion: string | undefined,
  workflow: string | undefined,
  errors: string[]
): void {
  if (schemaVersion !== HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION) {
    errors.push(`${label}.schemaVersion must be ${HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION}.`);
  }
  if (workflow !== PHYSICAL_ACTUATION_WORKFLOW) {
    errors.push(`${label}.workflow must be ${PHYSICAL_ACTUATION_WORKFLOW}.`);
  }
}

export function isSupportedPhysicalActuationAction(value: string): value is PhysicalActuationAction {
  return isOneOf(PHYSICAL_ACTUATION_ACTIONS, value);
}

export function isSupportedPhysicalActuationStatus(value: string): value is PhysicalActuationStatus {
  return isOneOf(PHYSICAL_ACTUATION_STATUSES, value);
}

export function isSupportedActuationSimulationStatus(value: string): value is ActuationSimulationStatus {
  return isOneOf(ACTUATION_SIMULATION_STATUSES, value);
}

export function isSupportedSafeStopStatus(value: string): value is SafeStopStatus {
  return isOneOf(SAFE_STOP_STATUSES, value);
}

export function isSupportedPhysicalRollbackClass(value: string): value is PhysicalRollbackClass {
  return isOneOf(PHYSICAL_ROLLBACK_CLASSES, value);
}

export function validateActuationSimulationReceipt(
  receipt: ActuationSimulationReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['ActuationSimulationReceipt is required.'];
  validateSchemaWorkflow('ActuationSimulationReceipt', receipt.schemaVersion, receipt.workflow, errors);
  if (!isNonEmptyString(receipt.id)) errors.push('ActuationSimulationReceipt.id is required.');
  if (!isSupportedPhysicalActuationAction(String(receipt.action))) {
    errors.push(`ActuationSimulationReceipt.action is unsupported: ${String(receipt.action)}.`);
  }
  if (!isNonEmptyString(receipt.actorId)) errors.push('ActuationSimulationReceipt.actorId is required.');
  validateTimestamp('ActuationSimulationReceipt.simulatedAt', receipt.simulatedAt, errors);
  if (!isSupportedActuationSimulationStatus(String(receipt.status))) {
    errors.push(`ActuationSimulationReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (receipt.status === 'passed' && receipt.deterministicPreview !== true) {
    errors.push('ActuationSimulationReceipt.deterministicPreview must be true when status=passed.');
  }
  if (!isNonEmptyString(receipt.expectedDeltaHash)) {
    errors.push('ActuationSimulationReceipt.expectedDeltaHash is required.');
  }
  if (!Array.isArray(receipt.safeRangeNames) || receipt.safeRangeNames.length === 0) {
    errors.push('ActuationSimulationReceipt.safeRangeNames must include at least one range.');
  }
  if (!isNonEmptyString(receipt.humanVisibleSummary)) {
    errors.push('ActuationSimulationReceipt.humanVisibleSummary is required.');
  }
  if (receipt.status !== 'passed' && !isNonEmptyString(receipt.failureReason)) {
    errors.push('ActuationSimulationReceipt.failureReason is required unless status=passed.');
  }
  validateHash('ActuationSimulationReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateSensorFreshnessReceipt(receipt: SensorFreshnessReceipt | undefined): string[] {
  const errors: string[] = [];
  if (!receipt) return ['SensorFreshnessReceipt is required.'];
  validateSchemaWorkflow('SensorFreshnessReceipt', receipt.schemaVersion, receipt.workflow, errors);
  if (!isNonEmptyString(receipt.id)) errors.push('SensorFreshnessReceipt.id is required.');
  if (!isNonEmptyString(receipt.actorId)) errors.push('SensorFreshnessReceipt.actorId is required.');
  validateTimestamp('SensorFreshnessReceipt.checkedAt', receipt.checkedAt, errors);
  if (typeof receipt.sensorFresh !== 'boolean') errors.push('SensorFreshnessReceipt.sensorFresh must be a boolean.');
  if (typeof receipt.approvalFresh !== 'boolean') {
    errors.push('SensorFreshnessReceipt.approvalFresh must be a boolean.');
  }
  if (typeof receipt.adapterHealthy !== 'boolean') {
    errors.push('SensorFreshnessReceipt.adapterHealthy must be a boolean.');
  }
  if (typeof receipt.ownerLaneFresh !== 'boolean') {
    errors.push('SensorFreshnessReceipt.ownerLaneFresh must be a boolean.');
  }
  if (!Number.isFinite(receipt.maxSensorAgeMs) || receipt.maxSensorAgeMs < 0) {
    errors.push('SensorFreshnessReceipt.maxSensorAgeMs must be a non-negative finite number.');
  }
  if (!Number.isFinite(receipt.observedSensorAgeMs) || receipt.observedSensorAgeMs < 0) {
    errors.push('SensorFreshnessReceipt.observedSensorAgeMs must be a non-negative finite number.');
  }
  if (receipt.approvalAgeMs !== undefined && (!Number.isFinite(receipt.approvalAgeMs) || receipt.approvalAgeMs < 0)) {
    errors.push('SensorFreshnessReceipt.approvalAgeMs must be a non-negative finite number when present.');
  }
  if (receipt.observedSensorAgeMs > receipt.maxSensorAgeMs && receipt.sensorFresh) {
    errors.push('SensorFreshnessReceipt.sensorFresh cannot be true when observedSensorAgeMs exceeds maxSensorAgeMs.');
  }
  if ((!receipt.sensorFresh || !receipt.approvalFresh || !receipt.adapterHealthy || !receipt.ownerLaneFresh) && !receipt.staleReason) {
    errors.push('SensorFreshnessReceipt.staleReason is required when freshness is not fully satisfied.');
  }
  validateHash('SensorFreshnessReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateSafeStopReceipt(receipt: SafeStopReceipt | undefined): string[] {
  const errors: string[] = [];
  if (!receipt) return ['SafeStopReceipt is required.'];
  validateSchemaWorkflow('SafeStopReceipt', receipt.schemaVersion, receipt.workflow, errors);
  if (!isNonEmptyString(receipt.id)) errors.push('SafeStopReceipt.id is required.');
  if (!isNonEmptyString(receipt.actorId)) errors.push('SafeStopReceipt.actorId is required.');
  if (!isSupportedSafeStopStatus(String(receipt.status))) {
    errors.push(`SafeStopReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (receipt.armedAt) validateTimestamp('SafeStopReceipt.armedAt', receipt.armedAt, errors);
  if (receipt.triggeredAt) validateTimestamp('SafeStopReceipt.triggeredAt', receipt.triggeredAt, errors);
  if (typeof receipt.stopAvailable !== 'boolean') errors.push('SafeStopReceipt.stopAvailable must be a boolean.');
  if (typeof receipt.ownerHandoffRequired !== 'boolean') {
    errors.push('SafeStopReceipt.ownerHandoffRequired must be a boolean.');
  }
  if ((receipt.status === 'armed' || receipt.status === 'triggered') && receipt.stopAvailable !== true) {
    errors.push('SafeStopReceipt.stopAvailable must be true when status is armed or triggered.');
  }
  if (receipt.status === 'triggered' && !receipt.triggeredAt) {
    errors.push('SafeStopReceipt.triggeredAt is required when status=triggered.');
  }
  if (!isNonEmptyString(receipt.stopInstruction)) errors.push('SafeStopReceipt.stopInstruction is required.');
  validateHash('SafeStopReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validatePhysicalRollbackLimitReceipt(
  receipt: PhysicalRollbackLimitReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PhysicalRollbackLimitReceipt is required.'];
  validateSchemaWorkflow('PhysicalRollbackLimitReceipt', receipt.schemaVersion, receipt.workflow, errors);
  if (!isNonEmptyString(receipt.id)) errors.push('PhysicalRollbackLimitReceipt.id is required.');
  if (!isNonEmptyString(receipt.actorId)) errors.push('PhysicalRollbackLimitReceipt.actorId is required.');
  if (!isSupportedPhysicalRollbackClass(String(receipt.rollbackClass))) {
    errors.push(`PhysicalRollbackLimitReceipt.rollbackClass is unsupported: ${String(receipt.rollbackClass)}.`);
  }
  if (typeof receipt.softwareReplayAvailable !== 'boolean') {
    errors.push('PhysicalRollbackLimitReceipt.softwareReplayAvailable must be a boolean.');
  }
  if (receipt.physicalUndoGuaranteed !== false) {
    errors.push('PhysicalRollbackLimitReceipt.physicalUndoGuaranteed must be false.');
  }
  if (!isNonEmptyString(receipt.rollbackNote)) errors.push('PhysicalRollbackLimitReceipt.rollbackNote is required.');
  if (receipt.rollbackClass === 'irreversible_blocked' && !isNonEmptyString(receipt.irreversibleEffectWarning)) {
    errors.push('PhysicalRollbackLimitReceipt.irreversibleEffectWarning is required for irreversible_blocked.');
  }
  validateHash('PhysicalRollbackLimitReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellPhysicalActuationReceiptPack(
  pack: HoloShellPhysicalActuationReceiptPack | undefined
): string[] {
  const errors: string[] = [];
  if (!pack) return ['HoloShellPhysicalActuationReceiptPack is required.'];
  validateSchemaWorkflow('HoloShellPhysicalActuationReceiptPack', pack.schemaVersion, pack.workflow, errors);
  if (!isNonEmptyString(pack.id)) errors.push('HoloShellPhysicalActuationReceiptPack.id is required.');
  if (!isNonEmptyString(pack.actorId)) errors.push('HoloShellPhysicalActuationReceiptPack.actorId is required.');
  if (!isSupportedPhysicalActuationAction(String(pack.action))) {
    errors.push(`HoloShellPhysicalActuationReceiptPack.action is unsupported: ${String(pack.action)}.`);
  }
  if (!isSupportedPhysicalActuationStatus(String(pack.status))) {
    errors.push(`HoloShellPhysicalActuationReceiptPack.status is unsupported: ${String(pack.status)}.`);
  }
  errors.push(...validateActuationSimulationReceipt(pack.simulation));
  errors.push(...validateSensorFreshnessReceipt(pack.freshness));
  errors.push(...validateSafeStopReceipt(pack.safeStop));
  errors.push(...validatePhysicalRollbackLimitReceipt(pack.rollbackLimit));
  if (typeof pack.taskFiled !== 'boolean') {
    errors.push('HoloShellPhysicalActuationReceiptPack.taskFiled must be a boolean.');
  }
  if (!isNonEmptyString(pack.humanVisibleSummary)) {
    errors.push('HoloShellPhysicalActuationReceiptPack.humanVisibleSummary is required.');
  }
  const readyLike = ['ready', 'executed', 'safe_stopped'].includes(String(pack.status));
  const freshnessSatisfied =
    pack.freshness?.sensorFresh &&
    pack.freshness.approvalFresh &&
    pack.freshness.adapterHealthy &&
    pack.freshness.ownerLaneFresh;
  if (readyLike && pack.simulation?.status !== 'passed') {
    errors.push('HoloShellPhysicalActuationReceiptPack.ready states require passed simulation.');
  }
  if (readyLike && !freshnessSatisfied) {
    errors.push('HoloShellPhysicalActuationReceiptPack.ready states require satisfied freshness.');
  }
  if (readyLike && !(pack.safeStop?.status === 'armed' || pack.safeStop?.status === 'triggered')) {
    errors.push('HoloShellPhysicalActuationReceiptPack.ready states require an armed or triggered safe stop.');
  }
  if (pack.status === 'executed' && !pack.deviceAction) {
    errors.push('HoloShellPhysicalActuationReceiptPack.deviceAction is required when status=executed.');
  }
  if (pack.rollbackLimit?.rollbackClass === 'irreversible_blocked' && pack.status !== 'blocked') {
    errors.push('HoloShellPhysicalActuationReceiptPack.irreversible_blocked rollback requires blocked status.');
  }
  if ((pack.status === 'blocked' || pack.status === 'failed') && !pack.replay && !pack.taskFiled) {
    errors.push('HoloShellPhysicalActuationReceiptPack.blocked or failed status requires replay or taskFiled.');
  }
  validateHash('HoloShellPhysicalActuationReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

export function cloneActuationSimulationReceipt(
  receipt: ActuationSimulationReceipt
): ActuationSimulationReceipt {
  return { ...receipt, safeRangeNames: [...receipt.safeRangeNames] };
}

export function cloneSensorFreshnessReceipt(receipt: SensorFreshnessReceipt): SensorFreshnessReceipt {
  return { ...receipt };
}

export function cloneSafeStopReceipt(receipt: SafeStopReceipt): SafeStopReceipt {
  return { ...receipt };
}

export function clonePhysicalRollbackLimitReceipt(
  receipt: PhysicalRollbackLimitReceipt
): PhysicalRollbackLimitReceipt {
  return { ...receipt };
}

export function cloneHoloShellPhysicalActuationReceiptPack(
  pack: HoloShellPhysicalActuationReceiptPack
): HoloShellPhysicalActuationReceiptPack {
  return {
    ...pack,
    simulation: cloneActuationSimulationReceipt(pack.simulation),
    freshness: cloneSensorFreshnessReceipt(pack.freshness),
    safeStop: cloneSafeStopReceipt(pack.safeStop),
    rollbackLimit: clonePhysicalRollbackLimitReceipt(pack.rollbackLimit),
    ...(pack.deviceSafety ? { deviceSafety: { ...pack.deviceSafety } } : {}),
    ...(pack.permissionGate ? { permissionGate: { ...pack.permissionGate } } : {}),
    ...(pack.deviceAction ? { deviceAction: { ...pack.deviceAction } } : {}),
    ...(pack.replay ? { replay: { ...pack.replay } } : {}),
  };
}
