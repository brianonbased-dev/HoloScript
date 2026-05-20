/**
 * HoloShell Managed Service Restart Receipts
 *
 * Reusable substrate for making local service start/stop/restart work visible
 * and deterministic. HoloLand can render the bay; HoloScript validates that
 * PID custody, approval, redaction, and after-action evidence are present.
 */

import type { ArtifactHashAlgorithm } from './board-types';

export const HOLOSHELL_MANAGED_SERVICE_RESTART_RECEIPT_PACK_VERSION =
  'hololand.holoshell.managed-service-restart.v0.1.0';

export const MANAGED_LOCAL_SERVICES = [
  'holoshell-control-daemon',
  'holoshell-network-sentinel',
  'holoshell-service-supervisor',
] as const;
export type ManagedLocalServiceId = (typeof MANAGED_LOCAL_SERVICES)[number];

export const MANAGED_SERVICE_ACTIONS = [
  'status',
  'start',
  'stop',
  'restart',
  'ensure',
  'enable_execute',
  'disable_execute',
  'enable_trusted_execute',
] as const;
export type ManagedServiceAction = (typeof MANAGED_SERVICE_ACTIONS)[number];

export const MANAGED_SERVICE_STATUSES = [
  'offline',
  'online',
  'starting',
  'stopping',
  'restarting',
  'degraded',
  'blocked',
  'unknown',
] as const;
export type ManagedServiceStatus = (typeof MANAGED_SERVICE_STATUSES)[number];

export const MANAGED_SERVICE_PERMISSION_ENVELOPES = [
  'read_only',
  'guarded_service_mutation',
  'break_glass_execute_permission',
] as const;
export type ManagedServicePermissionEnvelope =
  (typeof MANAGED_SERVICE_PERMISSION_ENVELOPES)[number];

export interface ManagedLocalServiceReceipt {
  serviceId: ManagedLocalServiceId | string;
  status: ManagedServiceStatus | string;
  localOnly: boolean;
  pid: number | null;
  pidAlive: boolean;
  pidCommandVerified: boolean;
  commandLineObserved: boolean;
  rawCommandLineIncluded: boolean;
  executeEnabled: boolean;
  trustedExecuteEnabled: boolean;
  serviceMutationTaken: boolean;
  destructiveActionsTaken: boolean;
  statusHash: string;
  adapter: string;
  source: string;
}

export interface VerifiedPidGateReceipt {
  serviceId: ManagedLocalServiceId | string;
  exactPidRequired: boolean;
  pid: number | null;
  pidAlive: boolean;
  pidCommandVerified: boolean;
  commandHash: string;
  commandLineObserved: boolean;
  rawCommandLineIncluded: boolean;
  unverifiedPidStopRefused: boolean;
  stopOnlyVerifiedManagedPid: boolean;
  forceKillAllowed: boolean;
}

export interface ServiceRestartApprovalReceipt {
  approvalId: string;
  approvalRequired: boolean;
  approvalCaptured: boolean;
  freshHumanGestureCaptured: boolean;
  ownerAckRequired: boolean;
  ownerAckCaptured: boolean;
  requestedAction: ManagedServiceAction | string;
  targetService: ManagedLocalServiceId | string;
  approvedCommandPreview: string;
  rollbackLimits: string[];
  expiresAt: string;
}

export interface ServiceAfterActionReceipt {
  requestedAction: ManagedServiceAction | string;
  targetService: ManagedLocalServiceId | string;
  status: ManagedServiceStatus | string;
  serviceMutationTaken: boolean;
  destructiveActionsTaken: boolean;
  beforeStatusHash: string;
  afterStatusHash: string;
  beforePid: number | null;
  afterPid: number | null;
  afterPidAlive: boolean;
  afterPidCommandVerified: boolean;
  rawCommandLineIncluded: boolean;
}

export interface ManagedServiceRestartSourceAnchors {
  serviceRoom?: string;
  serviceSource?: string;
  adapter?: string;
  upstreamValidator?: string;
  evidence?: string;
}

