/**
 * HoloShell Slow Computer Clinic Receipts
 *
 * Reusable substrate contract for local hardware and process diagnostics.
 * HoloLand renders the clinic room; HoloScript validates process health,
 * hardware audit, ownership attribution, guarded stop plans, remediation
 * verification, and production stop readiness.
 *
 * Source anchors:
 *   - HoloLand: experiments/holoshell-human-os-frontier/slow-computer-clinic-pipeline.hs
 *   - HoloLand: experiments/holoshell-human-os-frontier/slow-computer-clinic-policy.hsplus
 *   - HoloLand: experiments/holoshell-human-os-frontier/slow-computer-clinic-room.holo
 *   - HoloLand: experiments/holoshell-human-os-frontier/slow-computer-clinic-guarded-stop-dry-run.mjs
 *   - HoloLand: experiments/holoshell-human-os-frontier/slow-computer-clinic-remediation-fixture.mjs
 */

import type { ArtifactHashAlgorithm } from './board-types';

// ── Schema version ──

export const HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION =
  'hololand.holoshell.slow-computer-clinic.v0.1.0';

export const SLOW_COMPUTER_CLINIC_WORKFLOW = 'slow-computer-clinic' as const;

// ── Enumerations ──

export const RISK_STATES = ['ok', 'warn', 'critical', 'unknown'] as const;
export type RiskState = (typeof RISK_STATES)[number];

export const CLINIC_WORKFLOW_STATES = [
  'idle',
  'scanned',
  'classified',
  'explained',
  'handoff_requested',
  'stop_plan_staged',
  'approved',
  'remediated',
  'verified',
  'blocked',
] as const;
export type ClinicWorkflowState = (typeof CLINIC_WORKFLOW_STATES)[number];

export const PROCESS_CATEGORIES = [
  'system',
  'shell',
  'dev_runtime',
  'agent',
  'browser',
  'hololand',
  'holomesh',
  'user_app',
  'unknown',
] as const;
export type ProcessCategory = (typeof PROCESS_CATEGORIES)[number];

export const STOP_POLICIES = [
  'read_only',
  'guarded_execute',
  'break_glass_required',
] as const;
export type StopPolicy = (typeof STOP_POLICIES)[number];

export const OWNER_LANES = [
  'codex-hardware',
  'claude',
  'gemini',
  'copilot',
  'local_shell',
  'browser',
  'holomesh',
  'hololand',
  'unknown',
] as const;
export type OwnerLane = (typeof OWNER_LANES)[number];

export const PERMISSION_ENVELOPES = [
  'read_only',
  'guarded_execute',
  'break_glass',
] as const;
export type PermissionEnvelope = (typeof PERMISSION_ENVELOPES)[number];

// ── Receipt interfaces ──

export interface ProcessHealthReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION;
  workflow: typeof SLOW_COMPUTER_CLINIC_WORKFLOW;
  riskState: RiskState | string;
  processCount: number;
  shellRunCount: number;
  staleRunCount: number;
  highMemoryCount: number;
  ownerUnknownReviewCount: number;
  ownerHandoffPlanCount: number;
  cleanupCandidateCount: number;
  stopPlanCount: number;
  policies: {
    readOnlyByDefault: true;
    automaticTerminationAllowed: false;
    exactPidRequired: true;
    receiptRequired: true;
    stopPolicy: StopPolicy | string;
  };
  generatedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HardwareAuditReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION;
  workflow: typeof SLOW_COMPUTER_CLINIC_WORKFLOW;
  cpuUtilizationPercent: number;
  memoryUsedPercent: number;
  memoryTotalGb: number;
  gpuUtilizationPercent: number | null;
  gpuMemoryUsedPercent: number | null;
  diskUsedPercent: number;
  thermalThrottling: boolean | null;
  platform: string;
  arch: string;
  release: string;
  generatedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface OwnershipPlan {
  pid: number;
  name: string;
  category: ProcessCategory | string;
  ownerLane: OwnerLane | string | null;
  ownerHandoffRequired: boolean;
  cleanupEligible: boolean;
  stopPolicy: StopPolicy | string;
  memoryMb: number;
  ageMinutes: number;
  findings: string[];
}

export interface GuardedStopPlan {
  planId: string;
  targetPid: number;
  targetName: string;
  category: ProcessCategory | string;
  reason: string;
  stopPolicy: StopPolicy | string;
  approvalRequired: true;
  safeToExecuteAutomatically: false;
  breakGlass: boolean;
  ownerLane: OwnerLane | string | null;
  ownerHandoffRequired: boolean;
  memoryMb: number;
  ageMinutes: number;
  findings: string[];
}

