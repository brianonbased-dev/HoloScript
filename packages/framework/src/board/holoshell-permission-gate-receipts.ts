/**
 * HoloShell Permission Gate Receipts
 *
 * Reusable substrate contract for provider, app, connector, and device
 * permission gates. HoloLand renders the visible room; HoloScript validates
 * minimum-scope grants, redacted credentials, verification, revoke paths, and
 * replay receipts.
 */

import type { ArtifactHashAlgorithm } from './board-types';
import {
  buildStdlibPermissionScopeDiff,
  evaluateStdlibPermissionScopePolicy,
  findExtraPermissionScopes,
  findMissingRequiredPermissionScopes,
  normalizePermissionScopeName,
  redactStdlibPermissionPreview,
  stdlibPermissionPreviewHasPublicLeak,
  type StdlibPermissionPreviewRedactionResult,
  type StdlibPermissionScopeDiffInput,
  type StdlibPermissionScopeDiffResult,
  type StdlibPermissionScopePolicyEvaluation,
} from '@holoscript/core';

export const HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION =
  'hololand.holoshell.permission-gate.v0.1.0';

export const PERMISSION_GATE_WORKFLOW = 'provider-app-device-permission-gate' as const;

export const PERMISSION_SUBJECT_KINDS = [
  'provider_account',
  'oauth_app',
  'browser_profile',
  'os_app_permission',
  'device',
  'connector',
  'cloud_service',
  'local_app',
] as const;
export type PermissionSubjectKind = (typeof PERMISSION_SUBJECT_KINDS)[number];

export const PERMISSION_GATE_ENVELOPES = [
  'read_only',
  'guarded_grant',
  'break_glass_permission',
  'revoke_only',
] as const;
export type PermissionGateEnvelope = (typeof PERMISSION_GATE_ENVELOPES)[number];

export const PERMISSION_GATE_STATUSES = [
  'planned',
  'requested',
  'granted',
  'verified',
  'revoked',
  'blocked',
  'failed',
] as const;
export type PermissionGateStatus = (typeof PERMISSION_GATE_STATUSES)[number];

export const PERMISSION_VERIFICATION_METHODS = [
  'oauth_tokeninfo',
  'provider_settings',
  'os_permission_probe',
  'device_permission_probe',
  'connector_probe',
  'manual_redacted_witness',
] as const;
export type PermissionVerificationMethod = (typeof PERMISSION_VERIFICATION_METHODS)[number];

export const PERMISSION_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type PermissionRiskLevel = (typeof PERMISSION_RISK_LEVELS)[number];

export interface PermissionScopeGrant {
  scope: string;
  purpose: string;
  required: boolean;
  riskLevel: PermissionRiskLevel | string;
  providerLabel?: string;
}