export interface HoloShellManagedServiceRestartReceiptPack {
  schemaVersion: typeof HOLOSHELL_MANAGED_SERVICE_RESTART_RECEIPT_PACK_VERSION;
  id: string;
  workflow: 'process-owner-lane-restart';
  generatedAt: string;
  requestedAction: ManagedServiceAction;
  targetService: ManagedLocalServiceId | string;
  permissionEnvelope: ManagedServicePermissionEnvelope;
  services: ManagedLocalServiceReceipt[];
  pidGate: VerifiedPidGateReceipt;
  approval?: ServiceRestartApprovalReceipt;
  afterAction?: ServiceAfterActionReceipt;
  replayKey: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  sourceAnchors?: ManagedServiceRestartSourceAnchors;
  verificationCommands?: (string | { command: string })[];
  provenance?: string[];
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function hasAbsolutePath(value: string | undefined): boolean {
  return (
    typeof value === 'string' &&
    /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/.test(value)
  );
}

function validateTimestamp(label: string, value: string | undefined, errors: string[]): void {
  if (!isIsoTimestamp(value)) errors.push(`${label} must be a valid ISO-8601 timestamp.`);
}

function validateBoolean(label: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'boolean') errors.push(`${label} must be a boolean.`);
}

function validatePid(label: string, value: number | null | undefined, errors: string[]): void {
  if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
    errors.push(`${label} must be a non-negative integer or null.`);
  }
}

function isMutationAction(action: ManagedServiceAction | string): boolean {
  return action === 'start' || action === 'stop' || action === 'restart' || action === 'ensure';
}

function isExecuteEscalation(action: ManagedServiceAction | string): boolean {
  return action === 'enable_execute' || action === 'enable_trusted_execute';
}

function validateManagedLocalServiceReceipt(
  receipt: ManagedLocalServiceReceipt | undefined,
  errors: string[],
  index: number
): void {
  if (!receipt) {
    errors.push(`ManagedLocalServiceReceipt[${index}] is required.`);
    return;
  }
  if (!isNonEmptyString(receipt.serviceId)) errors.push(`ManagedLocalServiceReceipt[${index}].serviceId is required.`);
  if (!isNonEmptyString(receipt.status)) errors.push(`ManagedLocalServiceReceipt[${index}].status is required.`);
  validateBoolean(`ManagedLocalServiceReceipt[${index}].localOnly`, receipt.localOnly, errors);
  validatePid(`ManagedLocalServiceReceipt[${index}].pid`, receipt.pid, errors);
  validateBoolean(`ManagedLocalServiceReceipt[${index}].pidAlive`, receipt.pidAlive, errors);
  validateBoolean(
    `ManagedLocalServiceReceipt[${index}].pidCommandVerified`,
    receipt.pidCommandVerified,
    errors
  );
  validateBoolean(
    `ManagedLocalServiceReceipt[${index}].commandLineObserved`,
    receipt.commandLineObserved,
    errors
  );
  validateBoolean(
    `ManagedLocalServiceReceipt[${index}].rawCommandLineIncluded`,
    receipt.rawCommandLineIncluded,
    errors
  );
  validateBoolean(`ManagedLocalServiceReceipt[${index}].executeEnabled`, receipt.executeEnabled, errors);
  validateBoolean(
    `ManagedLocalServiceReceipt[${index}].trustedExecuteEnabled`,
    receipt.trustedExecuteEnabled,
    errors
  );
  validateBoolean(
    `ManagedLocalServiceReceipt[${index}].serviceMutationTaken`,
    receipt.serviceMutationTaken,
    errors
  );
  validateBoolean(
    `ManagedLocalServiceReceipt[${index}].destructiveActionsTaken`,
    receipt.destructiveActionsTaken,
    errors
  );
  if (!isNonEmptyString(receipt.statusHash)) {
    errors.push(`ManagedLocalServiceReceipt[${index}].statusHash is required.`);
  }
  if (!isNonEmptyString(receipt.adapter)) errors.push(`ManagedLocalServiceReceipt[${index}].adapter is required.`);
  if (!isNonEmptyString(receipt.source)) errors.push(`ManagedLocalServiceReceipt[${index}].source is required.`);
  if (receipt.localOnly !== true) {
    errors.push(`ManagedLocalServiceReceipt[${index}] must prove localOnly=true.`);
  }
  if (receipt.rawCommandLineIncluded) {
    errors.push(`ManagedLocalServiceReceipt[${index}] must not include raw command lines.`);
  }
  if (receipt.destructiveActionsTaken) {
    errors.push(`ManagedLocalServiceReceipt[${index}] must not include destructive actions.`);
  }
}

