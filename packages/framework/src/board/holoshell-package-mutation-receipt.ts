/**
 * HoloShell Package Mutation Receipt
 *
 * Reusable substrate contract for install/update/uninstall custody. HoloLand
 * renders the visible package gate; HoloScript validates the receipt that keeps
 * package-manager mutation out of ambient shell execution.
 */

import type { ArtifactHashAlgorithm } from './board-types';

export const HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION =
  'hololand.holoshell.package-custody.v0.1.0';

export const PACKAGE_MUTATION_KINDS = ['inventory', 'install', 'upgrade', 'uninstall'] as const;
export type PackageMutationKind = (typeof PACKAGE_MUTATION_KINDS)[number];

export const PACKAGE_MUTATION_STATUSES = [
  'inventory_only',
  'approval_required',
  'blocked',
  'approved',
  'mutating',
  'verified',
] as const;
export type PackageMutationStatus = (typeof PACKAGE_MUTATION_STATUSES)[number];

export const PACKAGE_PERMISSION_ENVELOPES = ['read_only', 'break_glass'] as const;
export type PackagePermissionEnvelope = (typeof PACKAGE_PERMISSION_ENVELOPES)[number];

export const PACKAGE_MANAGERS = [
  'winget',
  'choco',
  'scoop',
  'brew',
  'apt',
  'dnf',
  'yum',
  'npm',
  'pnpm',
  'yarn',
  'pip',
  'cargo',
  'msi',
  'exe',
  'unknown',
] as const;
export type PackageManagerKind = (typeof PACKAGE_MANAGERS)[number];

export const PACKAGE_PREFLIGHT_STATUSES = ['pass', 'warn', 'fail', 'unknown'] as const;
export type PackagePreflightStatus = (typeof PACKAGE_PREFLIGHT_STATUSES)[number];

export interface PackageCandidate {
  packageId: string;
  packageName: string;
  manager: PackageManagerKind | string;
  source: string;
  publisher?: string;
  currentVersion?: string;
  availableVersion?: string;
  installerUrl?: string;
  installerHash?: string;
  installerHashAlgorithm?: ArtifactHashAlgorithm;
}

export interface PackagePreflightReceipt {
  adminRequired: boolean;
  adminSession: boolean;
  diskStatus: PackagePreflightStatus | string;
  networkStatus: PackagePreflightStatus | string;
  processConflictStatus: PackagePreflightStatus | string;
  packageManagerAvailable: boolean;
}

export interface PackageMutationApproval {
  approvalId: string;
  approvalRequired: boolean;
  approvalCaptured: boolean;
  requiresFreshUserGesture: boolean;
  approvedCommandPreview: string;
  rollbackLimits: string[];
  expiresAt: string;
}

export interface PackageLaunchVerification {
  binaryPath?: string;
  versionCommand?: string;
  versionCommandPassed: boolean;
  launchVerified: boolean;
  verifiedVersion?: string;
}

export interface PackageMutationSourceAnchors {
  source?: string;
  adapter?: string;
  upstreamValidator?: string;
  priorEvidence?: string;
}

export interface PackageMutationSummary {
  status: PackageMutationStatus | string;
  packageId: string;
  packageName: string;
  manager: PackageManagerKind | string;
  source: string;
  fromVersion?: string;
  toVersion?: string;
  permissionEnvelope: PackagePermissionEnvelope | string;
  approvalRequired: boolean;
  approvalId: string;
  executionAllowed: boolean;
  mutationPerformed: boolean;
  adminRequired: boolean;
  adminSession: boolean;
  packageManagerAvailable: boolean;
  rollbackLimitCount: number;
  launchVerified: boolean;
}

export interface PackageMutationOutputRefs {
  latestPath: string;
  jsPath: string;
  receiptDir: string;
}

export interface PackageMutationMetadata {
  deterministic: boolean;
  wrapperMode: string;
  liveMutationExecutionSupported: boolean;
  commandPreview: string;
  host?: Record<string, unknown>;
}

