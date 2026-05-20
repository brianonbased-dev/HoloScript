/**
 * HoloShell Device Safety Envelope Receipts
 *
 * Reusable substrate contracts for device operation through safety envelopes:
 * identity inventory, consent, action preview, safe range enforcement,
 * execution result, privacy redaction, rollback, and replay.
 *
 * Joins local device identity, consent scope, action preview, safe ranges,
 * execution result, privacy redaction, rollback note, and replay lesson
 * into deterministic receipt validators for the non-developer flow
 * "use this headset/device safely and show what changed."
 *
 * task_1779092805820_n2xw
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Device Categories ──

export const DEVICE_CATEGORIES = [
  'headset',
  'phone',
  'webcam',
  'gpu',
  'robot',
  'printer',
  'wallet',
  'sensor',
  'display',
  'audio',
  'input',
  'other',
] as const;
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

// ── Device Identity ──

export const DEVICE_IDENTITY_SOURCES = [
  'pnP_device_id',
  'bluetooth_mac',
  'usb_serial',
  'webgpu_adapter',
  'openxr_instance',
  'network_hostname',
  'custom',
] as const;
export type DeviceIdentitySource = (typeof DEVICE_IDENTITY_SOURCES)[number];

export interface DeviceIdentityEntry {
  /** Stable device identifier (redacted for receipts). */
  deviceId: string;
  /** Redacted label safe for public receipts. */
  redactedLabel: string;
  /** Hash of the full device identifier for verification. */
  deviceIdHash: string;
  /** How the device was identified. */
  identitySource: DeviceIdentitySource;
  /** Device category. */
  category: DeviceCategory;
  /** Manufacturer if known, redacted. */
  manufacturer?: string;
  /** Model if known, redacted. */
  model?: string;
  /** Driver version if known. */
  driverVersion?: string;
  /** Connection status at inventory time. */
  connectionStatus: 'connected' | 'disconnected' | 'pairing' | 'unknown';
  /** Whether this device was detected by hardware probe. */
  probedByHardwareAudit: boolean;
}

// ── Consent Scopes ──

export const DEVICE_CONSENT_SCOPES = [
  'allowDeviceRead',
  'allowDevicePair',
  'allowDeviceCommand',
  'allowHaptic',
  'allowXrSession',
  'allowSensorRead',
  'allowCamera',
  'allowMicrophone',
  'allowLocation',
  'allowNetwork',
] as const;
export type DeviceConsentScope = (typeof DEVICE_CONSENT_SCOPES)[number];

// ── Action Classes ──

export const DEVICE_ACTION_CLASSES = [
  'read',
  'pair',
  'command',
  'haptic',
  'xr_session',
  'sensor_read',
  'camera',
  'microphone',
  'calibration',
  'firmware_update',
  'factory_reset',
] as const;
export type DeviceActionClass = (typeof DEVICE_ACTION_CLASSES)[number];

export const DEVICE_ACTION_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type DeviceActionRiskLevel = (typeof DEVICE_ACTION_RISK_LEVELS)[number];

// ── Safe Range ──

export interface DeviceSafeRange {
  /** Parameter name this range governs. */
  parameter: string;
  /** Unit of measurement. */
  unit: string;
  /** Minimum safe value. */
  min: number;
  /** Maximum safe value. */
  max: number;
  /** Default value within the range. */
  defaultValue: number;
  /** Whether exceeding this range triggers an automatic stop. */
  autoStopOnViolation: boolean;
}

// ── Before/After Snapshot ──

export interface DeviceStateSnapshot {
  /** Snapshot label (e.g. "before_command", "after_command"). */
  label: string;
  /** ISO-8601 timestamp of when the snapshot was taken. */
  capturedAt: string;
  /** Hash of the state content for integrity verification. */
  stateHash: string;
  /** Selected state keys captured (redacted for privacy). */
  capturedKeys: string[];
  /** Whether this snapshot contains absolute local paths (must be false for public receipts). */
  containsAbsolutePaths: false;
}

// ── Privacy Redaction ──

export const PRIVACY_REDACTION_LEVELS = ['full', 'hash_only', 'label_only', 'none'] as const;
export type PrivacyRedactionLevel = (typeof PRIVACY_REDACTION_LEVELS)[number];

export interface PrivacyRedactionEntry {
  /** Field that was redacted. */
  field: string;
  /** Redaction level applied. */
  level: PrivacyRedactionLevel;
  /** Reason for redaction. */
  reason: string;
}

// ── DeviceInventoryReceipt ──

export const DEVICE_INVENTORY_RECEIPT_VERSION = 'holoscript-device-inventory-receipt/v1';