function validatePidGate(
  pack: HoloShellManagedServiceRestartReceiptPack,
  errors: string[]
): void {
  const gate = pack.pidGate;
  if (!gate) {
    errors.push('HoloShellManagedServiceRestartReceiptPack.pidGate is required.');
    return;
  }
  if (!isNonEmptyString(gate.serviceId)) errors.push('VerifiedPidGateReceipt.serviceId is required.');
  if (gate.serviceId !== pack.targetService) {
    errors.push('VerifiedPidGateReceipt.serviceId must match targetService.');
  }
  validateBoolean('VerifiedPidGateReceipt.exactPidRequired', gate.exactPidRequired, errors);
  validatePid('VerifiedPidGateReceipt.pid', gate.pid, errors);
  validateBoolean('VerifiedPidGateReceipt.pidAlive', gate.pidAlive, errors);
  validateBoolean('VerifiedPidGateReceipt.pidCommandVerified', gate.pidCommandVerified, errors);
  validateBoolean('VerifiedPidGateReceipt.commandLineObserved', gate.commandLineObserved, errors);
  validateBoolean('VerifiedPidGateReceipt.rawCommandLineIncluded', gate.rawCommandLineIncluded, errors);
  validateBoolean('VerifiedPidGateReceipt.unverifiedPidStopRefused', gate.unverifiedPidStopRefused, errors);
  validateBoolean('VerifiedPidGateReceipt.stopOnlyVerifiedManagedPid', gate.stopOnlyVerifiedManagedPid, errors);
  validateBoolean('VerifiedPidGateReceipt.forceKillAllowed', gate.forceKillAllowed, errors);
  if (gate.exactPidRequired !== true) errors.push('VerifiedPidGateReceipt.exactPidRequired must be true.');
  if (gate.rawCommandLineIncluded) errors.push('VerifiedPidGateReceipt must not include raw command lines.');
  if (gate.unverifiedPidStopRefused !== true) {
    errors.push('VerifiedPidGateReceipt.unverifiedPidStopRefused must be true.');
  }
  if (gate.stopOnlyVerifiedManagedPid !== true) {
    errors.push('VerifiedPidGateReceipt.stopOnlyVerifiedManagedPid must be true.');
  }
  if (gate.forceKillAllowed !== false) {
    errors.push('VerifiedPidGateReceipt.forceKillAllowed must be false.');
  }
  if (!isNonEmptyString(gate.commandHash)) {
    errors.push('VerifiedPidGateReceipt.commandHash is required.');
  }
  if ((pack.requestedAction === 'stop' || pack.requestedAction === 'restart') && !gate.pidCommandVerified) {
    errors.push('Stop or restart actions require a verified managed PID.');
  }
}

function validateApproval(
  pack: HoloShellManagedServiceRestartReceiptPack,
  errors: string[]
): void {
  const approval = pack.approval;
  const requiresApproval = isMutationAction(pack.requestedAction) || isExecuteEscalation(pack.requestedAction);
  if (!requiresApproval) {
    if (pack.permissionEnvelope !== 'read_only') {
      errors.push('Status-only service receipts must use read_only permission envelope.');
    }
    return;
  }
  if (!approval) {
    errors.push('Service mutation receipts require ServiceRestartApprovalReceipt.');
    return;
  }
  if (!isNonEmptyString(approval.approvalId)) errors.push('ServiceRestartApprovalReceipt.approvalId is required.');
  validateBoolean('ServiceRestartApprovalReceipt.approvalRequired', approval.approvalRequired, errors);
  validateBoolean('ServiceRestartApprovalReceipt.approvalCaptured', approval.approvalCaptured, errors);
  validateBoolean(
    'ServiceRestartApprovalReceipt.freshHumanGestureCaptured',
    approval.freshHumanGestureCaptured,
    errors
  );
  validateBoolean('ServiceRestartApprovalReceipt.ownerAckRequired', approval.ownerAckRequired, errors);
  validateBoolean('ServiceRestartApprovalReceipt.ownerAckCaptured', approval.ownerAckCaptured, errors);
  validateTimestamp('ServiceRestartApprovalReceipt.expiresAt', approval.expiresAt, errors);
  if (approval.requestedAction !== pack.requestedAction) {
    errors.push('ServiceRestartApprovalReceipt.requestedAction must match requestedAction.');
  }
  if (approval.targetService !== pack.targetService) {
    errors.push('ServiceRestartApprovalReceipt.targetService must match targetService.');
  }
  if (!Array.isArray(approval.rollbackLimits) || approval.rollbackLimits.length === 0) {
    errors.push('ServiceRestartApprovalReceipt.rollbackLimits must include at least one visible rollback limit.');
  } else if (approval.rollbackLimits.some((limit) => !isNonEmptyString(limit))) {
    errors.push('ServiceRestartApprovalReceipt.rollbackLimits entries must be non-empty.');
  }
  if (approval.approvalRequired !== true) {
    errors.push('Service mutation receipts must require approval.');
  }
  if (approval.approvalCaptured !== true) {
    errors.push('Service mutation receipts must capture approval before mutation.');
  }
  if (approval.freshHumanGestureCaptured !== true) {
    errors.push('Service mutation receipts must capture a fresh human gesture.');
  }
  if (!isNonEmptyString(approval.approvedCommandPreview)) {
    errors.push('ServiceRestartApprovalReceipt.approvedCommandPreview is required.');
  }
  if (isExecuteEscalation(pack.requestedAction)) {
    if (pack.permissionEnvelope !== 'break_glass_execute_permission') {
      errors.push('Execute permission escalation must use break_glass_execute_permission.');
    }
    if (approval.ownerAckRequired !== true || approval.ownerAckCaptured !== true) {
      errors.push('Execute permission escalation requires captured owner ack.');
    }
  } else if (pack.permissionEnvelope !== 'guarded_service_mutation') {
    errors.push('Service mutation receipts must use guarded_service_mutation permission envelope.');
  }
}