export interface HoloShellPackageMutationReceipt {
  schemaVersion: typeof HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION;
  id: string;
  workflow: 'install-update-tool-custody';
  generatedAt: string;
  startedAt: string;
  endedAt: string;
  mutationKind: PackageMutationKind;
  status: PackageMutationStatus | string;
  permissionEnvelope: PackagePermissionEnvelope;
  candidate: PackageCandidate;
  preflight: PackagePreflightReceipt;
  approval: PackageMutationApproval;
  verification: PackageLaunchVerification;
  mutationPerformed: boolean;
  replayKey: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  sourceAnchors?: PackageMutationSourceAnchors;
  summary: PackageMutationSummary;
  output?: PackageMutationOutputRefs;
  verificationCommands?: (string | { command: string })[];
  provenance?: string[];
  metadata: PackageMutationMetadata;
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

function hasAbsolutePath(value: string | undefined): boolean {
  return (
    typeof value === 'string' &&
    /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/.test(value)
  );
}

function validatePublicPath(label: string, value: string | undefined, errors: string[]): void {
  if (!isNonEmptyString(value)) {
    errors.push(`${label} is required.`);
  } else if (hasAbsolutePath(value)) {
    errors.push(`${label} must be repo-relative or redacted, not an absolute path.`);
  }
}

function validateTimestamp(label: string, value: string | undefined, errors: string[]): void {
  if (!isIsoTimestamp(value)) errors.push(`${label} must be a valid ISO-8601 timestamp.`);
}

function validateBoolean(label: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'boolean') errors.push(`${label} must be a boolean.`);
}

function isMutation(kind: PackageMutationKind | string): boolean {
  return kind === 'install' || kind === 'upgrade' || kind === 'uninstall';
}

function validateCandidate(
  candidate: PackageCandidate | undefined,
  mutationKind: PackageMutationKind,
  errors: string[]
): void {
  if (!candidate) {
    errors.push('HoloShellPackageMutationReceipt.candidate is required.');
    return;
  }
  if (!isNonEmptyString(candidate.packageId)) {
    errors.push('PackageCandidate.packageId is required.');
  }
  if (!isNonEmptyString(candidate.packageName)) {
    errors.push('PackageCandidate.packageName is required.');
  }
  if (!isNonEmptyString(candidate.manager)) {
    errors.push('PackageCandidate.manager is required.');
  }
  if (!isNonEmptyString(candidate.source)) {
    errors.push('PackageCandidate.source is required.');
  }
  if (candidate.installerHash && candidate.installerHashAlgorithm !== 'sha256') {
    errors.push('PackageCandidate.installerHashAlgorithm must be sha256 when installerHash is present.');
  }
  if (isMutation(mutationKind) && candidate.installerUrl && !candidate.installerHash) {
    errors.push('PackageCandidate.installerHash is required when an installerUrl is present for a mutation.');
  }
}

function validatePreflight(preflight: PackagePreflightReceipt | undefined, errors: string[]): void {
  if (!preflight) {
    errors.push('HoloShellPackageMutationReceipt.preflight is required.');
    return;
  }
  validateBoolean('PackagePreflightReceipt.adminRequired', preflight.adminRequired, errors);
  validateBoolean('PackagePreflightReceipt.adminSession', preflight.adminSession, errors);
  validateBoolean('PackagePreflightReceipt.packageManagerAvailable', preflight.packageManagerAvailable, errors);
  if (!isNonEmptyString(preflight.diskStatus)) errors.push('PackagePreflightReceipt.diskStatus is required.');
  if (!isNonEmptyString(preflight.networkStatus)) errors.push('PackagePreflightReceipt.networkStatus is required.');
  if (!isNonEmptyString(preflight.processConflictStatus)) {
    errors.push('PackagePreflightReceipt.processConflictStatus is required.');
  }
}