export interface DeviceInventoryReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DEVICE_INVENTORY_RECEIPT_VERSION;
  /** ISO-8601 timestamp of when the inventory was taken. */
  inventoriedAt: string;
  /** Agent or process that performed the inventory. */
  inventoriedBy: string;
  /** Devices discovered during inventory. */
  devices: DeviceIdentityEntry[];
  /** Total device count. */
  deviceCount: number;
  /** Categories found during inventory. */
  categoriesFound: DeviceCategory[];
  /** Whether the hardware probe completed successfully. */
  hardwareProbeCompleted: boolean;
  /** Warnings from the inventory process. */
  warnings: string[];
  /** Integrity hash of the full receipt. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the inventory. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── DeviceSafetyEnvelopeReceipt ──

export const DEVICE_SAFETY_ENVELOPE_RECEIPT_VERSION = 'holoscript-device-safety-envelope-receipt/v1';

export interface DeviceSafetyEnvelopeReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DEVICE_SAFETY_ENVELOPE_RECEIPT_VERSION;
  /** ISO-8601 timestamp of when the envelope was created. */
  createdAt: string;
  /** The device this envelope covers. */
  device: DeviceIdentityEntry;
  /** Consent scopes approved for this envelope. */
  consentScopes: DeviceConsentScope[];
  /** Action class this envelope authorizes. */
  actionClass: DeviceActionClass;
  /** Risk level assigned to this action. */
  riskLevel: DeviceActionRiskLevel;
  /** Safe ranges governing the action parameters. */
  safeRanges: DeviceSafeRange[];
  /** Preview of the command to be executed (redacted). */
  commandPreview: string;
  /** Hash of the full command for integrity (redacted version is in the receipt). */
  commandPreviewHash: string;
  /** Whether the command preview contains absolute local paths. */
  commandPreviewContainsAbsolutePaths: false;
  /** Privacy redactions applied. */
  privacyRedactions: PrivacyRedactionEntry[];
  /** Whether this action requires a fresh user gesture. */
  requiresFreshUserGesture: boolean;
  /** Whether this action mutates device state. */
  deviceMutationAllowed: boolean;
  /** Whether the action is reversible. */
  reversible: boolean;
  /** Rollback note explaining reversibility. */
  rollbackNote: string;
  /** Nonce binding this envelope to a specific approval. */
  nonce: string;
  /** Hash of the full envelope for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the envelope. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── ConsentReceipt ──

export const DEVICE_CONSENT_RECEIPT_VERSION = 'holoscript-device-consent-receipt/v1';

export interface ConsentReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DEVICE_CONSENT_RECEIPT_VERSION;
  /** The device the consent was granted for. */
  deviceId: string;
  /** Redacted device label. */
  deviceLabel: string;
  /** Scopes the user consented to. */
  consentedScopes: DeviceConsentScope[];
  /** Action class the consent covers. */
  actionClass: DeviceActionClass;
  /** Risk level acknowledged by the user. */
  riskLevelAcknowledged: DeviceActionRiskLevel;
  /** ISO-8601 timestamp of when consent was granted. */
  consentedAt: string;
  /** ISO-8601 timestamp of when consent expires, if applicable. */
  expiresAt?: string;
  /** Whether the consent was given via a fresh user gesture. */
  freshUserGesture: boolean;
  /** Nonce linking this consent to a specific envelope. */
  envelopeNonce: string;
  /** Whether any hidden automation was used in obtaining consent. */
  hiddenAutomationUsed: false;
  /** Whether the consent allows credential-adjacent operations. */
  credentialAdjacent: boolean;
  /** Whether credential extrusion is allowed. */
  credentialExtrusionAllowed: false;
  /** Hash of the full consent for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
}

// ── DeviceActionReceipt ──

export const DEVICE_ACTION_RECEIPT_VERSION = 'holoscript-device-action-receipt/v1';

export const DEVICE_ACTION_OUTCOMES = [
  'success',
  'partial_success',
  'safe_stop',
  'range_violation',
  'consent_expired',
  'device_error',
  'timeout',
  'blocked',
  'failed',
] as const;
export type DeviceActionOutcome = (typeof DEVICE_ACTION_OUTCOMES)[number];

export interface DeviceActionReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof DEVICE_ACTION_RECEIPT_VERSION;
  /** The envelope this action was authorized under. */
  envelopeReceiptId: string;
  /** The consent receipt authorizing this action. */
  consentReceiptId: string;
  /** The device the action was performed on. */
  device: DeviceIdentityEntry;
  /** Action class that was executed. */
  actionClass: DeviceActionClass;
  /** Outcome of the action. */
  outcome: DeviceActionOutcome;
  /** ISO-8601 timestamp of when the action started. */
  startedAt: string;
  /** ISO-8601 timestamp of when the action completed. */
  completedAt: string;
  /** Duration of the action in milliseconds. */
  durationMs: number;
  /** State before the action. */
  beforeState: DeviceStateSnapshot;
  /** State after the action. */
  afterState: DeviceStateSnapshot;
  /** Whether the action mutated device state. */
  deviceMutationPerformed: boolean;
  /** Whether any safe range was violated during execution. */
  safeRangeViolationOccurred: boolean;
  /** Which safe ranges were violated, if any. */
  safeRangeViolations: string[];
  /** Privacy redactions applied to this receipt. */
  privacyRedactions: PrivacyRedactionEntry[];
  /** Whether the action can be replayed. */
  replayable: boolean;
  /** Rollback instruction if the action is reversible. */
  rollbackNote: string;
  /** Warnings generated during execution. */
  warnings: string[];
  /** Hash of the full receipt for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands for reproducing the action. */
  verificationCommands?: ArtifactVerificationCommand[];
}

// ── ReplayLessonReceipt ──

export const REPLAY_LESSON_RECEIPT_VERSION = 'holoscript-replay-lesson-receipt/v1';

export const REPLAY_LESSON_KINDS = [
  'command_success',
  'command_failure',
  'safe_stop',
  'range_violation',
  'consent_expired',
  'timeout',
  'device_error',
  'blocked_action',
  'recovered_state',
] as const;
export type ReplayLessonKind = (typeof REPLAY_LESSON_KINDS)[number];

export interface ReplayLessonEntry {
  /** What the lesson teaches. */
  lesson: string;
  /** Category of the lesson. */
  kind: ReplayLessonKind;
  /** The action outcome that generated this lesson. */
  sourceOutcome: DeviceActionOutcome;
  /** Whether the lesson was automatically derived or manually created. */
  autoDerived: boolean;
  /** Whether this lesson should be shown to non-developers. */
  showToNonDevelopers: boolean;
  /** Key insight from this lesson. */
  insight: string;
  /** Recommended next action for the user. */
  recommendedAction: string;
}

export interface ReplayLessonReceipt {
  /** Unique receipt identifier. */
  id: string;
  /** Schema version identifier. */
  schemaVersion: typeof REPLAY_LESSON_RECEIPT_VERSION;
  /** The action receipt this lesson was derived from. */
  sourceActionReceiptId: string;
  /** The device the lesson relates to. */
  device: DeviceIdentityEntry;
  /** Lessons derived from the action outcome. */
  lessons: ReplayLessonEntry[];
  /** ISO-8601 timestamp of when the lesson was generated. */
  generatedAt: string;
  /** Whether the original action can be replayed. */
  replayable: boolean;
  /** Replay key for re-executing the action if replayable. */
  replayKey?: string;
  /** Whether the original action was a mutation. */
  originalMutationPerformed: boolean;
  /** Rollback note from the original action. */
  originalRollbackNote: string;
  /** Hash of the full lesson for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link if part of a larger workflow. */
  provenance?: ArtifactProvenanceLink;
}

// ── Device Safety Envelope Pack (composite) ──