function validateAfterAction(
  pack: HoloShellManagedServiceRestartReceiptPack,
  errors: string[]
): void {
  const afterAction = pack.afterAction;
  if (!afterAction) return;
  if (afterAction.requestedAction !== pack.requestedAction) {
    errors.push('ServiceAfterActionReceipt.requestedAction must match requestedAction.');
  }
  if (afterAction.targetService !== pack.targetService) {
    errors.push('ServiceAfterActionReceipt.targetService must match targetService.');
  }
  if (!isNonEmptyString(afterAction.status)) errors.push('ServiceAfterActionReceipt.status is required.');
  validateBoolean('ServiceAfterActionReceipt.serviceMutationTaken', afterAction.serviceMutationTaken, errors);
  validateBoolean('ServiceAfterActionReceipt.destructiveActionsTaken', afterAction.destructiveActionsTaken, errors);
  validatePid('ServiceAfterActionReceipt.beforePid', afterAction.beforePid, errors);
  validatePid('ServiceAfterActionReceipt.afterPid', afterAction.afterPid, errors);
  validateBoolean('ServiceAfterActionReceipt.afterPidAlive', afterAction.afterPidAlive, errors);
  validateBoolean(
    'ServiceAfterActionReceipt.afterPidCommandVerified',
    afterAction.afterPidCommandVerified,
    errors
  );
  validateBoolean('ServiceAfterActionReceipt.rawCommandLineIncluded', afterAction.rawCommandLineIncluded, errors);
  if (!isNonEmptyString(afterAction.beforeStatusHash)) {
    errors.push('ServiceAfterActionReceipt.beforeStatusHash is required.');
  }
  if (!isNonEmptyString(afterAction.afterStatusHash)) {
    errors.push('ServiceAfterActionReceipt.afterStatusHash is required.');
  }
  if (afterAction.rawCommandLineIncluded) {
    errors.push('ServiceAfterActionReceipt must not include raw command lines.');
  }
  if (afterAction.destructiveActionsTaken) {
    errors.push('ServiceAfterActionReceipt must not include destructive actions.');
  }
  if (afterAction.serviceMutationTaken && !pack.approval?.approvalCaptured) {
    errors.push('ServiceAfterActionReceipt.serviceMutationTaken requires captured approval.');
  }
}

export function isSupportedManagedLocalService(value: string): value is ManagedLocalServiceId {
  return isOneOf(MANAGED_LOCAL_SERVICES, value);
}

export function isSupportedManagedServiceAction(value: string): value is ManagedServiceAction {
  return isOneOf(MANAGED_SERVICE_ACTIONS, value);
}

export function isSupportedManagedServiceStatus(value: string): value is ManagedServiceStatus {
  return isOneOf(MANAGED_SERVICE_STATUSES, value);
}

export function isSupportedManagedServicePermissionEnvelope(
  value: string
): value is ManagedServicePermissionEnvelope {
  return isOneOf(MANAGED_SERVICE_PERMISSION_ENVELOPES, value);
}

