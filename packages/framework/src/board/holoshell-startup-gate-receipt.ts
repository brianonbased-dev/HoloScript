/**
 * HoloShell Startup Gate Receipt
 *
 * Visible, replayable substrate contract for OS startup registration
 * (login-item, autostart, startup-shortcut). HoloLand renders the room card;
 * HoloScript validates that registration state, approval, rollback, and
 * replay receipts are present and safe.
 *
 * The Startup Gate makes per-user OS startup registration visible and
 * revocable without terminal knowledge. The user can see:
 * - Current registration state (registered/unregistered/failed)
 * - The exact approval command that would run on startup
 * - A rollback/unregister path
 * - A refreshed startup-integration receipt
 *
 * task_1779358599518_bobn
 */

import type { ArtifactHashAlgorithm } from './board-types';

// ── Version ──

export const HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION =
  'hololand.holoshell.startup-gate.v0.1.0';

// ── Workflow ──

export const STARTUP_GATE_WORKFLOW = 'os-startup-registration-gate' as const;

// ── Constants ──

export const STARTUP_PLATFORMS = [
  'windows_startup_folder',
  'macos_login_item',
  'linux_xdg_autostart',
  'windows_task_scheduler',
  'macos_launchd',
  'linux_systemd_user',
] as const;
export type StartupPlatform = (typeof STARTUP_PLATFORMS)[number];

export const STARTUP_GATE_STATUSES = [
  'unregistered',
  'registration_planned',
  'registration_requested',
  'registration_approved',
  'registered',
  'registration_failed',
  'unregistration_planned',
  'unregistration_requested',
  'unregistered_confirmed',
  'unregistration_failed',
  'blocked',
] as const;
export type StartupGateStatus = (typeof STARTUP_GATE_STATUSES)[number];

export const STARTUP_GATE_PERMISSION_ENVELOPES = [
  'read_only',
  'guarded_registration',
  'break_glass_register',
  'revoke_only',
] as const;
export type StartupGatePermissionEnvelope =
  (typeof STARTUP_GATE_PERMISSION_ENVELOPES)[number];

export const STARTUP_VERIFICATION_METHODS = [
  'startup_folder_exists',
  'registry_key_exists',
  'plist_entry_exists',
  'desktop_file_exists',
  'task_scheduler_exists',
  'launchd_plist_exists',
  'systemd_unit_exists',
  'manual_redacted_witness',
] as const;
export type StartupVerificationMethod =
  (typeof STARTUP_VERIFICATION_METHODS)[number];

// ── Sub-receipts ──

/** Current registration state probed from the OS. */
export interface StartupRegistrationState {
  /** Platform-specific registration mechanism used. */
  platform: StartupPlatform | string;
  /** Whether the startup entry currently exists on the OS. */
  registered: boolean;
  /** Hash of the registered command/shortcut target (never raw path). */
  commandHash: string;
  /** Redacted preview of what runs on startup — absolute paths stripped. */
  commandPreview: string;
  /** Whether the actual on-disk shortcut matches the expected target. */
  targetMatchesExpected: boolean;
  /** Whether the registered shortcut was placed by HoloShell (provenance check). */
  placedByHoloShell: boolean;
  /** When the registration was last observed, ISO-8601. */
  observedAt: string;
  /** Hash of the observation for replay. */
  stateHash: string;
}

/** Receipt for requesting startup registration approval. */
export interface StartupRegistrationRequestReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION;
  /** Which platform mechanism to register with. */
  platform: StartupPlatform | string;
  /** Human-readable purpose of the registration. */
  purpose: string;
  /** Redacted command preview — absolute paths stripped. */
  commandPreview: string;
  /** commandPreviewContainsAbsolutePath must always be false. */
  commandPreviewContainsAbsolutePath: false;
  /** What the startup entry will do (redacted). */
  startupAction: 'launch_holoshell' | 'launch_daemon' | 'launch_agent' | string;
  /** Whether user must explicitly approve (always true for guarded). */
  requiresFreshUserGesture: boolean;
  /** Permission envelope controlling the registration flow. */
  permissionEnvelope: StartupGatePermissionEnvelope | string;
  /** Rollback instruction shown to the user. */
  rollbackInstruction: string;
  requestedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

