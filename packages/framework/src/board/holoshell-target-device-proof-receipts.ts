/**
 * HoloShell Target Device Proof Receipts
 *
 * Proves the gap between local compile/browser readiness and actual target
 * hardware evidence. A blocked receipt is valid when the runner can prove why
 * it did not capture a headset/device frame.
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

export const TARGET_DEVICE_PROOF_RECEIPT_VERSION = 'holoshell-target-device-proof-receipt/v1';

export const TARGET_DEVICE_KINDS = [
  'webxr-headset',
  'openxr-headset',
  'android-xr-device',
  'ios-device',
  'browser',
  'robot',
] as const;

export const TARGET_DEVICE_PROOF_STATUSES = ['pass', 'blocked', 'fail'] as const;

export const TARGET_DEVICE_PROOF_CHECKS = [
  'compile',
  'browser-acceleration',
  'device-presence',
  'frame-capture',
  'timing',
  'provenance',
] as const;

export type TargetDeviceKind = (typeof TARGET_DEVICE_KINDS)[number];
export type TargetDeviceProofStatus = (typeof TARGET_DEVICE_PROOF_STATUSES)[number];
export type TargetDeviceProofCheckKind = (typeof TARGET_DEVICE_PROOF_CHECKS)[number];

export interface TargetDeviceIdentity {
  kind: TargetDeviceKind;
  label: string;
  deviceIdHash?: string;
  transport?: 'adb' | 'webxr' | 'openxr' | 'usb' | 'network' | 'manual';
}

export interface TargetDeviceProofCheck {
  id: string;
  kind: TargetDeviceProofCheckKind;
  status: TargetDeviceProofStatus;
  command?: string;
  artifactPath?: string;
  detail?: string;
  observedMs?: number;
  budgetMs?: number;
}

export interface TargetDeviceFrameReceipt {
  segmentId: string;
  frameArtifactPath: string;
  capturedAt: string;
  observedFrameMs?: number;
  budgetMs?: number;
  provenanceHash?: string;
}

export interface HoloShellTargetDeviceProofReceipt {
  schemaVersion: typeof TARGET_DEVICE_PROOF_RECEIPT_VERSION;
  id: string;
  scenario: string;
  generatedAt: string;
  target: TargetDeviceIdentity;
  status: TargetDeviceProofStatus;
  checks: TargetDeviceProofCheck[];
  frames?: TargetDeviceFrameReceipt[];
  blockedReason?: string;
  summary?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

export function isSupportedTargetDeviceKind(value: string): value is TargetDeviceKind {
  return (TARGET_DEVICE_KINDS as readonly string[]).includes(value);
}

export function isSupportedTargetDeviceProofStatus(
  value: string
): value is TargetDeviceProofStatus {
  return (TARGET_DEVICE_PROOF_STATUSES as readonly string[]).includes(value);
}

export function isSupportedTargetDeviceProofCheckKind(
  value: string
): value is TargetDeviceProofCheckKind {
  return (TARGET_DEVICE_PROOF_CHECKS as readonly string[]).includes(value);
}

function isIsoTimestamp(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function validateTargetDeviceIdentity(target: TargetDeviceIdentity | undefined): string[] {
  const errors: string[] = [];
  if (!target || typeof target !== 'object') {
    errors.push('HoloShellTargetDeviceProofReceipt.target is required.');
    return errors;
  }
  if (!isSupportedTargetDeviceKind(String(target.kind))) {
    errors.push(`TargetDeviceIdentity.kind is unsupported: ${String(target.kind)}.`);
  }
  if (!target.label) errors.push('TargetDeviceIdentity.label is required.');
  return errors;
}

function validateTargetDeviceProofCheck(check: TargetDeviceProofCheck): string[] {
  const errors: string[] = [];
  if (!check.id) errors.push('TargetDeviceProofCheck.id is required.');
  if (!isSupportedTargetDeviceProofCheckKind(String(check.kind))) {
    errors.push(`TargetDeviceProofCheck.kind is unsupported: ${String(check.kind)}.`);
  }
  if (!isSupportedTargetDeviceProofStatus(String(check.status))) {
    errors.push(`TargetDeviceProofCheck.status is unsupported: ${String(check.status)}.`);
  }
  if (
    check.observedMs !== undefined &&
    (typeof check.observedMs !== 'number' || check.observedMs < 0)
  ) {
    errors.push(
      `TargetDeviceProofCheck ${check.id || '<unknown>'}.observedMs must be non-negative.`
    );
  }
  if (check.budgetMs !== undefined && (typeof check.budgetMs !== 'number' || check.budgetMs <= 0)) {
    errors.push(`TargetDeviceProofCheck ${check.id || '<unknown>'}.budgetMs must be positive.`);
  }
  return errors;
}

function validateTargetDeviceFrameReceipt(frame: TargetDeviceFrameReceipt): string[] {
  const errors: string[] = [];
  if (!frame.segmentId) errors.push('TargetDeviceFrameReceipt.segmentId is required.');
  if (!frame.frameArtifactPath)
    errors.push('TargetDeviceFrameReceipt.frameArtifactPath is required.');
  if (!isIsoTimestamp(frame.capturedAt)) {
    errors.push('TargetDeviceFrameReceipt.capturedAt must be a valid ISO-8601 timestamp.');
  }
  if (
    frame.observedFrameMs !== undefined &&
    (typeof frame.observedFrameMs !== 'number' || frame.observedFrameMs < 0)
  ) {
    errors.push(
      `TargetDeviceFrameReceipt ${frame.segmentId || '<unknown>'}.observedFrameMs must be non-negative.`
    );
  }
  return errors;
}

export function validateHoloShellTargetDeviceProofReceipt(
  receipt: HoloShellTargetDeviceProofReceipt
): string[] {
  const errors: string[] = [];
  if (receipt.schemaVersion !== TARGET_DEVICE_PROOF_RECEIPT_VERSION) {
    errors.push(
      `HoloShellTargetDeviceProofReceipt.schemaVersion must be ${TARGET_DEVICE_PROOF_RECEIPT_VERSION}.`
    );
  }
  if (!receipt.id) errors.push('HoloShellTargetDeviceProofReceipt.id is required.');
  if (!receipt.scenario) errors.push('HoloShellTargetDeviceProofReceipt.scenario is required.');
  if (!isIsoTimestamp(receipt.generatedAt)) {
    errors.push(
      'HoloShellTargetDeviceProofReceipt.generatedAt must be a valid ISO-8601 timestamp.'
    );
  }
  errors.push(...validateTargetDeviceIdentity(receipt.target));

  if (!isSupportedTargetDeviceProofStatus(String(receipt.status))) {
    errors.push(
      `HoloShellTargetDeviceProofReceipt.status is unsupported: ${String(receipt.status)}.`
    );
  }
  if (!Array.isArray(receipt.checks) || receipt.checks.length === 0) {
    errors.push('HoloShellTargetDeviceProofReceipt.checks must be a non-empty array.');
  } else {
    for (const check of receipt.checks) errors.push(...validateTargetDeviceProofCheck(check));
  }
  if (receipt.frames) {
    for (const frame of receipt.frames) errors.push(...validateTargetDeviceFrameReceipt(frame));
  }
  if (receipt.status === 'pass' && (!receipt.frames || receipt.frames.length === 0)) {
    errors.push('HoloShellTargetDeviceProofReceipt.frames are required when status=pass.');
  }
  if (receipt.status === 'blocked' && !receipt.blockedReason) {
    errors.push('HoloShellTargetDeviceProofReceipt.blockedReason is required when status=blocked.');
  }
  if (!receipt.hash) errors.push('HoloShellTargetDeviceProofReceipt.hash is required.');
  if (!receipt.hashAlgorithm)
    errors.push('HoloShellTargetDeviceProofReceipt.hashAlgorithm is required.');
  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(
        'HoloShellTargetDeviceProofReceipt has a verification command without command text.'
      );
    }
  }
  return errors;
}

function cloneTargetDeviceIdentity(target: TargetDeviceIdentity): TargetDeviceIdentity {
  return { ...target };
}

function cloneTargetDeviceProofCheck(check: TargetDeviceProofCheck): TargetDeviceProofCheck {
  return { ...check };
}

function cloneTargetDeviceFrameReceipt(frame: TargetDeviceFrameReceipt): TargetDeviceFrameReceipt {
  return { ...frame };
}

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined
): ArtifactVerificationCommand[] | undefined {
  if (!commands) return undefined;
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

function cloneProvenance(
  provenance: ArtifactProvenanceLink | undefined
): ArtifactProvenanceLink | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    ...(provenance.parentArtifactIds
      ? { parentArtifactIds: [...provenance.parentArtifactIds] }
      : {}),
  };
}

export function cloneHoloShellTargetDeviceProofReceipt(
  receipt: HoloShellTargetDeviceProofReceipt
): HoloShellTargetDeviceProofReceipt {
  return {
    ...receipt,
    target: cloneTargetDeviceIdentity(receipt.target),
    checks: receipt.checks.map(cloneTargetDeviceProofCheck),
    ...(receipt.frames ? { frames: receipt.frames.map(cloneTargetDeviceFrameReceipt) } : {}),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