function validateApproval(
  approval: PackageMutationApproval | undefined,
  mutationKind: PackageMutationKind,
  permissionEnvelope: PackagePermissionEnvelope,
  errors: string[]
): void {
  if (!approval) {
    errors.push('HoloShellPackageMutationReceipt.approval is required.');
    return;
  }
  if (!isNonEmptyString(approval.approvalId)) errors.push('PackageMutationApproval.approvalId is required.');
  validateBoolean('PackageMutationApproval.approvalRequired', approval.approvalRequired, errors);
  validateBoolean('PackageMutationApproval.approvalCaptured', approval.approvalCaptured, errors);
  validateBoolean(
    'PackageMutationApproval.requiresFreshUserGesture',
    approval.requiresFreshUserGesture,
    errors
  );
  validateTimestamp('PackageMutationApproval.expiresAt', approval.expiresAt, errors);

  if (!Array.isArray(approval.rollbackLimits) || approval.rollbackLimits.length === 0) {
    errors.push('PackageMutationApproval.rollbackLimits must include at least one visible rollback limit.');
  } else if (approval.rollbackLimits.some((limit) => !isNonEmptyString(limit))) {
    errors.push('PackageMutationApproval.rollbackLimits entries must be non-empty.');
  }

  if (isMutation(mutationKind)) {
    if (permissionEnvelope !== 'break_glass') {
      errors.push('Package mutation receipts must use the break_glass permission envelope.');
    }
    if (!approval.approvalRequired) {
      errors.push('Package mutation receipts must require approval.');
    }
    if (!approval.requiresFreshUserGesture) {
      errors.push('Package mutation receipts must require a fresh user gesture.');
    }
    if (!isNonEmptyString(approval.approvedCommandPreview)) {
      errors.push('Package mutation receipts must include an approved command preview.');
    }
  } else if (permissionEnvelope !== 'read_only') {
    errors.push('Inventory-only package receipts must use the read_only permission envelope.');
  }
}

function validateVerification(
  verification: PackageLaunchVerification | undefined,
  errors: string[]
): void {
  if (!verification) {
    errors.push('HoloShellPackageMutationReceipt.verification is required.');
    return;
  }
  validateBoolean('PackageLaunchVerification.versionCommandPassed', verification.versionCommandPassed, errors);
  validateBoolean('PackageLaunchVerification.launchVerified', verification.launchVerified, errors);
  if (verification.launchVerified) {
    if (!isNonEmptyString(verification.binaryPath)) {
      errors.push('PackageLaunchVerification.binaryPath is required when launchVerified is true.');
    }
    if (!isNonEmptyString(verification.versionCommand)) {
      errors.push('PackageLaunchVerification.versionCommand is required when launchVerified is true.');
    }
    if (!verification.versionCommandPassed) {
      errors.push('PackageLaunchVerification.versionCommandPassed must be true when launchVerified is true.');
    }
    if (!isNonEmptyString(verification.verifiedVersion)) {
      errors.push('PackageLaunchVerification.verifiedVersion is required when launchVerified is true.');
    }
  }
}