/** Receipt for the user's approval of the startup registration. */
export interface StartupRegistrationApprovalReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION;
  requestReceiptId: string;
  /** The user explicitly approved this registration. */
  freshUserGestureCaptured: boolean;
  /** No hidden automation was used to approve. */
  hiddenAutomationUsed: false;
  /** The approval was given via the HoloShell room card, not CLI. */
  approvalViaRoomCard: boolean;
  /** Hash of the command that was approved (never raw path). */
  approvedCommandHash: string;
  approvedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

/** Receipt for verified startup registration on the OS. */
export interface StartupRegistrationVerificationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION;
  approvalReceiptId: string;
  /** Method used to verify the registration exists. */
  verificationMethod: StartupVerificationMethod | string;
  /** Registration was confirmed present and correct. */
  registrationConfirmed: boolean;
  /** The shortcut target matches what was approved. */
  targetMatchesApproved: boolean;
  /** The entry is owned by the current user (not system/admin). */
  currentUserOwned: boolean;
  /** The entry is not a system-level override. */
  systemLevelOverride: false;
  verifiedAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

/** Receipt for unregistering / rolling back the startup entry. */
export interface StartupUnregistrationReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION;
  /** Which registration this unregistration targets. */
  verificationReceiptId: string;
  /** The OS-level removal was confirmed. */
  removalConfirmed: boolean;
  /** Method used to confirm removal. */
  removalVerificationMethod: StartupVerificationMethod | string;
  /** Whether residual startup artifacts remain after removal. */
  residualArtifacts: boolean;
  /** Rollback note shown to the user about residual access. */
  rollbackNote: string;
  unregisteredAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