export interface PermissionSubjectReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  subjectKind: PermissionSubjectKind | string;
  provider: string;
  redactedSubjectLabel: string;
  subjectLabelHash: string;
  accountLabelHash?: string;
  browserProfile?: string;
  appIdentifier?: string;
  deviceIdHash?: string;
  credentialAdjacent: boolean;
  publicReceiptMayContainAbsolutePath: false;
  credentialExtrusionAllowed: false;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface PermissionRequestReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  subjectReceiptId: string;
  requestedScopes: PermissionScopeGrant[];
  minimumRequiredScopes: PermissionScopeGrant[];
  neverScopes: string[];
  purpose: string;
  permissionEnvelope: PermissionGateEnvelope | string;
  requiresFreshUserGesture: boolean;
  approvalId: string;
  commandOrUrlPreview?: string;
  commandPreviewContainsAbsolutePaths: false;
  requestedAt: string;
  expiresAt?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface PermissionGrantReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  requestReceiptId: string;
  grantedScopes: PermissionScopeGrant[];
  deniedScopes: string[];
  missingRequiredScopes: string[];
  extraScopes: string[];
  grantObservedAt: string;
  freshUserGesture: boolean;
  hiddenAutomationUsed: false;
  rawCredentialCaptured: false;
  tokenReferenceHash?: string;
  refreshChainHash?: string;
  expiresAt?: string;
  revocationInstruction: string;
  revocationUrlHash?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface PermissionVerificationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  grantReceiptId: string;
  verificationMethod: PermissionVerificationMethod | string;
  verifiedAt: string;
  minimumScopeSatisfied: boolean;
  excessScopesAbsent: boolean;
  verifiedScopes: PermissionScopeGrant[];
  scopeDiffHash: string;
  readyForHoloLand: boolean;
  credentialExtrusionAllowed: false;
  publicReceiptMayContainAbsolutePath: false;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface PermissionRevocationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  grantReceiptId: string;
  revokedAt?: string;
  revokeVerified: boolean;
  revocationMethod: string;
  requiresFreshUserGesture: true;
  hiddenAutomationUsed: false;
  residualAccessWarning?: string;
  rollbackNote: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface PermissionReplayReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  workflow: typeof PERMISSION_GATE_WORKFLOW;
  status: PermissionGateStatus | string;
  subjectReceiptId: string;
  requestReceiptId: string;
  grantReceiptId?: string;
  verificationReceiptId?: string;
  revocationReceiptId?: string;
  replayKey: string;
  rawCredentialCaptured: false;
  overbroadScopeAccepted: false;
  readyForHoloLand: boolean;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellPermissionGateReceiptPack {
  id: string;
  schemaVersion: typeof HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION;
  workflow: typeof PERMISSION_GATE_WORKFLOW;
  status: PermissionGateStatus | string;
  subject: PermissionSubjectReceipt;
  request: PermissionRequestReceipt;
  grant?: PermissionGrantReceipt;
  verification?: PermissionVerificationReceipt;
  revocation?: PermissionRevocationReceipt;
  replay: PermissionReplayReceipt;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export type PermissionScopePolicyEvaluation = StdlibPermissionScopePolicyEvaluation;

export interface PermissionScopeDiffInput extends StdlibPermissionScopeDiffInput {
  requestedScopes: PermissionScopeGrant[];
  minimumRequiredScopes: PermissionScopeGrant[];
  grantedScopes?: PermissionScopeGrant[];
  neverScopes?: string[];
}

export type PermissionScopeDiffResult = StdlibPermissionScopeDiffResult;

export type PermissionPreviewRedactionResult = StdlibPermissionPreviewRedactionResult;

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export { normalizePermissionScopeName };

export function evaluatePermissionScopePolicy(
  scope: string,
  neverScopes: string[] = []
): PermissionScopePolicyEvaluation {
  return evaluateStdlibPermissionScopePolicy(scope, neverScopes);
}

export function buildPermissionScopeDiff(
  input: PermissionScopeDiffInput
): PermissionScopeDiffResult {
  return buildStdlibPermissionScopeDiff(input);
}

export function redactPermissionGatePreview(
  value: string | undefined
): PermissionPreviewRedactionResult {
  return redactStdlibPermissionPreview(value);
}

export function permissionPreviewHasPublicLeak(value: string | undefined): boolean {
  return stdlibPermissionPreviewHasPublicLeak(value);
}

function validateTimestamp(label: string, value: string | undefined, errors: string[]): void {
  if (!isIsoTimestamp(value)) errors.push(`${label} must be a valid ISO-8601 timestamp.`);
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

function validateScopeGrant(
  label: string,
  grant: PermissionScopeGrant,
  neverScopes: string[],
  errors: string[]
): void {
  if (!isNonEmptyString(grant.scope)) errors.push(`${label}.scope is required.`);
  if (!isNonEmptyString(grant.purpose)) errors.push(`${label}.purpose is required.`);
  if (typeof grant.required !== 'boolean') errors.push(`${label}.required must be a boolean.`);
  if (!isNonEmptyString(grant.riskLevel)) errors.push(`${label}.riskLevel is required.`);
  const policy = evaluatePermissionScopePolicy(grant.scope, neverScopes);
  if (!policy.allowed) errors.push(`${label}.scope ${policy.reason}: ${grant.scope}.`);
}

function findMissingRequired(
  request: PermissionRequestReceipt,
  granted: PermissionScopeGrant[]
): string[] {
  return findMissingRequiredPermissionScopes(request.minimumRequiredScopes, granted);
}

function findExtraScopes(
  granted: PermissionScopeGrant[],
  minimum: PermissionScopeGrant[]
): string[] {
  return findExtraPermissionScopes(granted, minimum);
}

export function isSupportedPermissionSubjectKind(value: string): value is PermissionSubjectKind {
  return isOneOf(PERMISSION_SUBJECT_KINDS, value);
}

export function isSupportedPermissionGateEnvelope(value: string): value is PermissionGateEnvelope {
  return isOneOf(PERMISSION_GATE_ENVELOPES, value);
}

export function isSupportedPermissionGateStatus(value: string): value is PermissionGateStatus {
  return isOneOf(PERMISSION_GATE_STATUSES, value);
}

export function isSupportedPermissionVerificationMethod(
  value: string
): value is PermissionVerificationMethod {
  return isOneOf(PERMISSION_VERIFICATION_METHODS, value);
}

export function validatePermissionSubjectReceipt(
  receipt: PermissionSubjectReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PermissionSubjectReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `PermissionSubjectReceipt.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('PermissionSubjectReceipt.id is required.');
  if (!isSupportedPermissionSubjectKind(String(receipt.subjectKind))) {
    errors.push(
      `PermissionSubjectReceipt.subjectKind is unsupported: ${String(receipt.subjectKind)}.`
    );
  }
  if (!isNonEmptyString(receipt.provider))
    errors.push('PermissionSubjectReceipt.provider is required.');
  if (!isNonEmptyString(receipt.redactedSubjectLabel)) {
    errors.push('PermissionSubjectReceipt.redactedSubjectLabel is required.');
  }
  if (!isNonEmptyString(receipt.subjectLabelHash)) {
    errors.push('PermissionSubjectReceipt.subjectLabelHash is required.');
  }
  if (typeof receipt.credentialAdjacent !== 'boolean') {
    errors.push('PermissionSubjectReceipt.credentialAdjacent must be a boolean.');
  }
  if (receipt.publicReceiptMayContainAbsolutePath !== false) {
    errors.push('PermissionSubjectReceipt.publicReceiptMayContainAbsolutePath must be false.');
  }
  if (receipt.credentialExtrusionAllowed !== false) {
    errors.push('PermissionSubjectReceipt.credentialExtrusionAllowed must be false.');
  }
  validateTimestamp('PermissionSubjectReceipt.createdAt', receipt.createdAt, errors);
  validateHash('PermissionSubjectReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validatePermissionRequestReceipt(
  receipt: PermissionRequestReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PermissionRequestReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `PermissionRequestReceipt.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('PermissionRequestReceipt.id is required.');
  if (!isNonEmptyString(receipt.subjectReceiptId)) {
    errors.push('PermissionRequestReceipt.subjectReceiptId is required.');
  }
  if (!Array.isArray(receipt.requestedScopes) || receipt.requestedScopes.length === 0) {
    errors.push('PermissionRequestReceipt.requestedScopes must include at least one scope.');
  }
  if (!Array.isArray(receipt.minimumRequiredScopes) || receipt.minimumRequiredScopes.length === 0) {
    errors.push('PermissionRequestReceipt.minimumRequiredScopes must include at least one scope.');
  }
  const neverScopes = Array.isArray(receipt.neverScopes) ? receipt.neverScopes : [];
  for (const [index, scope] of (receipt.requestedScopes ?? []).entries()) {
    validateScopeGrant(
      `PermissionRequestReceipt.requestedScopes[${index}]`,
      scope,
      neverScopes,
      errors
    );
  }
  for (const [index, scope] of (receipt.minimumRequiredScopes ?? []).entries()) {
    validateScopeGrant(
      `PermissionRequestReceipt.minimumRequiredScopes[${index}]`,
      scope,
      neverScopes,
      errors
    );
  }
  const requestDiff = buildPermissionScopeDiff({
    requestedScopes: receipt.requestedScopes ?? [],
    minimumRequiredScopes: receipt.minimumRequiredScopes ?? [],
    neverScopes,
  });
  for (const neverScope of requestDiff.invalidNeverScopes) {
    errors.push(
      `PermissionRequestReceipt.neverScopes contains an invalid scope name: ${neverScope}.`
    );
  }
  for (const requiredScope of requestDiff.missingRequestedRequiredScopes) {
    errors.push(
      `PermissionRequestReceipt.requestedScopes is missing required scope: ${requiredScope}.`
    );
  }
  if (!isNonEmptyString(receipt.purpose))
    errors.push('PermissionRequestReceipt.purpose is required.');
  if (!isSupportedPermissionGateEnvelope(String(receipt.permissionEnvelope))) {
    errors.push(
      `PermissionRequestReceipt.permissionEnvelope is unsupported: ${String(receipt.permissionEnvelope)}.`
    );
  }
  if (receipt.permissionEnvelope !== 'read_only' && receipt.requiresFreshUserGesture !== true) {
    errors.push(
      'PermissionRequestReceipt.requiresFreshUserGesture must be true for permission grants.'
    );
  }
  if (!isNonEmptyString(receipt.approvalId))
    errors.push('PermissionRequestReceipt.approvalId is required.');
  if (receipt.commandPreviewContainsAbsolutePaths !== false) {
    errors.push('PermissionRequestReceipt.commandPreviewContainsAbsolutePaths must be false.');
  }
  if (permissionPreviewHasPublicLeak(receipt.commandOrUrlPreview)) {
    errors.push(
      'PermissionRequestReceipt.commandOrUrlPreview must be redacted before public receipts.'
    );
  }
  validateTimestamp('PermissionRequestReceipt.requestedAt', receipt.requestedAt, errors);
  if (receipt.expiresAt)
    validateTimestamp('PermissionRequestReceipt.expiresAt', receipt.expiresAt, errors);
  validateHash('PermissionRequestReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validatePermissionGrantReceipt(
  receipt: PermissionGrantReceipt | undefined,
  request?: PermissionRequestReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PermissionGrantReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `PermissionGrantReceipt.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('PermissionGrantReceipt.id is required.');
  if (!isNonEmptyString(receipt.requestReceiptId))
    errors.push('PermissionGrantReceipt.requestReceiptId is required.');
  const neverScopes = request?.neverScopes ?? [];
  for (const [index, scope] of (receipt.grantedScopes ?? []).entries()) {
    validateScopeGrant(
      `PermissionGrantReceipt.grantedScopes[${index}]`,
      scope,
      neverScopes,
      errors
    );
  }
  if (request) {
    const missing = findMissingRequired(request, receipt.grantedScopes);
    const extras = findExtraScopes(receipt.grantedScopes, request.minimumRequiredScopes);
    if (missing.length > 0) {
      errors.push(
        `PermissionGrantReceipt.grantedScopes is missing required scopes: ${missing.join(', ')}.`
      );
    }
    if (extras.length > 0) {
      errors.push(
        `PermissionGrantReceipt.grantedScopes includes scopes outside the minimum set: ${extras.join(', ')}.`
      );
    }
  }
  if ((receipt.missingRequiredScopes ?? []).length > 0) {
    errors.push(
      'PermissionGrantReceipt.missingRequiredScopes must be empty before a grant can be accepted.'
    );
  }
  if ((receipt.extraScopes ?? []).length > 0) {
    errors.push('PermissionGrantReceipt.extraScopes must be empty before a grant can be accepted.');
  }
  validateTimestamp('PermissionGrantReceipt.grantObservedAt', receipt.grantObservedAt, errors);
  if (receipt.freshUserGesture !== true) {
    errors.push('PermissionGrantReceipt.freshUserGesture must be true.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('PermissionGrantReceipt.hiddenAutomationUsed must be false.');
  }
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('PermissionGrantReceipt.rawCredentialCaptured must be false.');
  }
  if (!isNonEmptyString(receipt.revocationInstruction)) {
    errors.push('PermissionGrantReceipt.revocationInstruction is required.');
  }
  if (receipt.expiresAt)
    validateTimestamp('PermissionGrantReceipt.expiresAt', receipt.expiresAt, errors);
  validateHash('PermissionGrantReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validatePermissionVerificationReceipt(
  receipt: PermissionVerificationReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PermissionVerificationReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `PermissionVerificationReceipt.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('PermissionVerificationReceipt.id is required.');
  if (!isNonEmptyString(receipt.grantReceiptId)) {
    errors.push('PermissionVerificationReceipt.grantReceiptId is required.');
  }
  if (!isSupportedPermissionVerificationMethod(String(receipt.verificationMethod))) {
    errors.push(
      `PermissionVerificationReceipt.verificationMethod is unsupported: ${String(receipt.verificationMethod)}.`
    );
  }
  validateTimestamp('PermissionVerificationReceipt.verifiedAt', receipt.verifiedAt, errors);
  if (typeof receipt.minimumScopeSatisfied !== 'boolean') {
    errors.push('PermissionVerificationReceipt.minimumScopeSatisfied must be a boolean.');
  }
  if (typeof receipt.excessScopesAbsent !== 'boolean') {
    errors.push('PermissionVerificationReceipt.excessScopesAbsent must be a boolean.');
  }
  if (receipt.readyForHoloLand && !receipt.minimumScopeSatisfied) {
    errors.push('PermissionVerificationReceipt.readyForHoloLand requires minimumScopeSatisfied.');
  }
  if (receipt.readyForHoloLand && !receipt.excessScopesAbsent) {
    errors.push('PermissionVerificationReceipt.readyForHoloLand requires excessScopesAbsent.');
  }
  if (receipt.credentialExtrusionAllowed !== false) {
    errors.push('PermissionVerificationReceipt.credentialExtrusionAllowed must be false.');
  }
  if (receipt.publicReceiptMayContainAbsolutePath !== false) {
    errors.push('PermissionVerificationReceipt.publicReceiptMayContainAbsolutePath must be false.');
  }
  if (!isNonEmptyString(receipt.scopeDiffHash)) {
    errors.push('PermissionVerificationReceipt.scopeDiffHash is required.');
  }
  validateHash('PermissionVerificationReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validatePermissionRevocationReceipt(
  receipt: PermissionRevocationReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PermissionRevocationReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `PermissionRevocationReceipt.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (!isNonEmptyString(receipt.id)) errors.push('PermissionRevocationReceipt.id is required.');
  if (!isNonEmptyString(receipt.grantReceiptId)) {
    errors.push('PermissionRevocationReceipt.grantReceiptId is required.');
  }
  if (receipt.revokedAt)
    validateTimestamp('PermissionRevocationReceipt.revokedAt', receipt.revokedAt, errors);
  if (typeof receipt.revokeVerified !== 'boolean') {
    errors.push('PermissionRevocationReceipt.revokeVerified must be a boolean.');
  }
  if (!isNonEmptyString(receipt.revocationMethod)) {
    errors.push('PermissionRevocationReceipt.revocationMethod is required.');
  }
  if (receipt.requiresFreshUserGesture !== true) {
    errors.push('PermissionRevocationReceipt.requiresFreshUserGesture must be true.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('PermissionRevocationReceipt.hiddenAutomationUsed must be false.');
  }
  if (!isNonEmptyString(receipt.rollbackNote)) {
    errors.push('PermissionRevocationReceipt.rollbackNote is required.');
  }
  validateHash('PermissionRevocationReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validatePermissionReplayReceipt(
  receipt: PermissionReplayReceipt | undefined
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['PermissionReplayReceipt is required.'];
  if (receipt.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `PermissionReplayReceipt.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (receipt.workflow !== PERMISSION_GATE_WORKFLOW) {
    errors.push(`PermissionReplayReceipt.workflow must be ${PERMISSION_GATE_WORKFLOW}.`);
  }
  if (!isSupportedPermissionGateStatus(String(receipt.status))) {
    errors.push(`PermissionReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!isNonEmptyString(receipt.subjectReceiptId))
    errors.push('PermissionReplayReceipt.subjectReceiptId is required.');
  if (!isNonEmptyString(receipt.requestReceiptId))
    errors.push('PermissionReplayReceipt.requestReceiptId is required.');
  if (!isNonEmptyString(receipt.replayKey))
    errors.push('PermissionReplayReceipt.replayKey is required.');
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('PermissionReplayReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.overbroadScopeAccepted !== false) {
    errors.push('PermissionReplayReceipt.overbroadScopeAccepted must be false.');
  }
  if (receipt.readyForHoloLand && receipt.status !== 'verified') {
    errors.push('PermissionReplayReceipt.readyForHoloLand requires verified status.');
  }
  if (receipt.readyForHoloLand && !isNonEmptyString(receipt.verificationReceiptId)) {
    errors.push('PermissionReplayReceipt.readyForHoloLand requires verificationReceiptId.');
  }
  validateTimestamp('PermissionReplayReceipt.createdAt', receipt.createdAt, errors);
  validateHash('PermissionReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellPermissionGateReceiptPack(
  pack: HoloShellPermissionGateReceiptPack | undefined
): string[] {
  const errors: string[] = [];
  if (!pack) return ['HoloShellPermissionGateReceiptPack is required.'];
  if (pack.schemaVersion !== HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION) {
    errors.push(
      `HoloShellPermissionGateReceiptPack.schemaVersion must be ${HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION}.`
    );
  }
  if (pack.workflow !== PERMISSION_GATE_WORKFLOW) {
    errors.push(`HoloShellPermissionGateReceiptPack.workflow must be ${PERMISSION_GATE_WORKFLOW}.`);
  }
  if (!isSupportedPermissionGateStatus(String(pack.status))) {
    errors.push(
      `HoloShellPermissionGateReceiptPack.status is unsupported: ${String(pack.status)}.`
    );
  }
  validateHash('HoloShellPermissionGateReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  errors.push(...validatePermissionSubjectReceipt(pack.subject));
  errors.push(...validatePermissionRequestReceipt(pack.request));
  if (pack.grant) errors.push(...validatePermissionGrantReceipt(pack.grant, pack.request));
  if (pack.verification) errors.push(...validatePermissionVerificationReceipt(pack.verification));
  if (pack.revocation) errors.push(...validatePermissionRevocationReceipt(pack.revocation));
  errors.push(...validatePermissionReplayReceipt(pack.replay));

  if (
    (pack.status === 'granted' || pack.status === 'verified' || pack.status === 'revoked') &&
    !pack.grant
  ) {
    errors.push('HoloShellPermissionGateReceiptPack.grant is required after granted status.');
  }
  if ((pack.status === 'verified' || pack.replay.readyForHoloLand) && !pack.verification) {
    errors.push(
      'HoloShellPermissionGateReceiptPack.verification is required before readyForHoloLand.'
    );
  }
  if (pack.status === 'revoked' && !pack.revocation) {
    errors.push('HoloShellPermissionGateReceiptPack.revocation is required for revoked status.');
  }
  if (pack.status !== pack.replay.status) {
    errors.push('HoloShellPermissionGateReceiptPack.status must match replay.status.');
  }
  return errors;
}

function cloneScopeGrant(scope: PermissionScopeGrant): PermissionScopeGrant {
  return { ...scope };
}

export function cloneHoloShellPermissionGateReceiptPack(
  pack: HoloShellPermissionGateReceiptPack
): HoloShellPermissionGateReceiptPack {
  return {
    ...pack,
    subject: { ...pack.subject },
    request: {
      ...pack.request,
      requestedScopes: pack.request.requestedScopes.map(cloneScopeGrant),
      minimumRequiredScopes: pack.request.minimumRequiredScopes.map(cloneScopeGrant),
      neverScopes: [...pack.request.neverScopes],
    },
    ...(pack.grant
      ? {
          grant: {
            ...pack.grant,
            grantedScopes: pack.grant.grantedScopes.map(cloneScopeGrant),
            deniedScopes: [...pack.grant.deniedScopes],
            missingRequiredScopes: [...pack.grant.missingRequiredScopes],
            extraScopes: [...pack.grant.extraScopes],
          },
        }
      : {}),
    ...(pack.verification
      ? {
          verification: {
            ...pack.verification,
            verifiedScopes: pack.verification.verifiedScopes.map(cloneScopeGrant),
          },
        }
      : {}),
    ...(pack.revocation ? { revocation: { ...pack.revocation } } : {}),
    replay: { ...pack.replay },
  };
}