export interface RemediationVerificationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION;
  workflow: typeof SLOW_COMPUTER_CLINIC_WORKFLOW;
  targetPid: number;
  targetName: string;
  approvalCaptured: true;
  terminationPerformed: boolean;
  afterVisible: false;
  externalProcessTerminationAllowed: false;
  exactPidRequired: true;
  beforeVisible: boolean;
  ownerAckCaptured: boolean;
  approvalId: string;
  generatedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface ProductionStopReadinessReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION;
  workflow: typeof SLOW_COMPUTER_CLINIC_WORKFLOW;
  targetPid: number;
  targetName: string;
  exactPidRechecked: true;
  approvalCaptured: true;
  ownerAckCaptured: boolean;
  dryRunOnly: true;
  terminationPerformed: false;
  externalProcessTerminationAllowed: false;
  stopPolicy: StopPolicy | string;
  blockedReasons: string[];
  approvalId: string;
  generatedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface SlowComputerClinicReplayReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION;
  workflow: typeof SLOW_COMPUTER_CLINIC_WORKFLOW;
  status: ClinicWorkflowState | string;
  processHealthReceiptId: string;
  hardwareAuditReceiptId: string;
  replayKey: string;
  processCount: number;
  ownerHandoffPlanCount: number;
  stopPlanCount: number;
  rawCommandLinesCaptured: false;
  rawCommandLinesHiddenByDefault: true;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellSlowComputerClinicReceiptPack {
  id: string;
  schemaVersion: typeof HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION;
  workflow: typeof SLOW_COMPUTER_CLINIC_WORKFLOW;
  status: ClinicWorkflowState | string;
  processHealth: ProcessHealthReceipt;
  hardwareAudit: HardwareAuditReceipt;
  ownershipPlans: OwnershipPlan[];
  stopPlans: GuardedStopPlan[];
  remediationVerification?: RemediationVerificationReceipt;
  productionStopReadiness?: ProductionStopReadinessReceipt;
  replay: SlowComputerClinicReplayReceipt;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

// ── Type guards ──

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateHash(
  label: string,
  hash: string | undefined,
  algorithm: string | undefined,
  errors: string[]
): void {
  if (!isNonEmptyString(hash)) errors.push(`${label}.hash is required.`);
  if (algorithm !== 'sha256') errors.push(`${label}.hashAlgorithm must be sha256.`);
}

function validateTimestamp(label: string, value: string | undefined, errors: string[]): void {
  if (!isIsoTimestamp(value)) errors.push(`${label} must be a valid ISO-8601 timestamp.`);
}

// ── Public type guards ──

export function isSupportedRiskState(value: string): value is RiskState {
  return isOneOf(RISK_STATES, value);
}

export function isSupportedClinicWorkflowState(value: string): value is ClinicWorkflowState {
  return isOneOf(CLINIC_WORKFLOW_STATES, value);
}

export function isSupportedProcessCategory(value: string): value is ProcessCategory {
  return isOneOf(PROCESS_CATEGORIES, value);
}

export function isSupportedStopPolicy(value: string): value is StopPolicy {
  return isOneOf(STOP_POLICIES, value);
}

export function isSupportedOwnerLane(value: string): value is OwnerLane {
  return isOneOf(OWNER_LANES, value);
}

export function isSupportedPermissionEnvelope(value: string): value is PermissionEnvelope {
  return isOneOf(PERMISSION_ENVELOPES, value);
}

// ── Validators ──

export function validateProcessHealthReceipt(
  receipt: ProcessHealthReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['ProcessHealthReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION) {
    errors.push(
      `ProcessHealthReceipt.schemaVersion must be ${HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== SLOW_COMPUTER_CLINIC_WORKFLOW) {
    errors.push(`ProcessHealthReceipt.workflow must be ${SLOW_COMPUTER_CLINIC_WORKFLOW}.`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('ProcessHealthReceipt.id is required.');
  if (!isSupportedRiskState(String(receipt.riskState))) {
    errors.push(`ProcessHealthReceipt.riskState is unsupported: ${String(receipt.riskState)}.`);
  }
  for (const [key, value] of Object.entries({
    processCount: receipt.processCount,
    shellRunCount: receipt.shellRunCount,
    staleRunCount: receipt.staleRunCount,
    highMemoryCount: receipt.highMemoryCount,
    ownerUnknownReviewCount: receipt.ownerUnknownReviewCount,
    ownerHandoffPlanCount: receipt.ownerHandoffPlanCount,
    cleanupCandidateCount: receipt.cleanupCandidateCount,
    stopPlanCount: receipt.stopPlanCount,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`ProcessHealthReceipt.${key} must be a non-negative integer.`);
    }
  }
  if (receipt.policies.readOnlyByDefault !== true) {
    errors.push('ProcessHealthReceipt.policies.readOnlyByDefault must be true.');
  }
  if (receipt.policies.automaticTerminationAllowed !== false) {
    errors.push('ProcessHealthReceipt.policies.automaticTerminationAllowed must be false.');
  }
  if (receipt.policies.exactPidRequired !== true) {
    errors.push('ProcessHealthReceipt.policies.exactPidRequired must be true.');
  }
  if (receipt.policies.receiptRequired !== true) {
    errors.push('ProcessHealthReceipt.policies.receiptRequired must be true.');
  }
  if (!isSupportedStopPolicy(String(receipt.policies.stopPolicy))) {
    errors.push(
      `ProcessHealthReceipt.policies.stopPolicy is unsupported: ${String(receipt.policies.stopPolicy)}.`
    );
  }
  validateTimestamp('ProcessHealthReceipt.generatedAt', receipt.generatedAt, errors);
  validateHash('ProcessHealthReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHardwareAuditReceipt(
  receipt: HardwareAuditReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['HardwareAuditReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION) {
    errors.push(
      `HardwareAuditReceipt.schemaVersion must be ${HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== SLOW_COMPUTER_CLINIC_WORKFLOW) {
    errors.push(`HardwareAuditReceipt.workflow must be ${SLOW_COMPUTER_CLINIC_WORKFLOW}.`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('HardwareAuditReceipt.id is required.');
  for (const [key, value] of Object.entries({
    cpuUtilizationPercent: receipt.cpuUtilizationPercent,
    memoryUsedPercent: receipt.memoryUsedPercent,
    diskUsedPercent: receipt.diskUsedPercent,
  })) {
    if (typeof value !== 'number' || value < 0 || value > 100) {
      errors.push(`HardwareAuditReceipt.${key} must be a number between 0 and 100.`);
    }
  }
  if (typeof receipt.memoryTotalGb !== 'number' || receipt.memoryTotalGb <= 0) {
    errors.push('HardwareAuditReceipt.memoryTotalGb must be a positive number.');
  }
  if (receipt.gpuUtilizationPercent !== null && (receipt.gpuUtilizationPercent < 0 || receipt.gpuUtilizationPercent > 100)) {
    errors.push('HardwareAuditReceipt.gpuUtilizationPercent must be null or between 0 and 100.');
  }
  if (receipt.gpuMemoryUsedPercent !== null && (receipt.gpuMemoryUsedPercent < 0 || receipt.gpuMemoryUsedPercent > 100)) {
    errors.push('HardwareAuditReceipt.gpuMemoryUsedPercent must be null or between 0 and 100.');
  }
  if (typeof receipt.thermalThrottling !== 'boolean' && receipt.thermalThrottling !== null) {
    errors.push('HardwareAuditReceipt.thermalThrottling must be boolean or null.');
  }
  validateTimestamp('HardwareAuditReceipt.generatedAt', receipt.generatedAt, errors);
  validateHash('HardwareAuditReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

function validateOwnershipPlan(plan: OwnershipPlan | undefined, index: number): string[] {
  const errors: string[] = [];
  if (!plan) return [`OwnershipPlans[${index}] is required.`];
  if (!Number.isInteger(plan.pid) || plan.pid <= 0) {
    errors.push(`OwnershipPlans[${index}].pid must be a positive integer.`);
  }
  if (!isNonEmptyString(plan.name)) errors.push(`OwnershipPlans[${index}].name is required.`);
  if (!isSupportedProcessCategory(String(plan.category))) {
    errors.push(`OwnershipPlans[${index}].category is unsupported: ${String(plan.category)}.`);
  }
  if (typeof plan.ownerHandoffRequired !== 'boolean') {
    errors.push(`OwnershipPlans[${index}].ownerHandoffRequired must be boolean.`);
  }
  if (typeof plan.cleanupEligible !== 'boolean') {
    errors.push(`OwnershipPlans[${index}].cleanupEligible must be boolean.`);
  }
  if (!isSupportedStopPolicy(String(plan.stopPolicy))) {
    errors.push(`OwnershipPlans[${index}].stopPolicy is unsupported: ${String(plan.stopPolicy)}.`);
  }
  if (typeof plan.memoryMb !== 'number' || plan.memoryMb < 0) {
    errors.push(`OwnershipPlans[${index}].memoryMb must be a non-negative number.`);
  }
  if (!Number.isInteger(plan.ageMinutes) || plan.ageMinutes < 0) {
    errors.push(`OwnershipPlans[${index}].ageMinutes must be a non-negative integer.`);
  }
  if (!Array.isArray(plan.findings)) {
    errors.push(`OwnershipPlans[${index}].findings must be an array.`);
  }
  return errors;
}

function validateGuardedStopPlan(plan: GuardedStopPlan | undefined, index: number): string[] {
  const errors: string[] = [];
  if (!plan) return[`StopPlans[${index}] is required.`];
  if (!isNonEmptyString(plan.planId)) errors.push(`StopPlans[${index}].planId is required.`);
  if (!Number.isInteger(plan.targetPid) || plan.targetPid <= 0) {
    errors.push(`StopPlans[${index}].targetPid must be a positive integer.`);
  }
  if (!isNonEmptyString(plan.targetName)) {
    errors.push(`StopPlans[${index}].targetName is required.`);
  }
  if (!isSupportedProcessCategory(String(plan.category))) {
    errors.push(`StopPlans[${index}].category is unsupported: ${String(plan.category)}.`);
  }
  if (plan.approvalRequired !== true) {
    errors.push(`StopPlans[${index}].approvalRequired must be true.`);
  }
  if (plan.safeToExecuteAutomatically !== false) {
    errors.push(`StopPlans[${index}].safeToExecuteAutomatically must be false.`);
  }
  if (typeof plan.breakGlass !== 'boolean') {
    errors.push(`StopPlans[${index}].breakGlass must be boolean.`);
  }
  if (typeof plan.ownerHandoffRequired !== 'boolean') {
    errors.push(`StopPlans[${index}].ownerHandoffRequired must be boolean.`);
  }
  if (!isSupportedStopPolicy(String(plan.stopPolicy))) {
    errors.push(`StopPlans[${index}].stopPolicy is unsupported: ${String(plan.stopPolicy)}.`);
  }
  if (typeof plan.memoryMb !== 'number' || plan.memoryMb < 0) {
    errors.push(`StopPlans[${index}].memoryMb must be a non-negative number.`);
  }
  if (!Number.isInteger(plan.ageMinutes) || plan.ageMinutes < 0) {
    errors.push(`StopPlans[${index}].ageMinutes must be a non-negative integer.`);
  }
  if (!Array.isArray(plan.findings)) {
    errors.push(`StopPlans[${index}].findings must be an array.`);
  }
  return errors;
}

export function validateRemediationVerificationReceipt(
  receipt: RemediationVerificationReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['RemediationVerificationReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION) {
    errors.push(
      `RemediationVerificationReceipt.schemaVersion must be ${HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== SLOW_COMPUTER_CLINIC_WORKFLOW) {
    errors.push(`RemediationVerificationReceipt.workflow must be ${SLOW_COMPUTER_CLINIC_WORKFLOW}.`);
  }
  if (!isNonEmptyString(receipt.id)) {
    errors.push('RemediationVerificationReceipt.id is required.');
  }
  if (!Number.isInteger(receipt.targetPid) || receipt.targetPid <= 0) {
    errors.push('RemediationVerificationReceipt.targetPid must be a positive integer.');
  }
  if (!isNonEmptyString(receipt.targetName)) {
    errors.push('RemediationVerificationReceipt.targetName is required.');
  }
  if (receipt.approvalCaptured !== true) {
    errors.push('RemediationVerificationReceipt.approvalCaptured must be true.');
  }
  if (typeof receipt.terminationPerformed !== 'boolean') {
    errors.push('RemediationVerificationReceipt.terminationPerformed must be boolean.');
  }
  if (receipt.afterVisible !== false) {
    errors.push('RemediationVerificationReceipt.afterVisible must be false.');
  }
  if (receipt.externalProcessTerminationAllowed !== false) {
    errors.push('RemediationVerificationReceipt.externalProcessTerminationAllowed must be false.');
  }
  if (receipt.exactPidRequired !== true) {
    errors.push('RemediationVerificationReceipt.exactPidRequired must be true.');
  }
  if (!isNonEmptyString(receipt.approvalId)) {
    errors.push('RemediationVerificationReceipt.approvalId is required.');
  }
  validateTimestamp('RemediationVerificationReceipt.generatedAt', receipt.generatedAt, errors);
  validateHash('RemediationVerificationReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateProductionStopReadinessReceipt(
  receipt: ProductionStopReadinessReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['ProductionStopReadinessReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION) {
    errors.push(
      `ProductionStopReadinessReceipt.schemaVersion must be ${HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== SLOW_COMPUTER_CLINIC_WORKFLOW) {
    errors.push(`ProductionStopReadinessReceipt.workflow must be ${SLOW_COMPUTER_CLINIC_WORKFLOW}.`);
  }
  if (!isNonEmptyString(receipt.id)) {
    errors.push('ProductionStopReadinessReceipt.id is required.');
  }
  if (!Number.isInteger(receipt.targetPid) || receipt.targetPid <= 0) {
    errors.push('ProductionStopReadinessReceipt.targetPid must be a positive integer.');
  }
  if (!isNonEmptyString(receipt.targetName)) {
    errors.push('ProductionStopReadinessReceipt.targetName is required.');
  }
  if (receipt.exactPidRechecked !== true) {
    errors.push('ProductionStopReadinessReceipt.exactPidRechecked must be true.');
  }
  if (receipt.approvalCaptured !== true) {
    errors.push('ProductionStopReadinessReceipt.approvalCaptured must be true.');
  }
  if (typeof receipt.ownerAckCaptured !== 'boolean') {
    errors.push('ProductionStopReadinessReceipt.ownerAckCaptured must be boolean.');
  }
  if (receipt.dryRunOnly !== true) {
    errors.push('ProductionStopReadinessReceipt.dryRunOnly must be true.');
  }
  if (receipt.terminationPerformed !== false) {
    errors.push('ProductionStopReadinessReceipt.terminationPerformed must be false.');
  }
  if (receipt.externalProcessTerminationAllowed !== false) {
    errors.push('ProductionStopReadinessReceipt.externalProcessTerminationAllowed must be false.');
  }
  if (!Array.isArray(receipt.blockedReasons)) {
    errors.push('ProductionStopReadinessReceipt.blockedReasons must be an array.');
  }
  if (!isNonEmptyString(receipt.approvalId)) {
    errors.push('ProductionStopReadinessReceipt.approvalId is required.');
  }
  if (!isSupportedStopPolicy(String(receipt.stopPolicy))) {
    errors.push(
      `ProductionStopReadinessReceipt.stopPolicy is unsupported: ${String(receipt.stopPolicy)}.`
    );
  }
  validateTimestamp('ProductionStopReadinessReceipt.generatedAt', receipt.generatedAt, errors);
  validateHash('ProductionStopReadinessReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateSlowComputerClinicReplayReceipt(
  receipt: SlowComputerClinicReplayReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['SlowComputerClinicReplayReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION) {
    errors.push(
      `SlowComputerClinicReplayReceipt.schemaVersion must be ${HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== SLOW_COMPUTER_CLINIC_WORKFLOW) {
    errors.push(`SlowComputerClinicReplayReceipt.workflow must be ${SLOW_COMPUTER_CLINIC_WORKFLOW}.`);
  }
  if (!isSupportedClinicWorkflowState(String(receipt.status))) {
    errors.push(`SlowComputerClinicReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!isNonEmptyString(receipt.processHealthReceiptId)) {
    errors.push('SlowComputerClinicReplayReceipt.processHealthReceiptId is required.');
  }
  if (!isNonEmptyString(receipt.hardwareAuditReceiptId)) {
    errors.push('SlowComputerClinicReplayReceipt.hardwareAuditReceiptId is required.');
  }
  if (!isNonEmptyString(receipt.replayKey)) {
    errors.push('SlowComputerClinicReplayReceipt.replayKey is required.');
  }
  for (const [key, value] of Object.entries({
    processCount: receipt.processCount,
    ownerHandoffPlanCount: receipt.ownerHandoffPlanCount,
    stopPlanCount: receipt.stopPlanCount,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`SlowComputerClinicReplayReceipt.${key} must be a non-negative integer.`);
    }
  }
  if (receipt.rawCommandLinesCaptured !== false) {
    errors.push('SlowComputerClinicReplayReceipt.rawCommandLinesCaptured must be false.');
  }
  if (receipt.rawCommandLinesHiddenByDefault !== true) {
    errors.push('SlowComputerClinicReplayReceipt.rawCommandLinesHiddenByDefault must be true.');
  }
  validateTimestamp('SlowComputerClinicReplayReceipt.createdAt', receipt.createdAt, errors);
  validateHash('SlowComputerClinicReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellSlowComputerClinicReceiptPack(
  pack: HoloShellSlowComputerClinicReceiptPack | undefined
): string[] {
  const errors: string[] = [];
  if (!pack) return ['HoloShellSlowComputerClinicReceiptPack is required.'];
  if (pack.schemaVersion !== HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION) {
    errors.push(
      `HoloShellSlowComputerClinicReceiptPack.schemaVersion must be ${HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION}.`
    );
  }
  if (pack.workflow !== SLOW_COMPUTER_CLINIC_WORKFLOW) {
    errors.push(
      `HoloShellSlowComputerClinicReceiptPack.workflow must be ${SLOW_COMPUTER_CLINIC_WORKFLOW}.`
    );
  }
  if (!isSupportedClinicWorkflowState(String(pack.status))) {
    errors.push(
      `HoloShellSlowComputerClinicReceiptPack.status is unsupported: ${String(pack.status)}.`
    );
  }
  validateHash('HoloShellSlowComputerClinicReceiptPack', pack.hash, pack.hashAlgorithm, errors);

  // Validate sub-receipts
  errors.push(...validateProcessHealthReceipt(pack.processHealth));
  errors.push(...validateHardwareAuditReceipt(pack.hardwareAudit));

  // Validate ownership plans
  if (!Array.isArray(pack.ownershipPlans)) {
    errors.push('HoloShellSlowComputerClinicReceiptPack.ownershipPlans must be an array.');
  } else {
    pack.ownershipPlans.forEach((plan, index) => {
      errors.push(...validateOwnershipPlan(plan, index));
    });
  }

  // Validate stop plans
  if (!Array.isArray(pack.stopPlans)) {
    errors.push('HoloShellSlowComputerClinicReceiptPack.stopPlans must be an array.');
  } else {
    pack.stopPlans.forEach((plan, index) => {
      errors.push(...validateGuardedStopPlan(plan, index));
    });
  }

  // Remediation verification is optional but must validate if present
  if (pack.remediationVerification) {
    errors.push(...validateRemediationVerificationReceipt(pack.remediationVerification));
  }

  // Production stop readiness is optional but must validate if present
  if (pack.productionStopReadiness) {
    errors.push(...validateProductionStopReadinessReceipt(pack.productionStopReadiness));
  }

  // Validate replay receipt
  errors.push(...validateSlowComputerClinicReplayReceipt(pack.replay));

  // Cross-receipt consistency
  if (pack.status !== pack.replay.status) {
    errors.push('HoloShellSlowComputerClinicReceiptPack.status must match replay.status.');
  }

  // Remediation verification requires terminationPerformed to be consistent
  if (pack.remediationVerification && !pack.remediationVerification.terminationPerformed) {
    // If termination wasn't performed, productionStopReadiness should be present for next step
    if (!pack.productionStopReadiness) {
      // This is a warning, not a hard error — the workflow may still be in progress
    }
  }

  return errors;
}

// ── Clone ──

export function cloneOwnershipPlan(plan: OwnershipPlan): OwnershipPlan {
  return { ...plan, findings: [...plan.findings] };
}

export function cloneGuardedStopPlan(plan: GuardedStopPlan): GuardedStopPlan {
  return { ...plan, findings: [...plan.findings] };
}

export function cloneHoloShellSlowComputerClinicReceiptPack(
  pack: HoloShellSlowComputerClinicReceiptPack
): HoloShellSlowComputerClinicReceiptPack {
  return {
    ...pack,
    ownershipPlans: pack.ownershipPlans.map(cloneOwnershipPlan),
    stopPlans: pack.stopPlans.map(cloneGuardedStopPlan),
    remediationVerification: pack.remediationVerification
      ? { ...pack.remediationVerification }
      : undefined,
    productionStopReadiness: pack.productionStopReadiness
      ? {
          ...pack.productionStopReadiness,
          blockedReasons: [...pack.productionStopReadiness.blockedReasons],
        }
      : undefined,
    replay: { ...pack.replay },
  };
}