/** Replay receipt linking the full workflow chain. */
export interface StartupReplayReceipt {
  id: string;
  schemaVersion: typeof HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION;
  workflow: typeof STARTUP_GATE_WORKFLOW;
  status: StartupGateStatus | string;
  registrationStateReceiptId?: string;
  requestReceiptId?: string;
  approvalReceiptId?: string;
  verificationReceiptId?: string;
  unregistrationReceiptId?: string;
  replayKey: string;
  rawCredentialCaptured: false;
  overbroadScopeAccepted: false;
  readyForHoloLand: boolean;
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

/** Full pack tying all sub-receipts together. */
export interface HoloShellStartupGateReceiptPack {
  schemaVersion: typeof HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION;
  id: string;
  workflow: typeof STARTUP_GATE_WORKFLOW;
  status: StartupGateStatus | string;
  generatedAt: string;
  platform: StartupPlatform | string;
  permissionEnvelope: StartupGatePermissionEnvelope | string;
  registrationState?: StartupRegistrationState;
  request?: StartupRegistrationRequestReceipt;
  approval?: StartupRegistrationApprovalReceipt;
  verification?: StartupRegistrationVerificationReceipt;
  unregistration?: StartupUnregistrationReceipt;
  replay: StartupReplayReceipt;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  verificationCommands?: (string | { command: string })[];
  provenance?: string[];
}

// ── Validators ──

const VALID_STATUSES = new Set<string>(STARTUP_GATE_STATUSES);
const VALID_PLATFORMS = new Set<string>(STARTUP_PLATFORMS);
const VALID_ENVELOPES = new Set<string>(STARTUP_GATE_PERMISSION_ENVELOPES);
const VALID_VERIFICATION_METHODS = new Set<string>(STARTUP_VERIFICATION_METHODS);

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

export function isSupportedStartupPlatform(value: string): value is StartupPlatform {
  return VALID_PLATFORMS.has(value);
}

export function isSupportedStartupGateStatus(value: string): value is StartupGateStatus {
  return VALID_STATUSES.has(value);
}

export function isSupportedStartupGatePermissionEnvelope(
  value: string
): value is StartupGatePermissionEnvelope {
  return VALID_ENVELOPES.has(value);
}

export function isSupportedStartupVerificationMethod(
  value: string
): value is StartupVerificationMethod {
  return VALID_VERIFICATION_METHODS.has(value);
}

function redactAbsolutePath(value: string): string {
  return value.replace(
    /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/g,
    (_match, prefix) => `${prefix}<absolute-path-redacted>`
  );
}

export function validateStartupRegistrationState(
  state: StartupRegistrationState | undefined,
  errors: string[]
): void {
  if (!state) {
    errors.push('StartupRegistrationState is required for registered packs.');
    return;
  }
  if (!isNonEmptyString(state.platform)) errors.push('StartupRegistrationState.platform is required.');
  if (typeof state.registered !== 'boolean') errors.push('StartupRegistrationState.registered must be a boolean.');
  if (!isNonEmptyString(state.commandHash)) errors.push('StartupRegistrationState.commandHash is required.');
  if (hasAbsolutePath(state.commandPreview)) {
    errors.push('StartupRegistrationState.commandPreview must not contain absolute paths.');
  }
  if (typeof state.targetMatchesExpected !== 'boolean') {
    errors.push('StartupRegistrationState.targetMatchesExpected must be a boolean.');
  }
  if (typeof state.placedByHoloShell !== 'boolean') {
    errors.push('StartupRegistrationState.placedByHoloShell must be a boolean.');
  }
  if (!isIsoTimestamp(state.observedAt)) errors.push('StartupRegistrationState.observedAt must be a valid ISO timestamp.');
  if (!isNonEmptyString(state.stateHash)) errors.push('StartupRegistrationState.stateHash is required.');
}

export function validateStartupRegistrationRequestReceipt(
  receipt: StartupRegistrationRequestReceipt | undefined,
  errors: string[]
): void {
  if (!receipt) {
    errors.push('StartupRegistrationRequestReceipt is required when status >= registration_requested.');
    return;
  }
  if (receipt.schemaVersion !== HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION) {
    errors.push(`StartupRegistrationRequestReceipt.schemaVersion must be ${HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION}`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('StartupRegistrationRequestReceipt.id is required.');
  if (!isNonEmptyString(receipt.platform)) errors.push('StartupRegistrationRequestReceipt.platform is required.');
  if (!isNonEmptyString(receipt.purpose)) errors.push('StartupRegistrationRequestReceipt.purpose is required.');
  if (hasAbsolutePath(receipt.commandPreview)) {
    errors.push('StartupRegistrationRequestReceipt.commandPreview must not contain absolute paths.');
  }
  if (receipt.commandPreviewContainsAbsolutePath !== false) {
    errors.push('StartupRegistrationRequestReceipt.commandPreviewContainsAbsolutePath must be false.');
  }
  if (typeof receipt.requiresFreshUserGesture !== 'boolean') {
    errors.push('StartupRegistrationRequestReceipt.requiresFreshUserGesture must be a boolean.');
  }
  if (!isNonEmptyString(receipt.permissionEnvelope)) {
    errors.push('StartupRegistrationRequestReceipt.permissionEnvelope is required.');
  }
  if (!isNonEmptyString(receipt.rollbackInstruction)) {
    errors.push('StartupRegistrationRequestReceipt.rollbackInstruction is required.');
  }
  if (!isIsoTimestamp(receipt.requestedAt)) {
    errors.push('StartupRegistrationRequestReceipt.requestedAt must be a valid ISO timestamp.');
  }
  if (!isNonEmptyString(receipt.hash)) errors.push('StartupRegistrationRequestReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') errors.push('StartupRegistrationRequestReceipt.hashAlgorithm must be sha256.');
}

export function validateStartupRegistrationApprovalReceipt(
  receipt: StartupRegistrationApprovalReceipt | undefined,
  errors: string[]
): void {
  if (!receipt) {
    errors.push('StartupRegistrationApprovalReceipt is required when status >= registration_approved.');
    return;
  }
  if (receipt.schemaVersion !== HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION) {
    errors.push(`StartupRegistrationApprovalReceipt.schemaVersion must be ${HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION}`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('StartupRegistrationApprovalReceipt.id is required.');
  if (!isNonEmptyString(receipt.requestReceiptId)) {
    errors.push('StartupRegistrationApprovalReceipt.requestReceiptId is required.');
  }
  if (receipt.freshUserGestureCaptured !== true) {
    errors.push('StartupRegistrationApprovalReceipt.freshUserGestureCaptured must be true.');
  }
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('StartupRegistrationApprovalReceipt.hiddenAutomationUsed must be false.');
  }
  if (typeof receipt.approvalViaRoomCard !== 'boolean') {
    errors.push('StartupRegistrationApprovalReceipt.approvalViaRoomCard must be a boolean.');
  }
  if (!isNonEmptyString(receipt.approvedCommandHash)) {
    errors.push('StartupRegistrationApprovalReceipt.approvedCommandHash is required.');
  }
  if (!isIsoTimestamp(receipt.approvedAt)) {
    errors.push('StartupRegistrationApprovalReceipt.approvedAt must be a valid ISO timestamp.');
  }
  if (!isNonEmptyString(receipt.hash)) errors.push('StartupRegistrationApprovalReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') errors.push('StartupRegistrationApprovalReceipt.hashAlgorithm must be sha256.');
}

export function validateStartupRegistrationVerificationReceipt(
  receipt: StartupRegistrationVerificationReceipt | undefined,
  errors: string[]
): void {
  if (!receipt) {
    errors.push('StartupRegistrationVerificationReceipt is required when status >= registered.');
    return;
  }
  if (receipt.schemaVersion !== HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION) {
    errors.push(`StartupRegistrationVerificationReceipt.schemaVersion must be ${HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION}`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('StartupRegistrationVerificationReceipt.id is required.');
  if (!isNonEmptyString(receipt.approvalReceiptId)) {
    errors.push('StartupRegistrationVerificationReceipt.approvalReceiptId is required.');
  }
  if (!isNonEmptyString(receipt.verificationMethod)) {
    errors.push('StartupRegistrationVerificationReceipt.verificationMethod is required.');
  }
  if (typeof receipt.registrationConfirmed !== 'boolean') {
    errors.push('StartupRegistrationVerificationReceipt.registrationConfirmed must be a boolean.');
  }
  if (typeof receipt.targetMatchesApproved !== 'boolean') {
    errors.push('StartupRegistrationVerificationReceipt.targetMatchesApproved must be a boolean.');
  }
  if (typeof receipt.currentUserOwned !== 'boolean') {
    errors.push('StartupRegistrationVerificationReceipt.currentUserOwned must be a boolean.');
  }
  if (receipt.systemLevelOverride !== false) {
    errors.push('StartupRegistrationVerificationReceipt.systemLevelOverride must be false.');
  }
  if (!isIsoTimestamp(receipt.verifiedAt)) {
    errors.push('StartupRegistrationVerificationReceipt.verifiedAt must be a valid ISO timestamp.');
  }
  if (!isNonEmptyString(receipt.hash)) errors.push('StartupRegistrationVerificationReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') errors.push('StartupRegistrationVerificationReceipt.hashAlgorithm must be sha256.');
}

export function validateStartupUnregistrationReceipt(
  receipt: StartupUnregistrationReceipt | undefined,
  errors: string[]
): void {
  if (!receipt) {
    errors.push('StartupUnregistrationReceipt is required when status includes unregistration.');
    return;
  }
  if (receipt.schemaVersion !== HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION) {
    errors.push(`StartupUnregistrationReceipt.schemaVersion must be ${HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION}`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('StartupUnregistrationReceipt.id is required.');
  if (!isNonEmptyString(receipt.verificationReceiptId)) {
    errors.push('StartupUnregistrationReceipt.verificationReceiptId is required.');
  }
  if (typeof receipt.removalConfirmed !== 'boolean') {
    errors.push('StartupUnregistrationReceipt.removalConfirmed must be a boolean.');
  }
  if (!isNonEmptyString(receipt.removalVerificationMethod)) {
    errors.push('StartupUnregistrationReceipt.removalVerificationMethod is required.');
  }
  if (typeof receipt.residualArtifacts !== 'boolean') {
    errors.push('StartupUnregistrationReceipt.residualArtifacts must be a boolean.');
  }
  if (!isNonEmptyString(receipt.rollbackNote)) {
    errors.push('StartupUnregistrationReceipt.rollbackNote is required.');
  }
  if (!isIsoTimestamp(receipt.unregisteredAt)) {
    errors.push('StartupUnregistrationReceipt.unregisteredAt must be a valid ISO timestamp.');
  }
  if (!isNonEmptyString(receipt.hash)) errors.push('StartupUnregistrationReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') errors.push('StartupUnregistrationReceipt.hashAlgorithm must be sha256.');
}

export function validateStartupReplayReceipt(
  receipt: StartupReplayReceipt | undefined,
  errors: string[]
): void {
  if (!receipt) {
    errors.push('StartupReplayReceipt is required.');
    return;
  }
  if (receipt.schemaVersion !== HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION) {
    errors.push(`StartupReplayReceipt.schemaVersion must be ${HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION}`);
  }
  if (receipt.workflow !== STARTUP_GATE_WORKFLOW) {
    errors.push(`StartupReplayReceipt.workflow must be ${STARTUP_GATE_WORKFLOW}`);
  }
  if (!isNonEmptyString(receipt.id)) errors.push('StartupReplayReceipt.id is required.');
  if (!isNonEmptyString(receipt.status)) errors.push('StartupReplayReceipt.status is required.');
  if (!isNonEmptyString(receipt.replayKey)) errors.push('StartupReplayReceipt.replayKey is required.');
  if (receipt.rawCredentialCaptured !== false) {
    errors.push('StartupReplayReceipt.rawCredentialCaptured must be false.');
  }
  if (receipt.overbroadScopeAccepted !== false) {
    errors.push('StartupReplayReceipt.overbroadScopeAccepted must be false.');
  }
  if (typeof receipt.readyForHoloLand !== 'boolean') {
    errors.push('StartupReplayReceipt.readyForHoloLand must be a boolean.');
  }
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('StartupReplayReceipt.createdAt must be a valid ISO timestamp.');
  }
  if (!isNonEmptyString(receipt.hash)) errors.push('StartupReplayReceipt.hash is required.');
  if (receipt.hashAlgorithm !== 'sha256') errors.push('StartupReplayReceipt.hashAlgorithm must be sha256.');
}

export function validateHoloShellStartupGateReceiptPack(
  pack: HoloShellStartupGateReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack || typeof pack !== 'object') {
    errors.push('HoloShellStartupGateReceiptPack is required.');
    return errors;
  }
  if (pack.schemaVersion !== HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION) {
    errors.push(`schemaVersion must be ${HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION}`);
  }
  if (pack.workflow !== STARTUP_GATE_WORKFLOW) {
    errors.push(`workflow must be ${STARTUP_GATE_WORKFLOW}`);
  }
  if (!isNonEmptyString(pack.id)) errors.push('id is required.');
  if (!isNonEmptyString(pack.platform)) errors.push('platform is required.');
  if (!isNonEmptyString(pack.permissionEnvelope)) errors.push('permissionEnvelope is required.');
  if (!isIsoTimestamp(pack.generatedAt)) errors.push('generatedAt must be a valid ISO timestamp.');
  if (pack.hashAlgorithm !== 'sha256') errors.push('hashAlgorithm must be sha256.');
  if (!isNonEmptyString(pack.hash)) errors.push('hash is required.');

  // Status-dependent sub-receipt validation
  const status = pack.status;
  if (status === 'unregistered' || status === 'registration_planned') {
    // registrationState is optional but nice to have
  }
  if (status === 'registration_requested' || status === 'registration_approved') {
    validateStartupRegistrationRequestReceipt(pack.request, errors);
  }
  if (status === 'registration_approved') {
    validateStartupRegistrationApprovalReceipt(pack.approval, errors);
  }
  if (status === 'registered' || status === 'unregistration_planned' || status === 'unregistration_requested') {
    validateStartupRegistrationState(pack.registrationState, errors);
    validateStartupRegistrationVerificationReceipt(pack.verification, errors);
  }
  if (status === 'unregistered_confirmed' || status === 'unregistration_failed') {
    validateStartupUnregistrationReceipt(pack.unregistration, errors);
  }
  if (status === 'blocked') {
    // Block requires a request to explain what was blocked
    validateStartupRegistrationRequestReceipt(pack.request, errors);
  }
  if (status === 'registration_failed') {
    validateStartupRegistrationRequestReceipt(pack.request, errors);
  }

  // Replay always required
  validateStartupReplayReceipt(pack.replay, errors);

  // Cross-check: pack status must match replay status
  if (pack.replay && pack.replay.status !== pack.status) {
    errors.push('pack status must match replay status.');
  }

  // Absolute path leakage check
  const packJson = JSON.stringify(pack);
  if (hasAbsolutePath(packJson)) {
    // Only flag if it's NOT inside a redacted marker
    const absolutePathLeakPattern = /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/;
    const redactedPattern = /<absolute-path-redacted>/;
    const leakMatches = packJson.match(absolutePathLeakPattern);
    if (leakMatches && !redactedPattern.test(packJson)) {
      errors.push('Receipt pack contains absolute path leakage.');
    }
  }

  // Credential leakage check
  if (/\b(access_token|refresh_token|client_secret|id_token)=([A-Za-z0-9._~+/=-]+)/i.test(packJson)) {
    errors.push('Receipt pack contains raw credential material.');
  }

  return errors;
}

// ── Clone helpers ──

export function cloneStartupRegistrationState(
  state: StartupRegistrationState
): StartupRegistrationState {
  return { ...state };
}

export function cloneStartupRegistrationRequestReceipt(
  receipt: StartupRegistrationRequestReceipt
): StartupRegistrationRequestReceipt {
  return { ...receipt };
}

export function cloneStartupRegistrationApprovalReceipt(
  receipt: StartupRegistrationApprovalReceipt
): StartupRegistrationApprovalReceipt {
  return { ...receipt };
}

export function cloneStartupRegistrationVerificationReceipt(
  receipt: StartupRegistrationVerificationReceipt
): StartupRegistrationVerificationReceipt {
  return { ...receipt };
}

export function cloneStartupUnregistrationReceipt(
  receipt: StartupUnregistrationReceipt
): StartupUnregistrationReceipt {
  return { ...receipt };
}

export function cloneStartupReplayReceipt(
  receipt: StartupReplayReceipt
): StartupReplayReceipt {
  return { ...receipt };
}

export function cloneHoloShellStartupGateReceiptPack(
  pack: HoloShellStartupGateReceiptPack
): HoloShellStartupGateReceiptPack {
  return {
    ...pack,
    registrationState: pack.registrationState
      ? cloneStartupRegistrationState(pack.registrationState)
      : undefined,
    request: pack.request
      ? cloneStartupRegistrationRequestReceipt(pack.request)
      : undefined,
    approval: pack.approval
      ? cloneStartupRegistrationApprovalReceipt(pack.approval)
      : undefined,
    verification: pack.verification
      ? cloneStartupRegistrationVerificationReceipt(pack.verification)
      : undefined,
    unregistration: pack.unregistration
      ? cloneStartupUnregistrationReceipt(pack.unregistration)
      : undefined,
    replay: cloneStartupReplayReceipt(pack.replay),
  };
}