export interface HoloShellDeviceSafetyReceiptPack {
  /** Unique pack identifier. */
  id: string;
  /** Device inventory at envelope creation time. */
  inventory: DeviceInventoryReceipt;
  /** The safety envelope governing the action. */
  envelope: DeviceSafetyEnvelopeReceipt;
  /** The consent authorizing the action. */
  consent: ConsentReceipt;
  /** The action result, if executed. */
  action?: DeviceActionReceipt;
  /** Replay lessons derived from the action, if any. */
  replay?: ReplayLessonReceipt;
  /** Overall workflow status. */
  status: 'planned' | 'consented' | 'executing' | 'completed' | 'failed' | 'blocked';
  /** Hash of the full pack for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
}

// ── Target Device Proof Pack (frontier composite, requires real target witness) ──

export interface TargetDeviceWitness {
  /** Real target frame, WebXR session timing, or headset capture hash (not local screenshot). */
  witnessHash?: string;
  /** Explicit blocker when real target capture was impossible (still a valid receipt). */
  blocker?: string;
  /** When the witness or blocker was produced. */
  witnessedAt: string;
  /** Source of the witness (webxr, quest_capture, adb_screencap, explicit_blocker, ...). */
  witnessSource: string;
}

export interface HoloShellTargetDeviceProofPack {
  /** Unique pack identifier. */
  id: string;
  /** The lower-level device safety pack (inventory + envelope + consent + action + replay). */
  safetyPack: HoloShellDeviceSafetyReceiptPack;
  /** The target-device-specific witness (the key differentiator from local-only readiness). */
  targetWitness: TargetDeviceWitness;
  /** Whether this pack is ready to unlock HoloLand world operations (requires real target witness, not blocker-only). */
  targetProofReadyForHoloLand: boolean;
  /** Overall status for the target-proof workflow. */
  status: 'local_ready' | 'device_identified' | 'witness_planned' | 'witness_captured' | 'approved' | 'executed' | 'target_proven' | 'blocked';
  /** Hash of the full target proof pack for integrity. */
  hash: string;
  /** Hash algorithm used. */
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance for the pack. */
  provenance?: ArtifactProvenanceLink;
}