function validateSummary(
  receipt: HoloShellPackageMutationReceipt,
  errors: string[]
): void {
  const summary = receipt.summary;
  if (!summary) {
    errors.push('HoloShellPackageMutationReceipt.summary is required.');
    return;
  }
  if (summary.packageId !== receipt.candidate?.packageId) {
    errors.push('PackageMutationSummary.packageId must match candidate.packageId.');
  }
  if (summary.packageName !== receipt.candidate?.packageName) {
    errors.push('PackageMutationSummary.packageName must match candidate.packageName.');
  }
  if (summary.manager !== receipt.candidate?.manager) {
    errors.push('PackageMutationSummary.manager must match candidate.manager.');
  }
  if (summary.source !== receipt.candidate?.source) {
    errors.push('PackageMutationSummary.source must match candidate.source.');
  }
  if (summary.permissionEnvelope !== receipt.permissionEnvelope) {
    errors.push('PackageMutationSummary.permissionEnvelope must match receipt.permissionEnvelope.');
  }
  if (summary.approvalRequired !== receipt.approval?.approvalRequired) {
    errors.push('PackageMutationSummary.approvalRequired must match approval.approvalRequired.');
  }
  if (summary.approvalId !== receipt.approval?.approvalId) {
    errors.push('PackageMutationSummary.approvalId must match approval.approvalId.');
  }
  if (summary.mutationPerformed !== receipt.mutationPerformed) {
    errors.push('PackageMutationSummary.mutationPerformed must match receipt.mutationPerformed.');
  }
  if (summary.adminRequired !== receipt.preflight?.adminRequired) {
    errors.push('PackageMutationSummary.adminRequired must match preflight.adminRequired.');
  }
  if (summary.adminSession !== receipt.preflight?.adminSession) {
    errors.push('PackageMutationSummary.adminSession must match preflight.adminSession.');
  }
  if (summary.packageManagerAvailable !== receipt.preflight?.packageManagerAvailable) {
    errors.push('PackageMutationSummary.packageManagerAvailable must match preflight.packageManagerAvailable.');
  }
  if (summary.launchVerified !== receipt.verification?.launchVerified) {
    errors.push('PackageMutationSummary.launchVerified must match verification.launchVerified.');
  }
  if (!Number.isInteger(summary.rollbackLimitCount) || summary.rollbackLimitCount < 0) {
    errors.push('PackageMutationSummary.rollbackLimitCount must be a non-negative integer.');
  }
  if (summary.rollbackLimitCount !== (receipt.approval?.rollbackLimits?.length ?? -1)) {
    errors.push('PackageMutationSummary.rollbackLimitCount must match approval.rollbackLimits length.');
  }
  if (isMutation(receipt.mutationKind) && summary.executionAllowed && !receipt.approval?.approvalCaptured) {
    errors.push('PackageMutationSummary.executionAllowed cannot be true before approval is captured.');
  }
}

function validateOutput(output: PackageMutationOutputRefs | undefined, errors: string[]): void {
  if (!output) return;
  validatePublicPath('PackageMutationOutputRefs.latestPath', output.latestPath, errors);
  validatePublicPath('PackageMutationOutputRefs.jsPath', output.jsPath, errors);
  validatePublicPath('PackageMutationOutputRefs.receiptDir', output.receiptDir, errors);
}

function validateMetadata(metadata: PackageMutationMetadata | undefined, errors: string[]): void {
  if (!metadata) {
    errors.push('HoloShellPackageMutationReceipt.metadata is required.');
    return;
  }
  if (metadata.deterministic !== true) {
    errors.push('PackageMutationMetadata.deterministic must be true.');
  }
  if (!isNonEmptyString(metadata.wrapperMode)) {
    errors.push('PackageMutationMetadata.wrapperMode is required.');
  }
  if (metadata.liveMutationExecutionSupported !== false) {
    errors.push('PackageMutationMetadata.liveMutationExecutionSupported must be false until native approval gates exist.');
  }
  if (!isNonEmptyString(metadata.commandPreview)) {
    errors.push('PackageMutationMetadata.commandPreview is required.');
  }
}

export function isSupportedPackageMutationKind(value: string): value is PackageMutationKind {
  return isOneOf(PACKAGE_MUTATION_KINDS, value);
}

export function isSupportedPackageMutationStatus(value: string): value is PackageMutationStatus {
  return isOneOf(PACKAGE_MUTATION_STATUSES, value);
}

export function isSupportedPackagePermissionEnvelope(value: string): value is PackagePermissionEnvelope {
  return isOneOf(PACKAGE_PERMISSION_ENVELOPES, value);
}

export function isSupportedPackageManagerKind(value: string): value is PackageManagerKind {
  return isOneOf(PACKAGE_MANAGERS, value);
}