export function validateHoloShellManagedServiceRestartReceiptPack(
  pack: HoloShellManagedServiceRestartReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack) return ['HoloShellManagedServiceRestartReceiptPack is required.'];
  if (pack.schemaVersion !== HOLOSHELL_MANAGED_SERVICE_RESTART_RECEIPT_PACK_VERSION) {
    errors.push(
      `HoloShellManagedServiceRestartReceiptPack.schemaVersion must be ${HOLOSHELL_MANAGED_SERVICE_RESTART_RECEIPT_PACK_VERSION}.`
    );
  }
  if (!isNonEmptyString(pack.id)) errors.push('HoloShellManagedServiceRestartReceiptPack.id is required.');
  if (pack.workflow !== 'process-owner-lane-restart') {
    errors.push('HoloShellManagedServiceRestartReceiptPack.workflow must be process-owner-lane-restart.');
  }
  validateTimestamp('HoloShellManagedServiceRestartReceiptPack.generatedAt', pack.generatedAt, errors);
  if (!isSupportedManagedServiceAction(String(pack.requestedAction))) {
    errors.push(
      `HoloShellManagedServiceRestartReceiptPack.requestedAction is unsupported: ${String(pack.requestedAction)}.`
    );
  }
  if (!isNonEmptyString(pack.targetService)) {
    errors.push('HoloShellManagedServiceRestartReceiptPack.targetService is required.');
  }
  if (!isSupportedManagedServicePermissionEnvelope(String(pack.permissionEnvelope))) {
    errors.push(
      `HoloShellManagedServiceRestartReceiptPack.permissionEnvelope is unsupported: ${String(pack.permissionEnvelope)}.`
    );
  }
  if (!Array.isArray(pack.services) || pack.services.length === 0) {
    errors.push('HoloShellManagedServiceRestartReceiptPack.services must include at least one service receipt.');
  } else {
    pack.services.forEach((service, index) => validateManagedLocalServiceReceipt(service, errors, index));
  }
  validatePidGate(pack, errors);
  validateApproval(pack, errors);
  validateAfterAction(pack, errors);
  if (isMutationAction(pack.requestedAction) && !pack.afterAction) {
    errors.push('Service mutation receipts require ServiceAfterActionReceipt.');
  }
  if (!isNonEmptyString(pack.replayKey)) errors.push('HoloShellManagedServiceRestartReceiptPack.replayKey is required.');
  if (!isNonEmptyString(pack.hash)) errors.push('HoloShellManagedServiceRestartReceiptPack.hash is required.');
  if (pack.hashAlgorithm !== 'sha256') {
    errors.push('HoloShellManagedServiceRestartReceiptPack.hashAlgorithm must be sha256.');
  }
  for (const command of pack.verificationCommands ?? []) {
    const commandText = typeof command === 'string' ? command : command.command;
    if (!isNonEmptyString(commandText)) {
      errors.push('HoloShellManagedServiceRestartReceiptPack has a verification command without command text.');
    }
  }
  for (const anchor of Object.values(pack.sourceAnchors ?? {})) {
    if (hasAbsolutePath(anchor)) {
      errors.push('ManagedServiceRestartSourceAnchors must be repo-relative or redacted, not absolute paths.');
    }
  }
  for (const provenance of pack.provenance ?? []) {
    if (!isNonEmptyString(provenance)) {
      errors.push('HoloShellManagedServiceRestartReceiptPack.provenance entries must be non-empty.');
    }
  }
  return errors;
}

export function cloneManagedLocalServiceReceipt(
  receipt: ManagedLocalServiceReceipt
): ManagedLocalServiceReceipt {
  return { ...receipt };
}

export function cloneHoloShellManagedServiceRestartReceiptPack(
  pack: HoloShellManagedServiceRestartReceiptPack
): HoloShellManagedServiceRestartReceiptPack {
  return {
    ...pack,
    services: pack.services.map(cloneManagedLocalServiceReceipt),
    pidGate: { ...pack.pidGate },
    ...(pack.approval
      ? { approval: { ...pack.approval, rollbackLimits: [...pack.approval.rollbackLimits] } }
      : {}),
    ...(pack.afterAction ? { afterAction: { ...pack.afterAction } } : {}),
    ...(pack.sourceAnchors ? { sourceAnchors: { ...pack.sourceAnchors } } : {}),
    ...(pack.verificationCommands
      ? {
          verificationCommands: pack.verificationCommands.map((command) =>
            typeof command === 'string' ? command : { ...command }
          ),
        }
      : {}),
    ...(pack.provenance ? { provenance: [...pack.provenance] } : {}),
  };
}