// ── Validation Helpers ──

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function hasAbsolutePath(value: string | undefined): boolean {
  return (
    typeof value === 'string' &&
    /(^|[\s"'`=])(?:[A-Za-z]:[\\/]|\/(?!\/)[^\s"'`]+)/.test(value)
  );
}

function validateHashFields(
  label: string,
  hash: string | undefined,
  algorithm: ArtifactHashAlgorithm | undefined,
  errors: string[]
): void {
  if (!hash) errors.push(`${label}.hash is required.`);
  if (!algorithm) errors.push(`${label}.hashAlgorithm is required.`);
}

function validateDeviceIdentityEntry(
  device: DeviceIdentityEntry,
  label: string,
  errors: string[]
): void {
  if (!device.deviceId) errors.push(`${label}.deviceId is required.`);
  if (!device.redactedLabel) errors.push(`${label}.redactedLabel is required.`);
  if (!device.deviceIdHash) errors.push(`${label}.deviceIdHash is required.`);
  if (!isOneOf(DEVICE_IDENTITY_SOURCES, String(device.identitySource))) {
    errors.push(`${label}.identitySource is unsupported: ${String(device.identitySource)}.`);
  }
  if (!isOneOf(DEVICE_CATEGORIES, String(device.category))) {
    errors.push(`${label}.category is unsupported: ${String(device.category)}.`);
  }
  if (!isOneOf(['connected', 'disconnected', 'pairing', 'unknown'] as const, String(device.connectionStatus))) {
    errors.push(`${label}.connectionStatus is unsupported: ${String(device.connectionStatus)}.`);
  }
  if (typeof device.probedByHardwareAudit !== 'boolean') {
    errors.push(`${label}.probedByHardwareAudit must be a boolean.`);
  }
}

function validateSafeRanges(
  ranges: DeviceSafeRange[] | undefined,
  label: string,
  errors: string[]
): void {
  if (!Array.isArray(ranges)) return;
  for (const range of ranges) {
    if (!range.parameter) errors.push(`${label}.parameter is required.`);
    if (!range.unit) errors.push(`${label}.unit is required.`);
    if (typeof range.min !== 'number' || !Number.isFinite(range.min)) {
      errors.push(`${label}.min must be a finite number.`);
    }
    if (typeof range.max !== 'number' || !Number.isFinite(range.max)) {
      errors.push(`${label}.max must be a finite number.`);
    }
    if (range.max < range.min) {
      errors.push(`${label}.max must be >= min.`);
    }
    if (typeof range.defaultValue !== 'number' || !Number.isFinite(range.defaultValue)) {
      errors.push(`${label}.defaultValue must be a finite number.`);
    }
    if (typeof range.autoStopOnViolation !== 'boolean') {
      errors.push(`${label}.autoStopOnViolation must be a boolean.`);
    }
  }
}

function validatePrivacyRedactions(
  redactions: PrivacyRedactionEntry[] | undefined,
  label: string,
  errors: string[]
): void {
  if (!Array.isArray(redactions)) return;
  for (const entry of redactions) {
    if (!entry.field) errors.push(`${label}.field is required.`);
    if (!isOneOf(PRIVACY_REDACTION_LEVELS, String(entry.level))) {
      errors.push(`${label}.level is unsupported: ${String(entry.level)}.`);
    }
    if (!entry.reason) errors.push(`${label}.reason is required.`);
  }
}

function validateStateSnapshot(
  snapshot: DeviceStateSnapshot | undefined,
  label: string,
  errors: string[]
): void {
  if (!snapshot) {
    errors.push(`${label} is required.`);
    return;
  }
  if (!snapshot.label) errors.push(`${label}.label is required.`);
  if (!isIsoTimestamp(snapshot.capturedAt)) {
    errors.push(`${label}.capturedAt must be a valid ISO-8601 timestamp.`);
  }
  if (!snapshot.stateHash) errors.push(`${label}.stateHash is required.`);
  if (!Array.isArray(snapshot.capturedKeys)) {
    errors.push(`${label}.capturedKeys must be an array.`);
  }
  if (snapshot.containsAbsolutePaths !== false) {
    errors.push(`${label}.containsAbsolutePaths must be false.`);
  }
}

function validateVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
  label: string,
  errors: string[]
): void {
  for (const command of commands ?? []) {
    if (!command.command) errors.push(`${label} has a verification command without command text.`);
  }
}

// ── Public Validators ──

export function isSupportedDeviceCategory(value: string): value is DeviceCategory {
  return isOneOf(DEVICE_CATEGORIES, value);
}

export function isSupportedDeviceConsentScope(value: string): value is DeviceConsentScope {
  return isOneOf(DEVICE_CONSENT_SCOPES, value);
}

export function isSupportedDeviceActionClass(value: string): value is DeviceActionClass {
  return isOneOf(DEVICE_ACTION_CLASSES, value);
}

export function isSupportedDeviceActionOutcome(value: string): value is DeviceActionOutcome {
  return isOneOf(DEVICE_ACTION_OUTCOMES, value);
}

export function isSupportedReplayLessonKind(value: string): value is ReplayLessonKind {
  return isOneOf(REPLAY_LESSON_KINDS, value);
}

export function validateDeviceInventoryReceipt(receipt: DeviceInventoryReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DeviceInventoryReceipt.id is required.');
  if (receipt.schemaVersion !== DEVICE_INVENTORY_RECEIPT_VERSION) {
    errors.push(`DeviceInventoryReceipt.schemaVersion must be ${DEVICE_INVENTORY_RECEIPT_VERSION}.`);
  }
  if (!isIsoTimestamp(receipt.inventoriedAt)) {
    errors.push('DeviceInventoryReceipt.inventoriedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.inventoriedBy) errors.push('DeviceInventoryReceipt.inventoriedBy is required.');
  if (!Array.isArray(receipt.devices) || receipt.devices.length === 0) {
    errors.push('DeviceInventoryReceipt.devices must include at least one device.');
  } else {
    for (const device of receipt.devices) {
      validateDeviceIdentityEntry(device, 'DeviceInventoryReceipt.devices[]', errors);
    }
  }
  if (!isNonNegativeInteger(receipt.deviceCount)) {
    errors.push('DeviceInventoryReceipt.deviceCount must be a non-negative integer.');
  }
  if (receipt.deviceCount !== receipt.devices.length) {
    errors.push('DeviceInventoryReceipt.deviceCount must match devices array length.');
  }
  if (typeof receipt.hardwareProbeCompleted !== 'boolean') {
    errors.push('DeviceInventoryReceipt.hardwareProbeCompleted must be a boolean.');
  }
  validateHashFields('DeviceInventoryReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DeviceInventoryReceipt', errors);
  return errors;
}

export function validateDeviceSafetyEnvelopeReceipt(
  receipt: DeviceSafetyEnvelopeReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DeviceSafetyEnvelopeReceipt.id is required.');
  if (receipt.schemaVersion !== DEVICE_SAFETY_ENVELOPE_RECEIPT_VERSION) {
    errors.push(`DeviceSafetyEnvelopeReceipt.schemaVersion must be ${DEVICE_SAFETY_ENVELOPE_RECEIPT_VERSION}.`);
  }
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('DeviceSafetyEnvelopeReceipt.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateDeviceIdentityEntry(receipt.device, 'DeviceSafetyEnvelopeReceipt.device', errors);
  if (!Array.isArray(receipt.consentScopes) || receipt.consentScopes.length === 0) {
    errors.push('DeviceSafetyEnvelopeReceipt.consentScopes must include at least one scope.');
  } else {
    for (const scope of receipt.consentScopes) {
      if (!isSupportedDeviceConsentScope(String(scope))) {
        errors.push(`DeviceSafetyEnvelopeReceipt.consentScopes has unsupported scope: ${String(scope)}.`);
      }
    }
  }
  if (!isSupportedDeviceActionClass(String(receipt.actionClass))) {
    errors.push(`DeviceSafetyEnvelopeReceipt.actionClass is unsupported: ${String(receipt.actionClass)}.`);
  }
  if (!isOneOf(DEVICE_ACTION_RISK_LEVELS, String(receipt.riskLevel))) {
    errors.push(`DeviceSafetyEnvelopeReceipt.riskLevel is unsupported: ${String(receipt.riskLevel)}.`);
  }
  validateSafeRanges(receipt.safeRanges, 'DeviceSafetyEnvelopeReceipt.safeRanges[]', errors);
  if (!receipt.commandPreview) {
    errors.push('DeviceSafetyEnvelopeReceipt.commandPreview is required.');
  }
  if (!receipt.commandPreviewHash) {
    errors.push('DeviceSafetyEnvelopeReceipt.commandPreviewHash is required.');
  }
  if (receipt.commandPreviewContainsAbsolutePaths !== false) {
    errors.push('DeviceSafetyEnvelopeReceipt.commandPreviewContainsAbsolutePaths must be false.');
  }
  if (hasAbsolutePath(receipt.commandPreview)) {
    errors.push('DeviceSafetyEnvelopeReceipt.commandPreview must not expose absolute local paths.');
  }
  validatePrivacyRedactions(receipt.privacyRedactions, 'DeviceSafetyEnvelopeReceipt.privacyRedactions[]', errors);
  if (typeof receipt.requiresFreshUserGesture !== 'boolean') {
    errors.push('DeviceSafetyEnvelopeReceipt.requiresFreshUserGesture must be a boolean.');
  }
  if (typeof receipt.deviceMutationAllowed !== 'boolean') {
    errors.push('DeviceSafetyEnvelopeReceipt.deviceMutationAllowed must be a boolean.');
  }
  if (typeof receipt.reversible !== 'boolean') {
    errors.push('DeviceSafetyEnvelopeReceipt.reversible must be a boolean.');
  }
  if (!receipt.rollbackNote) errors.push('DeviceSafetyEnvelopeReceipt.rollbackNote is required.');
  if (!receipt.nonce) errors.push('DeviceSafetyEnvelopeReceipt.nonce is required.');
  validateHashFields('DeviceSafetyEnvelopeReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DeviceSafetyEnvelopeReceipt', errors);
  return errors;
}

export function validateConsentReceipt(receipt: ConsentReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ConsentReceipt.id is required.');
  if (receipt.schemaVersion !== DEVICE_CONSENT_RECEIPT_VERSION) {
    errors.push(`ConsentReceipt.schemaVersion must be ${DEVICE_CONSENT_RECEIPT_VERSION}.`);
  }
  if (!receipt.deviceId) errors.push('ConsentReceipt.deviceId is required.');
  if (!receipt.deviceLabel) errors.push('ConsentReceipt.deviceLabel is required.');
  if (!Array.isArray(receipt.consentedScopes) || receipt.consentedScopes.length === 0) {
    errors.push('ConsentReceipt.consentedScopes must include at least one scope.');
  } else {
    for (const scope of receipt.consentedScopes) {
      if (!isSupportedDeviceConsentScope(String(scope))) {
        errors.push(`ConsentReceipt.consentedScopes has unsupported scope: ${String(scope)}.`);
      }
    }
  }
  if (!isSupportedDeviceActionClass(String(receipt.actionClass))) {
    errors.push(`ConsentReceipt.actionClass is unsupported: ${String(receipt.actionClass)}.`);
  }
  if (!isOneOf(DEVICE_ACTION_RISK_LEVELS, String(receipt.riskLevelAcknowledged))) {
    errors.push(`ConsentReceipt.riskLevelAcknowledged is unsupported: ${String(receipt.riskLevelAcknowledged)}.`);
  }
  if (!isIsoTimestamp(receipt.consentedAt)) {
    errors.push('ConsentReceipt.consentedAt must be a valid ISO-8601 timestamp.');
  }
  if (receipt.expiresAt !== undefined && !isIsoTimestamp(receipt.expiresAt)) {
    errors.push('ConsentReceipt.expiresAt must be a valid ISO-8601 timestamp when present.');
  }
  if (receipt.freshUserGesture !== true) {
    errors.push('ConsentReceipt.freshUserGesture must be true.');
  }
  if (!receipt.envelopeNonce) errors.push('ConsentReceipt.envelopeNonce is required.');
  if (receipt.hiddenAutomationUsed !== false) {
    errors.push('ConsentReceipt.hiddenAutomationUsed must be false.');
  }
  if (typeof receipt.credentialAdjacent !== 'boolean') {
    errors.push('ConsentReceipt.credentialAdjacent must be a boolean.');
  }
  if (receipt.credentialExtrusionAllowed !== false) {
    errors.push('ConsentReceipt.credentialExtrusionAllowed must be false.');
  }
  validateHashFields('ConsentReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateDeviceActionReceipt(receipt: DeviceActionReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('DeviceActionReceipt.id is required.');
  if (receipt.schemaVersion !== DEVICE_ACTION_RECEIPT_VERSION) {
    errors.push(`DeviceActionReceipt.schemaVersion must be ${DEVICE_ACTION_RECEIPT_VERSION}.`);
  }
  if (!receipt.envelopeReceiptId) errors.push('DeviceActionReceipt.envelopeReceiptId is required.');
  if (!receipt.consentReceiptId) errors.push('DeviceActionReceipt.consentReceiptId is required.');
  validateDeviceIdentityEntry(receipt.device, 'DeviceActionReceipt.device', errors);
  if (!isSupportedDeviceActionClass(String(receipt.actionClass))) {
    errors.push(`DeviceActionReceipt.actionClass is unsupported: ${String(receipt.actionClass)}.`);
  }
  if (!isSupportedDeviceActionOutcome(String(receipt.outcome))) {
    errors.push(`DeviceActionReceipt.outcome is unsupported: ${String(receipt.outcome)}.`);
  }
  if (!isIsoTimestamp(receipt.startedAt)) {
    errors.push('DeviceActionReceipt.startedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isIsoTimestamp(receipt.completedAt)) {
    errors.push('DeviceActionReceipt.completedAt must be a valid ISO-8601 timestamp.');
  }
  if (typeof receipt.durationMs !== 'number' || !Number.isFinite(receipt.durationMs) || receipt.durationMs < 0) {
    errors.push('DeviceActionReceipt.durationMs must be a non-negative finite number.');
  }
  validateStateSnapshot(receipt.beforeState, 'DeviceActionReceipt.beforeState', errors);
  validateStateSnapshot(receipt.afterState, 'DeviceActionReceipt.afterState', errors);
  if (typeof receipt.deviceMutationPerformed !== 'boolean') {
    errors.push('DeviceActionReceipt.deviceMutationPerformed must be a boolean.');
  }
  if (typeof receipt.safeRangeViolationOccurred !== 'boolean') {
    errors.push('DeviceActionReceipt.safeRangeViolationOccurred must be a boolean.');
  }
  if (!Array.isArray(receipt.safeRangeViolations)) {
    errors.push('DeviceActionReceipt.safeRangeViolations must be an array.');
  }
  validatePrivacyRedactions(receipt.privacyRedactions, 'DeviceActionReceipt.privacyRedactions[]', errors);
  if (typeof receipt.replayable !== 'boolean') {
    errors.push('DeviceActionReceipt.replayable must be a boolean.');
  }
  if (!receipt.rollbackNote) errors.push('DeviceActionReceipt.rollbackNote is required.');
  validateHashFields('DeviceActionReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(receipt.verificationCommands, 'DeviceActionReceipt', errors);
  return errors;
}

export function validateReplayLessonReceipt(receipt: ReplayLessonReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ReplayLessonReceipt.id is required.');
  if (receipt.schemaVersion !== REPLAY_LESSON_RECEIPT_VERSION) {
    errors.push(`ReplayLessonReceipt.schemaVersion must be ${REPLAY_LESSON_RECEIPT_VERSION}.`);
  }
  if (!receipt.sourceActionReceiptId) errors.push('ReplayLessonReceipt.sourceActionReceiptId is required.');
  validateDeviceIdentityEntry(receipt.device, 'ReplayLessonReceipt.device', errors);
  if (!Array.isArray(receipt.lessons) || receipt.lessons.length === 0) {
    errors.push('ReplayLessonReceipt.lessons must include at least one lesson.');
  } else {
    for (const lesson of receipt.lessons) {
      if (!lesson.lesson) errors.push('ReplayLessonEntry.lesson is required.');
      if (!isSupportedReplayLessonKind(String(lesson.kind))) {
        errors.push(`ReplayLessonEntry.kind is unsupported: ${String(lesson.kind)}.`);
      }
      if (!isSupportedDeviceActionOutcome(String(lesson.sourceOutcome))) {
        errors.push(`ReplayLessonEntry.sourceOutcome is unsupported: ${String(lesson.sourceOutcome)}.`);
      }
      if (typeof lesson.autoDerived !== 'boolean') {
        errors.push('ReplayLessonEntry.autoDerived must be a boolean.');
      }
      if (typeof lesson.showToNonDevelopers !== 'boolean') {
        errors.push('ReplayLessonEntry.showToNonDevelopers must be a boolean.');
      }
      if (!lesson.insight) errors.push('ReplayLessonEntry.insight is required.');
      if (!lesson.recommendedAction) errors.push('ReplayLessonEntry.recommendedAction is required.');
    }
  }
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push('ReplayLessonReceipt.generatedAt must be a valid ISO-8601 timestamp.');
  }
  if (typeof receipt.replayable !== 'boolean') {
    errors.push('ReplayLessonReceipt.replayable must be a boolean.');
  }
  if (typeof receipt.originalMutationPerformed !== 'boolean') {
    errors.push('ReplayLessonReceipt.originalMutationPerformed must be a boolean.');
  }
  if (!receipt.originalRollbackNote) errors.push('ReplayLessonReceipt.originalRollbackNote is required.');
  validateHashFields('ReplayLessonReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellDeviceSafetyReceiptPack(
  pack: HoloShellDeviceSafetyReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellDeviceSafetyReceiptPack.id is required.');
  if (!pack.inventory) {
    errors.push('HoloShellDeviceSafetyReceiptPack.inventory is required.');
  } else {
    errors.push(...validateDeviceInventoryReceipt(pack.inventory));
  }
  if (!pack.envelope) {
    errors.push('HoloShellDeviceSafetyReceiptPack.envelope is required.');
  } else {
    errors.push(...validateDeviceSafetyEnvelopeReceipt(pack.envelope));
  }
  if (!pack.consent) {
    errors.push('HoloShellDeviceSafetyReceiptPack.consent is required.');
  } else {
    errors.push(...validateConsentReceipt(pack.consent));
  }
  if (pack.action) errors.push(...validateDeviceActionReceipt(pack.action));
  if (pack.replay) errors.push(...validateReplayLessonReceipt(pack.replay));
  if (!isOneOf(['planned', 'consented', 'executing', 'completed', 'failed', 'blocked'] as const, String(pack.status))) {
    errors.push(`HoloShellDeviceSafetyReceiptPack.status is unsupported: ${String(pack.status)}.`);
  }
  if (pack.status === 'completed' && !pack.action) {
    errors.push('HoloShellDeviceSafetyReceiptPack.action is required when status=completed.');
  }
  validateHashFields('HoloShellDeviceSafetyReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellTargetDeviceProofPack(
  pack: HoloShellTargetDeviceProofPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellTargetDeviceProofPack.id is required.');
  if (!pack.safetyPack) {
    errors.push('HoloShellTargetDeviceProofPack.safetyPack is required.');
  } else {
    errors.push(...validateHoloShellDeviceSafetyReceiptPack(pack.safetyPack));
  }
  if (!pack.targetWitness) {
    errors.push('HoloShellTargetDeviceProofPack.targetWitness is required (real target frame or explicit blocker).');
  } else {
    if (!pack.targetWitness.witnessedAt) errors.push('TargetDeviceWitness.witnessedAt is required.');
    if (!pack.targetWitness.witnessSource) errors.push('TargetDeviceWitness.witnessSource is required.');
    const hasRealWitness = !!pack.targetWitness.witnessHash;
    const hasBlocker = !!pack.targetWitness.blocker;
    if (!hasRealWitness && !hasBlocker) {
      errors.push('TargetDeviceWitness must provide either witnessHash (real target) or blocker.');
    }
  }
  if (typeof pack.targetProofReadyForHoloLand !== 'boolean') {
    errors.push('HoloShellTargetDeviceProofPack.targetProofReadyForHoloLand must be boolean.');
  }
  // ready_for_hololand requires a real (non-blocker) witness
  if (pack.targetProofReadyForHoloLand && !pack.targetWitness?.witnessHash) {
    errors.push('targetProofReadyForHoloLand=true requires a real targetWitness.witnessHash (not blocker-only).');
  }
  if (!isOneOf(['local_ready', 'device_identified', 'witness_planned', 'witness_captured', 'approved', 'executed', 'target_proven', 'blocked'] as const, String(pack.status))) {
    errors.push(`HoloShellTargetDeviceProofPack.status is unsupported: ${String(pack.status)}.`);
  }
  validateHashFields('HoloShellTargetDeviceProofPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

// ── Clone Helpers ──

export function cloneDeviceIdentityEntry(entry: DeviceIdentityEntry): DeviceIdentityEntry {
  return { ...entry };
}

export function cloneDeviceInventoryReceipt(receipt: DeviceInventoryReceipt): DeviceInventoryReceipt {
  return {
    ...receipt,
    devices: receipt.devices.map(cloneDeviceIdentityEntry),
    categoriesFound: [...receipt.categoriesFound],
    warnings: [...receipt.warnings],
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneDeviceSafetyEnvelopeReceipt(receipt: DeviceSafetyEnvelopeReceipt): DeviceSafetyEnvelopeReceipt {
  return {
    ...receipt,
    device: cloneDeviceIdentityEntry(receipt.device),
    consentScopes: [...receipt.consentScopes],
    safeRanges: receipt.safeRanges.map((r) => ({ ...r })),
    privacyRedactions: receipt.privacyRedactions.map((r) => ({ ...r })),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneConsentReceipt(receipt: ConsentReceipt): ConsentReceipt {
  return {
    ...receipt,
    consentedScopes: [...receipt.consentedScopes],
  };
}

export function cloneDeviceActionReceipt(receipt: DeviceActionReceipt): DeviceActionReceipt {
  return {
    ...receipt,
    device: cloneDeviceIdentityEntry(receipt.device),
    safeRangeViolations: [...receipt.safeRangeViolations],
    privacyRedactions: receipt.privacyRedactions.map((r) => ({ ...r })),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map((c) => ({ ...c, artifactIds: c.artifactIds ? [...c.artifactIds] : undefined })) } : {}),
  };
}

export function cloneReplayLessonReceipt(receipt: ReplayLessonReceipt): ReplayLessonReceipt {
  return {
    ...receipt,
    device: cloneDeviceIdentityEntry(receipt.device),
    lessons: receipt.lessons.map((l) => ({ ...l })),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance, parentArtifactIds: receipt.provenance.parentArtifactIds ? [...receipt.provenance.parentArtifactIds] : undefined } } : {}),
  };
}

export function cloneHoloShellDeviceSafetyReceiptPack(
  pack: HoloShellDeviceSafetyReceiptPack
): HoloShellDeviceSafetyReceiptPack {
  return {
    ...pack,
    inventory: cloneDeviceInventoryReceipt(pack.inventory),
    envelope: cloneDeviceSafetyEnvelopeReceipt(pack.envelope),
    consent: cloneConsentReceipt(pack.consent),
    ...(pack.action ? { action: cloneDeviceActionReceipt(pack.action) } : {}),
    ...(pack.replay ? { replay: cloneReplayLessonReceipt(pack.replay) } : {}),
  };
}

export function cloneTargetDeviceWitness(witness: TargetDeviceWitness): TargetDeviceWitness {
  return { ...witness };
}

export function cloneHoloShellTargetDeviceProofPack(
  pack: HoloShellTargetDeviceProofPack
): HoloShellTargetDeviceProofPack {
  return {
    ...pack,
    safetyPack: cloneHoloShellDeviceSafetyReceiptPack(pack.safetyPack),
    targetWitness: cloneTargetDeviceWitness(pack.targetWitness),
    ...(pack.provenance ? { provenance: { ...pack.provenance, parentArtifactIds: pack.provenance.parentArtifactIds ? [...pack.provenance.parentArtifactIds] : undefined } } : {}),
  };
}

// ── Physical Actuation Extension Receipts ─────────────────────────────────────
// These 4 receipt types extend DeviceSafetyReceiptPack for physical actuation
// workflows: deterministic simulation preview, sensor/approval freshness,
// safe stop, and physical rollback limits.
// task_1779224072780_t5pu

export const ACTUATION_SIMULATION_RECEIPT_VERSION = 'holoscript-actuation-simulation-receipt/v1';

/** Deterministic simulation preview receipt produced before any physical actuation. */
export interface ActuationSimulationReceipt {
  schemaVersion: typeof ACTUATION_SIMULATION_RECEIPT_VERSION;
  /** Unique receipt ID. */
  id: string;
  /** The action that was simulated. */
  actionId: string;
  /** Device or robot target for the actuation. */
  targetDeviceId: string;
  /** Predicted outcome description. */
  predictedOutcome: string;
  /** Whether the simulation passed safety constraints. */
  simulationPassed: boolean;
  /** Max force/torque estimate from simulation (N or N·m). */
  peakForceEstimate?: number;
  /** Max displacement/travel estimate (mm). */
  peakDisplacementMm?: number;
  /** Duration of the simulated motion (ms). */
  durationMs: number;
  /** Simulation engine or solver used. */
  simulationEngine: string;
  /** ISO-8601 timestamp when simulation ran. */
  simulatedAt: string;
  /** Optional hash of the simulation state snapshot. */
  stateSnapshotHash?: string;
}

export const SENSOR_FRESHNESS_RECEIPT_VERSION = 'holoscript-sensor-freshness-receipt/v1';

/** Sensor and approval freshness receipt — proves sensor data and consent are not stale. */
export interface SensorFreshnessReceipt {
  schemaVersion: typeof SENSOR_FRESHNESS_RECEIPT_VERSION;
  /** Unique receipt ID. */
  id: string;
  /** The action requiring fresh sensor/approval data. */
  actionId: string;
  /** Max sensor age that was allowed (ms). */
  maxSensorAgeMs: number;
  /** Actual sensor data age at execution time (ms). */
  actualSensorAgeMs: number;
  /** Whether sensor data was fresh enough. */
  sensorFresh: boolean;
  /** Max consent approval age allowed (ms). */
  maxApprovalAgeMs: number;
  /** Actual consent approval age at execution time (ms). */
  actualApprovalAgeMs: number;
  /** Whether consent approval was fresh enough. */
  approvalFresh: boolean;
  /** Overall freshness pass/fail. */
  fresh: boolean;
  /** ISO-8601 timestamp when freshness was checked. */
  checkedAt: string;
}

export const SAFE_STOP_RECEIPT_VERSION = 'holoscript-safe-stop-receipt/v1';

export const SAFE_STOP_TRIGGERS = [
  'operator_request',
  'sensor_limit_exceeded',
  'consent_expired',
  'simulation_divergence',
  'hardware_fault',
  'timeout',
  'envelope_violation',
] as const;
export type SafeStopTrigger = (typeof SAFE_STOP_TRIGGERS)[number];

/** Safe stop receipt — documents the halting of a physical actuation before or during execution. */
export interface SafeStopReceipt {
  schemaVersion: typeof SAFE_STOP_RECEIPT_VERSION;
  /** Unique receipt ID. */
  id: string;
  /** The action that was stopped. */
  actionId: string;
  /** The device that was stopped. */
  targetDeviceId: string;
  /** What triggered the safe stop. */
  trigger: SafeStopTrigger;
  /** Human-readable reason for the stop. */
  reason: string;
  /** Whether the device reached a safe state after stop. */
  safeCategoryReached: boolean;
  /** Device state at the time of stop. */
  deviceStateAtStop?: string;
  /** ISO-8601 timestamp when stop was issued. */
  stoppedAt: string;
  /** Whether the action may be retried after resolving the trigger. */
  retryEligible: boolean;
}

export const PHYSICAL_ROLLBACK_LIMIT_RECEIPT_VERSION = 'holoscript-physical-rollback-limit-receipt/v1';

/** Physical rollback limit receipt — documents what physical changes can and cannot be undone. */
export interface PhysicalRollbackLimitReceipt {
  schemaVersion: typeof PHYSICAL_ROLLBACK_LIMIT_RECEIPT_VERSION;
  /** Unique receipt ID. */
  id: string;
  /** The action whose rollback limits are described. */
  actionId: string;
  /** The device whose state may have changed. */
  targetDeviceId: string;
  /** Whether the physical action is reversible at all. */
  reversible: boolean;
  /** What can be rolled back (e.g. 'motor position returned to origin'). */
  rollbackScope?: string;
  /** What cannot be rolled back (e.g. 'ink deposited on substrate is permanent'). */
  irreversibleScope?: string;
  /** Max rollback window in milliseconds (0 = no rollback possible). */
  rollbackWindowMs: number;
  /** Whether rollback was attempted. */
  rollbackAttempted: boolean;
  /** Whether rollback succeeded (undefined if not attempted). */
  rollbackSucceeded?: boolean;
  /** ISO-8601 timestamp of the irreversible state transition, if applicable. */
  irreversibleAt?: string;
}

// ── Pack Extension: Actuation Fields ──

/**
 * Optional extension to HoloShellDeviceSafetyReceiptPack for physical actuation workflows.
 * Attach to the base pack via composition rather than mutation.
 */
export interface HoloShellActuationExtension {
  /** Simulation preview receipt (required before physical actuation). */
  simulation?: ActuationSimulationReceipt;
  /** Sensor and approval freshness receipt. */
  sensorFreshness?: SensorFreshnessReceipt;
  /** Safe stop receipt, if the action was stopped. */
  safeStop?: SafeStopReceipt;
  /** Physical rollback limit receipt. */
  rollbackLimit?: PhysicalRollbackLimitReceipt;
}

// ── Validators ──

export function validateActuationSimulationReceipt(
  receipt: ActuationSimulationReceipt
): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== ACTUATION_SIMULATION_RECEIPT_VERSION)
    errors.push(`ActuationSimulationReceipt.schemaVersion must be "${ACTUATION_SIMULATION_RECEIPT_VERSION}".`);
  if (!receipt.id) errors.push('ActuationSimulationReceipt.id is required.');
  if (!receipt.actionId) errors.push('ActuationSimulationReceipt.actionId is required.');
  if (!receipt.targetDeviceId) errors.push('ActuationSimulationReceipt.targetDeviceId is required.');
  if (!receipt.predictedOutcome) errors.push('ActuationSimulationReceipt.predictedOutcome is required.');
  if (typeof receipt.simulationPassed !== 'boolean') errors.push('ActuationSimulationReceipt.simulationPassed must be boolean.');
  if (typeof receipt.durationMs !== 'number' || receipt.durationMs < 0)
    errors.push('ActuationSimulationReceipt.durationMs must be a non-negative number.');
  if (!receipt.simulationEngine) errors.push('ActuationSimulationReceipt.simulationEngine is required.');
  if (!receipt.simulatedAt) errors.push('ActuationSimulationReceipt.simulatedAt is required.');
  return errors;
}

export function validateSensorFreshnessReceipt(receipt: SensorFreshnessReceipt): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== SENSOR_FRESHNESS_RECEIPT_VERSION)
    errors.push(`SensorFreshnessReceipt.schemaVersion must be "${SENSOR_FRESHNESS_RECEIPT_VERSION}".`);
  if (!receipt.id) errors.push('SensorFreshnessReceipt.id is required.');
  if (!receipt.actionId) errors.push('SensorFreshnessReceipt.actionId is required.');
  if (typeof receipt.maxSensorAgeMs !== 'number' || receipt.maxSensorAgeMs < 0)
    errors.push('SensorFreshnessReceipt.maxSensorAgeMs must be a non-negative number.');
  if (typeof receipt.actualSensorAgeMs !== 'number' || receipt.actualSensorAgeMs < 0)
    errors.push('SensorFreshnessReceipt.actualSensorAgeMs must be a non-negative number.');
  if (typeof receipt.sensorFresh !== 'boolean') errors.push('SensorFreshnessReceipt.sensorFresh must be boolean.');
  if (typeof receipt.maxApprovalAgeMs !== 'number' || receipt.maxApprovalAgeMs < 0)
    errors.push('SensorFreshnessReceipt.maxApprovalAgeMs must be a non-negative number.');
  if (typeof receipt.actualApprovalAgeMs !== 'number' || receipt.actualApprovalAgeMs < 0)
    errors.push('SensorFreshnessReceipt.actualApprovalAgeMs must be a non-negative number.');
  if (typeof receipt.approvalFresh !== 'boolean') errors.push('SensorFreshnessReceipt.approvalFresh must be boolean.');
  if (typeof receipt.fresh !== 'boolean') errors.push('SensorFreshnessReceipt.fresh must be boolean.');
  if (!receipt.checkedAt) errors.push('SensorFreshnessReceipt.checkedAt is required.');
  // Cross-field: fresh = sensorFresh && approvalFresh
  if (receipt.fresh !== (receipt.sensorFresh && receipt.approvalFresh))
    errors.push('SensorFreshnessReceipt.fresh must equal sensorFresh && approvalFresh.');
  return errors;
}

export function validateSafeStopReceipt(receipt: SafeStopReceipt): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== SAFE_STOP_RECEIPT_VERSION)
    errors.push(`SafeStopReceipt.schemaVersion must be "${SAFE_STOP_RECEIPT_VERSION}".`);
  if (!receipt.id) errors.push('SafeStopReceipt.id is required.');
  if (!receipt.actionId) errors.push('SafeStopReceipt.actionId is required.');
  if (!receipt.targetDeviceId) errors.push('SafeStopReceipt.targetDeviceId is required.');
  if (!SAFE_STOP_TRIGGERS.includes(receipt.trigger as SafeStopTrigger))
    errors.push(`SafeStopReceipt.trigger must be one of: ${SAFE_STOP_TRIGGERS.join(', ')}.`);
  if (!receipt.reason) errors.push('SafeStopReceipt.reason is required.');
  if (typeof receipt.safeCategoryReached !== 'boolean') errors.push('SafeStopReceipt.safeCategoryReached must be boolean.');
  if (!receipt.stoppedAt) errors.push('SafeStopReceipt.stoppedAt is required.');
  if (typeof receipt.retryEligible !== 'boolean') errors.push('SafeStopReceipt.retryEligible must be boolean.');
  return errors;
}

export function validatePhysicalRollbackLimitReceipt(receipt: PhysicalRollbackLimitReceipt): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== PHYSICAL_ROLLBACK_LIMIT_RECEIPT_VERSION)
    errors.push(`PhysicalRollbackLimitReceipt.schemaVersion must be "${PHYSICAL_ROLLBACK_LIMIT_RECEIPT_VERSION}".`);
  if (!receipt.id) errors.push('PhysicalRollbackLimitReceipt.id is required.');
  if (!receipt.actionId) errors.push('PhysicalRollbackLimitReceipt.actionId is required.');
  if (!receipt.targetDeviceId) errors.push('PhysicalRollbackLimitReceipt.targetDeviceId is required.');
  if (typeof receipt.reversible !== 'boolean') errors.push('PhysicalRollbackLimitReceipt.reversible must be boolean.');
  if (typeof receipt.rollbackWindowMs !== 'number' || receipt.rollbackWindowMs < 0)
    errors.push('PhysicalRollbackLimitReceipt.rollbackWindowMs must be a non-negative number.');
  if (typeof receipt.rollbackAttempted !== 'boolean') errors.push('PhysicalRollbackLimitReceipt.rollbackAttempted must be boolean.');
  // Cross-field: rollbackSucceeded only meaningful if rollbackAttempted
  if (!receipt.rollbackAttempted && receipt.rollbackSucceeded !== undefined)
    errors.push('PhysicalRollbackLimitReceipt.rollbackSucceeded must be undefined when rollbackAttempted=false.');
  return errors;
}