export function validateHoloShellPackageMutationReceipt(
  receipt: HoloShellPackageMutationReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['HoloShellPackageMutationReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION) {
    errors.push(`HoloShellPackageMutationReceipt.schemaVersion must be ${HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION}.`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('HoloShellPackageMutationReceipt.id is required.');
  if (receipt.workflow !== 'install-update-tool-custody') {
    errors.push('HoloShellPackageMutationReceipt.workflow must be install-update-tool-custody.');
  }
  validateTimestamp('HoloShellPackageMutationReceipt.generatedAt', receipt.generatedAt, errors);
  validateTimestamp('HoloShellPackageMutationReceipt.startedAt', receipt.startedAt, errors);
  validateTimestamp('HoloShellPackageMutationReceipt.endedAt', receipt.endedAt, errors);
  if (!isSupportedPackageMutationKind(String(receipt.mutationKind))) {
    errors.push(`HoloShellPackageMutationReceipt.mutationKind is unsupported: ${String(receipt.mutationKind)}.`);
  }
  if (!isSupportedPackageMutationStatus(String(receipt.status))) {
    errors.push(`HoloShellPackageMutationReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!isSupportedPackagePermissionEnvelope(String(receipt.permissionEnvelope))) {
    errors.push(`HoloShellPackageMutationReceipt.permissionEnvelope is unsupported: ${String(receipt.permissionEnvelope)}.`);
  }
  if (receipt.status !== receipt.summary?.status) {
    errors.push('HoloShellPackageMutationReceipt.status must match summary.status.');
  }
  if (typeof receipt.mutationPerformed !== 'boolean') {
    errors.push('HoloShellPackageMutationReceipt.mutationPerformed must be a boolean.');
  }
  if (receipt.mutationPerformed && !receipt.approval?.approvalCaptured) {
    errors.push('HoloShellPackageMutationReceipt.mutationPerformed cannot be true before approval is captured.');
  }
  if (!isNonEmptyString(receipt.replayKey)) errors.push('HoloShellPackageMutationReceipt.replayKey is required.');
  if (!isNonEmptyString(receipt.hash)) errors.push('HoloShellPackageMutationReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') {
    errors.push('HoloShellPackageMutationReceipt.hashAlgorithm must be sha256.');
  }
  for (const command of receipt.verificationCommands ?? []) {
    const commandText = typeof command === 'string' ? command : command.command;
    if (!isNonEmptyString(commandText)) {
      errors.push('HoloShellPackageMutationReceipt has a verification command without command text.');
    }
  }
  for (const anchor of Object.values(receipt.sourceAnchors ?? {})) {
    if (hasAbsolutePath(anchor)) {
      errors.push('PackageMutationSourceAnchors must be repo-relative or redacted, not absolute paths.');
    }
  }
  for (const provenance of receipt.provenance ?? []) {
    if (!isNonEmptyString(provenance)) {
      errors.push('HoloShellPackageMutationReceipt.provenance entries must be non-empty.');
    }
  }

  if (isSupportedPackageMutationKind(String(receipt.mutationKind))) {
    validateCandidate(receipt.candidate, receipt.mutationKind, errors);
    validateApproval(receipt.approval, receipt.mutationKind, receipt.permissionEnvelope, errors);
  }
  validatePreflight(receipt.preflight, errors);
  validateVerification(receipt.verification, errors);
  validateSummary(receipt, errors);
  validateOutput(receipt.output, errors);
  validateMetadata(receipt.metadata, errors);
  return errors;
}

export function clonePackageCandidate(candidate: PackageCandidate): PackageCandidate {
  return { ...candidate };
}

export function cloneHoloShellPackageMutationReceipt(
  receipt: HoloShellPackageMutationReceipt
): HoloShellPackageMutationReceipt {
  return {
    ...receipt,
    candidate: clonePackageCandidate(receipt.candidate),
    preflight: { ...receipt.preflight },
    approval: {
      ...receipt.approval,
      rollbackLimits: [...receipt.approval.rollbackLimits],
    },
    verification: { ...receipt.verification },
    ...(receipt.sourceAnchors ? { sourceAnchors: { ...receipt.sourceAnchors } } : {}),
    summary: { ...receipt.summary },
    ...(receipt.output ? { output: { ...receipt.output } } : {}),
    ...(receipt.verificationCommands
      ? {
          verificationCommands: receipt.verificationCommands.map((c) =>
            typeof c === 'string' ? c : { ...c }
          ),
        }
      : {}),
    ...(receipt.provenance ? { provenance: [...receipt.provenance] } : {}),
    metadata: {
      ...receipt.metadata,
      ...(receipt.metadata.host ? { host: { ...receipt.metadata.host } } : {}),
    },
  };
}
