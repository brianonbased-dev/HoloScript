/**
 * Tests for HoloShell Device Safety Envelope Receipts
 *
 * Validates all five receipt types (DeviceInventory, DeviceSafetyEnvelope,
 * Consent, DeviceAction, ReplayLesson) plus the composite pack.
 *
 * task_1779092805820_n2xw
 */

import { describe, it, expect } from 'vitest';
import {
  DEVICE_CATEGORIES,
  DEVICE_IDENTITY_SOURCES,
  DEVICE_CONSENT_SCOPES,
  DEVICE_ACTION_CLASSES,
  DEVICE_ACTION_RISK_LEVELS,
  DEVICE_ACTION_OUTCOMES,
  REPLAY_LESSON_KINDS,
  PRIVACY_REDACTION_LEVELS,
  DEVICE_INVENTORY_RECEIPT_VERSION,
  DEVICE_SAFETY_ENVELOPE_RECEIPT_VERSION,
  DEVICE_CONSENT_RECEIPT_VERSION,
  DEVICE_ACTION_RECEIPT_VERSION,
  REPLAY_LESSON_RECEIPT_VERSION,
  validateDeviceInventoryReceipt,
  validateDeviceSafetyEnvelopeReceipt,
  validateConsentReceipt,
  validateDeviceActionReceipt,
  validateReplayLessonReceipt,
  validateHoloShellDeviceSafetyReceiptPack,
  cloneDeviceInventoryReceipt,
  cloneDeviceSafetyEnvelopeReceipt,
  cloneConsentReceipt,
  cloneDeviceActionReceipt,
  cloneReplayLessonReceipt,
  cloneHoloShellDeviceSafetyReceiptPack,
  isSupportedDeviceCategory,
  isSupportedDeviceConsentScope,
  isSupportedDeviceActionClass,
  isSupportedDeviceActionOutcome,
  isSupportedReplayLessonKind,
  type DeviceInventoryReceipt,
  type DeviceSafetyEnvelopeReceipt,
  type ConsentReceipt,
  type DeviceActionReceipt,
  type ReplayLessonReceipt,
  type HoloShellDeviceSafetyReceiptPack,
  type DeviceIdentityEntry,
  type DeviceSafeRange,
  type DeviceStateSnapshot,
  type PrivacyRedactionEntry,
  type ReplayLessonEntry,
} from '../holoshell-device-safety-receipts';

// ── Fixtures ──

const validDeviceIdentity: DeviceIdentityEntry = {
  deviceId: 'quest-3-bt-aabbcc1122',
  redactedLabel: 'Quest 3 (Bluetooth)',
  deviceIdHash: 'sha256-abc123',
  identitySource: 'pnP_device_id',
  category: 'headset',
  manufacturer: 'Meta',
  model: 'Quest 3',
  driverVersion: '1.2.3',
  connectionStatus: 'connected',
  probedByHardwareAudit: true,
};

const validSafeRange: DeviceSafeRange = {
  parameter: 'volume',
  unit: 'dB',
  min: 0,
  max: 100,
  defaultValue: 50,
  autoStopOnViolation: true,
};

const validBeforeSnapshot: DeviceStateSnapshot = {
  label: 'before_command',
  capturedAt: '2026-05-18T12:00:00Z',
  stateHash: 'sha256-before123',
  capturedKeys: ['volume', 'connection_status', 'battery_level'],
  containsAbsolutePaths: false,
};

const validAfterSnapshot: DeviceStateSnapshot = {
  label: 'after_command',
  capturedAt: '2026-05-18T12:00:01Z',
  stateHash: 'sha256-after456',
  capturedKeys: ['volume', 'connection_status', 'battery_level'],
  containsAbsolutePaths: false,
};

const validRedaction: PrivacyRedactionEntry = {
  field: 'deviceId',
  level: 'hash_only',
  reason: 'Device serial number is credential-adjacent',
};

const validLesson: ReplayLessonEntry = {
  lesson: 'Volume set to safe range',
  kind: 'command_success',
  sourceOutcome: 'success',
  autoDerived: true,
  showToNonDevelopers: true,
  insight: 'Volume was adjusted within safe range (0-100 dB)',
  recommendedAction: 'No action needed; volume is within safe limits.',
};

const validInventoryReceipt: DeviceInventoryReceipt = {
  id: 'inv-001',
  schemaVersion: DEVICE_INVENTORY_RECEIPT_VERSION,
  inventoriedAt: '2026-05-18T12:00:00Z',
  inventoriedBy: 'holoshell-device-lab',
  devices: [validDeviceIdentity],
  deviceCount: 1,
  categoriesFound: ['headset'],
  hardwareProbeCompleted: true,
  warnings: [],
  hash: 'sha256-inventory-hash',
  hashAlgorithm: 'sha256',
};

const validEnvelopeReceipt: DeviceSafetyEnvelopeReceipt = {
  id: 'env-001',
  schemaVersion: DEVICE_SAFETY_ENVELOPE_RECEIPT_VERSION,
  createdAt: '2026-05-18T12:00:00Z',
  device: validDeviceIdentity,
  consentScopes: ['allowDeviceRead', 'allowHaptic'],
  actionClass: 'haptic',
  riskLevel: 'low',
  safeRanges: [validSafeRange],
  commandPreview: 'set-volume --device quest-3 --level 50',
  commandPreviewHash: 'sha256-cmd-hash',
  commandPreviewContainsAbsolutePaths: false,
  privacyRedactions: [validRedaction],
  requiresFreshUserGesture: true,
  deviceMutationAllowed: false,
  reversible: true,
  rollbackNote: 'Volume can be restored to previous level from snapshot.',
  nonce: 'nonce-abc123',
  hash: 'sha256-envelope-hash',
  hashAlgorithm: 'sha256',
};

const validConsentReceipt: ConsentReceipt = {
  id: 'con-001',
  schemaVersion: DEVICE_CONSENT_RECEIPT_VERSION,
  deviceId: 'quest-3-bt-aabbcc1122',
  deviceLabel: 'Quest 3 (Bluetooth)',
  consentedScopes: ['allowDeviceRead', 'allowHaptic'],
  actionClass: 'haptic',
  riskLevelAcknowledged: 'low',
  consentedAt: '2026-05-18T12:00:00Z',
  freshUserGesture: true,
  envelopeNonce: 'nonce-abc123',
  hiddenAutomationUsed: false,
  credentialAdjacent: true,
  credentialExtrusionAllowed: false,
  hash: 'sha256-consent-hash',
  hashAlgorithm: 'sha256',
};

const validActionReceipt: DeviceActionReceipt = {
  id: 'act-001',
  schemaVersion: DEVICE_ACTION_RECEIPT_VERSION,
  envelopeReceiptId: 'env-001',
  consentReceiptId: 'con-001',
  device: validDeviceIdentity,
  actionClass: 'haptic',
  outcome: 'success',
  startedAt: '2026-05-18T12:00:00Z',
  completedAt: '2026-05-18T12:00:01Z',
  durationMs: 1000,
  beforeState: validBeforeSnapshot,
  afterState: validAfterSnapshot,
  deviceMutationPerformed: false,
  safeRangeViolationOccurred: false,
  safeRangeViolations: [],
  privacyRedactions: [validRedaction],
  replayable: true,
  rollbackNote: 'Volume can be restored to previous level from snapshot.',
  warnings: [],
  hash: 'sha256-action-hash',
  hashAlgorithm: 'sha256',
};

const validReplayLesson: ReplayLessonReceipt = {
  id: 'rpl-001',
  schemaVersion: REPLAY_LESSON_RECEIPT_VERSION,
  sourceActionReceiptId: 'act-001',
  device: validDeviceIdentity,
  lessons: [validLesson],
  generatedAt: '2026-05-18T12:00:01Z',
  replayable: true,
  replayKey: 'replay-key-xyz',
  originalMutationPerformed: false,
  originalRollbackNote: 'Volume can be restored to previous level from snapshot.',
  hash: 'sha256-replay-hash',
  hashAlgorithm: 'sha256',
};

// ── Type guard tests ──

describe('Device Safety Receipts — type guards', () => {
  it('validates supported device categories', () => {
    expect(isSupportedDeviceCategory('headset')).toBe(true);
    expect(isSupportedDeviceCategory('phone')).toBe(true);
    expect(isSupportedDeviceCategory('unknown_device')).toBe(false);
  });

  it('validates supported consent scopes', () => {
    expect(isSupportedDeviceConsentScope('allowDeviceRead')).toBe(true);
    expect(isSupportedDeviceConsentScope('allowHaptic')).toBe(true);
    expect(isSupportedDeviceConsentScope('allowEverything')).toBe(false);
  });

  it('validates supported action classes', () => {
    expect(isSupportedDeviceActionClass('read')).toBe(true);
    expect(isSupportedDeviceActionClass('command')).toBe(true);
    expect(isSupportedDeviceActionClass('destroy')).toBe(false);
  });

  it('validates supported action outcomes', () => {
    expect(isSupportedDeviceActionOutcome('success')).toBe(true);
    expect(isSupportedDeviceActionOutcome('safe_stop')).toBe(true);
    expect(isSupportedDeviceActionOutcome('pending')).toBe(false);
  });

  it('validates supported replay lesson kinds', () => {
    expect(isSupportedReplayLessonKind('command_success')).toBe(true);
    expect(isSupportedReplayLessonKind('safe_stop')).toBe(true);
    expect(isSupportedReplayLessonKind('unknown_event')).toBe(false);
  });
});

// ── Constant exhaustiveness ──

describe('Device Safety Receipts — constants', () => {
  it('DEVICE_CATEGORIES has expected entries', () => {
    expect(DEVICE_CATEGORIES).toContain('headset');
    expect(DEVICE_CATEGORIES).toContain('phone');
    expect(DEVICE_CATEGORIES).toContain('webcam');
    expect(DEVICE_CATEGORIES).toContain('gpu');
    expect(DEVICE_CATEGORIES).toContain('wallet');
    expect(DEVICE_CATEGORIES.length).toBeGreaterThan(5);
  });

  it('DEVICE_CONSENT_SCOPES has expected entries', () => {
    expect(DEVICE_CONSENT_SCOPES).toContain('allowDeviceRead');
    expect(DEVICE_CONSENT_SCOPES).toContain('allowHaptic');
    expect(DEVICE_CONSENT_SCOPES).toContain('allowXrSession');
    expect(DEVICE_CONSENT_SCOPES.length).toBeGreaterThan(5);
  });

  it('DEVICE_ACTION_CLASSES has expected entries', () => {
    expect(DEVICE_ACTION_CLASSES).toContain('read');
    expect(DEVICE_ACTION_CLASSES).toContain('command');
    expect(DEVICE_ACTION_CLASSES).toContain('haptic');
    expect(DEVICE_ACTION_CLASSES).toContain('factory_reset');
  });

  it('DEVICE_ACTION_OUTCOMES has expected entries', () => {
    expect(DEVICE_ACTION_OUTCOMES).toContain('success');
    expect(DEVICE_ACTION_OUTCOMES).toContain('safe_stop');
    expect(DEVICE_ACTION_OUTCOMES).toContain('blocked');
  });

  it('REPLAY_LESSON_KINDS has expected entries', () => {
    expect(REPLAY_LESSON_KINDS).toContain('command_success');
    expect(REPLAY_LESSON_KINDS).toContain('safe_stop');
    expect(REPLAY_LESSON_KINDS).toContain('blocked_action');
  });

  it('PRIVACY_REDACTION_LEVELS has expected entries', () => {
    expect(PRIVACY_REDACTION_LEVELS).toContain('full');
    expect(PRIVACY_REDACTION_LEVELS).toContain('hash_only');
    expect(PRIVACY_REDACTION_LEVELS).toContain('none');
  });
});

// ── DeviceInventoryReceipt validator ──

describe('DeviceInventoryReceipt validator', () => {
  it('accepts a valid inventory receipt', () => {
    const errors = validateDeviceInventoryReceipt(validInventoryReceipt);
    expect(errors).toEqual([]);
  });

  it('rejects missing id', () => {
    const errors = validateDeviceInventoryReceipt({ ...validInventoryReceipt, id: '' });
    expect(errors).toContain('DeviceInventoryReceipt.id is required.');
  });

  it('rejects wrong schema version', () => {
    const errors = validateDeviceInventoryReceipt({
      ...validInventoryReceipt,
      schemaVersion: 'holoscript-device-inventory-receipt/v99',
    });
    expect(errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects empty devices array', () => {
    const errors = validateDeviceInventoryReceipt({
      ...validInventoryReceipt,
      devices: [],
      deviceCount: 0,
    });
    expect(errors.some((e) => e.includes('devices must include'))).toBe(true);
  });

  it('rejects deviceCount/devices mismatch', () => {
    const errors = validateDeviceInventoryReceipt({
      ...validInventoryReceipt,
      deviceCount: 5,
    });
    expect(errors.some((e) => e.includes('deviceCount must match'))).toBe(true);
  });

  it('rejects invalid device identity source', () => {
    const badDevice = {
      ...validDeviceIdentity,
      identitySource: 'telepathy' as DeviceIdentityEntry['identitySource'],
    };
    const errors = validateDeviceInventoryReceipt({
      ...validInventoryReceipt,
      devices: [badDevice],
    });
    expect(errors.some((e) => e.includes('identitySource is unsupported'))).toBe(true);
  });

  it('rejects invalid device category', () => {
    const badDevice = {
      ...validDeviceIdentity,
      category: 'spaceship' as DeviceIdentityEntry['category'],
    };
    const errors = validateDeviceInventoryReceipt({
      ...validInventoryReceipt,
      devices: [badDevice],
    });
    expect(errors.some((e) => e.includes('category is unsupported'))).toBe(true);
  });

  it('rejects missing hash fields', () => {
    const errors = validateDeviceInventoryReceipt({
      ...validInventoryReceipt,
      hash: '',
      hashAlgorithm: undefined as unknown as 'sha256',
    });
    expect(errors.some((e) => e.includes('hash is required'))).toBe(true);
    expect(errors.some((e) => e.includes('hashAlgorithm is required'))).toBe(true);
  });
});

// ── DeviceSafetyEnvelopeReceipt validator ──

describe('DeviceSafetyEnvelopeReceipt validator', () => {
  it('accepts a valid envelope receipt', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt(validEnvelopeReceipt);
    expect(errors).toEqual([]);
  });

  it('rejects missing nonce', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      nonce: '',
    });
    expect(errors).toContain('DeviceSafetyEnvelopeReceipt.nonce is required.');
  });

  it('rejects absolute paths in command preview', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      commandPreview: 'run C:\\Users\\secret\\config.exe',
      commandPreviewContainsAbsolutePaths: false,
    });
    expect(errors.some((e) => e.includes('must not expose absolute local paths'))).toBe(true);
  });

  it('rejects commandPreviewContainsAbsolutePaths=true', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      commandPreviewContainsAbsolutePaths: true as false,
    });
    expect(errors.some((e) => e.includes('commandPreviewContainsAbsolutePaths must be false'))).toBe(true);
  });

  it('rejects invalid consent scopes', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      consentScopes: ['allowEverything' as ConsentReceipt['consentedScopes'][number]],
    });
    expect(errors.some((e) => e.includes('unsupported scope'))).toBe(true);
  });

  it('rejects invalid action class', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      actionClass: 'teleport' as DeviceSafetyEnvelopeReceipt['actionClass'],
    });
    expect(errors.some((e) => e.includes('actionClass is unsupported'))).toBe(true);
  });

  it('rejects invalid risk level', () => {
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      riskLevel: 'extreme' as DeviceSafetyEnvelopeReceipt['riskLevel'],
    });
    expect(errors.some((e) => e.includes('riskLevel is unsupported'))).toBe(true);
  });

  it('validates safe ranges correctly', () => {
    const badRange: DeviceSafeRange = {
      parameter: 'volume',
      unit: 'dB',
      min: 100,
      max: 50,
      defaultValue: 75,
      autoStopOnViolation: true,
    };
    const errors = validateDeviceSafetyEnvelopeReceipt({
      ...validEnvelopeReceipt,
      safeRanges: [badRange],
    });
    expect(errors.some((e) => e.includes('max must be >= min'))).toBe(true);
  });
});

// ── ConsentReceipt validator ──

describe('ConsentReceipt validator', () => {
  it('accepts a valid consent receipt', () => {
    const errors = validateConsentReceipt(validConsentReceipt);
    expect(errors).toEqual([]);
  });

  it('rejects freshUserGesture=false', () => {
    const errors = validateConsentReceipt({
      ...validConsentReceipt,
      freshUserGesture: false as true,
    });
    expect(errors.some((e) => e.includes('freshUserGesture must be true'))).toBe(true);
  });

  it('rejects hiddenAutomationUsed=true', () => {
    const errors = validateConsentReceipt({
      ...validConsentReceipt,
      hiddenAutomationUsed: true as false,
    });
    expect(errors.some((e) => e.includes('hiddenAutomationUsed must be false'))).toBe(true);
  });

  it('rejects credentialExtrusionAllowed=true', () => {
    const errors = validateConsentReceipt({
      ...validConsentReceipt,
      credentialExtrusionAllowed: true as false,
    });
    expect(errors.some((e) => e.includes('credentialExtrusionAllowed must be false'))).toBe(true);
  });

  it('rejects missing envelopeNonce', () => {
    const errors = validateConsentReceipt({
      ...validConsentReceipt,
      envelopeNonce: '',
    });
    expect(errors).toContain('ConsentReceipt.envelopeNonce is required.');
  });
});

// ── DeviceActionReceipt validator ──

describe('DeviceActionReceipt validator', () => {
  it('accepts a valid action receipt', () => {
    const errors = validateDeviceActionReceipt(validActionReceipt);
    expect(errors).toEqual([]);
  });

  it('rejects missing envelope receipt id', () => {
    const errors = validateDeviceActionReceipt({
      ...validActionReceipt,
      envelopeReceiptId: '',
    });
    expect(errors).toContain('DeviceActionReceipt.envelopeReceiptId is required.');
  });

  it('rejects missing consent receipt id', () => {
    const errors = validateDeviceActionReceipt({
      ...validActionReceipt,
      consentReceiptId: '',
    });
    expect(errors).toContain('DeviceActionReceipt.consentReceiptId is required.');
  });

  it('rejects invalid outcome', () => {
    const errors = validateDeviceActionReceipt({
      ...validActionReceipt,
      outcome: 'pending' as DeviceActionReceipt['outcome'],
    });
    expect(errors.some((e) => e.includes('outcome is unsupported'))).toBe(true);
  });

  it('rejects negative duration', () => {
    const errors = validateDeviceActionReceipt({
      ...validActionReceipt,
      durationMs: -1,
    });
    expect(errors.some((e) => e.includes('durationMs must be a non-negative'))).toBe(true);
  });

  it('rejects state snapshot with absolute paths', () => {
    const badSnapshot: DeviceStateSnapshot = {
      ...validBeforeSnapshot,
      containsAbsolutePaths: true as false,
    };
    const errors = validateDeviceActionReceipt({
      ...validActionReceipt,
      beforeState: badSnapshot,
    });
    expect(errors.some((e) => e.includes('containsAbsolutePaths must be false'))).toBe(true);
  });

  it('rejects missing state snapshot', () => {
    const errors = validateDeviceActionReceipt({
      ...validActionReceipt,
      beforeState: undefined as unknown as DeviceStateSnapshot,
    });
    expect(errors.some((e) => e.includes('beforeState is required'))).toBe(true);
  });
});

// ── ReplayLessonReceipt validator ──

describe('ReplayLessonReceipt validator', () => {
  it('accepts a valid replay lesson receipt', () => {
    const errors = validateReplayLessonReceipt(validReplayLesson);
    expect(errors).toEqual([]);
  });

  it('rejects missing source action receipt id', () => {
    const errors = validateReplayLessonReceipt({
      ...validReplayLesson,
      sourceActionReceiptId: '',
    });
    expect(errors).toContain('ReplayLessonReceipt.sourceActionReceiptId is required.');
  });

  it('rejects empty lessons array', () => {
    const errors = validateReplayLessonReceipt({
      ...validReplayLesson,
      lessons: [],
    });
    expect(errors.some((e) => e.includes('lessons must include at least one'))).toBe(true);
  });

  it('rejects invalid lesson kind', () => {
    const badLesson: ReplayLessonEntry = {
      ...validLesson,
      kind: 'unknown_event' as ReplayLessonEntry['kind'],
    };
    const errors = validateReplayLessonReceipt({
      ...validReplayLesson,
      lessons: [badLesson],
    });
    expect(errors.some((e) => e.includes('kind is unsupported'))).toBe(true);
  });

  it('rejects missing lesson insight', () => {
    const badLesson: ReplayLessonEntry = {
      ...validLesson,
      insight: '',
    };
    const errors = validateReplayLessonReceipt({
      ...validReplayLesson,
      lessons: [badLesson],
    });
    expect(errors.some((e) => e.includes('insight is required'))).toBe(true);
  });
});

// ── Composite Pack validator ──

describe('HoloShellDeviceSafetyReceiptPack validator', () => {
  const validPack: HoloShellDeviceSafetyReceiptPack = {
    id: 'pack-001',
    inventory: validInventoryReceipt,
    envelope: validEnvelopeReceipt,
    consent: validConsentReceipt,
    action: validActionReceipt,
    replay: validReplayLesson,
    status: 'completed',
    hash: 'sha256-pack-hash',
    hashAlgorithm: 'sha256',
  };

  it('accepts a valid complete pack', () => {
    const errors = validateHoloShellDeviceSafetyReceiptPack(validPack);
    expect(errors).toEqual([]);
  });

  it('accepts a valid planned pack without action/replay', () => {
    const plannedPack: HoloShellDeviceSafetyReceiptPack = {
      ...validPack,
      action: undefined,
      replay: undefined,
      status: 'planned',
    };
    const errors = validateHoloShellDeviceSafetyReceiptPack(plannedPack);
    expect(errors).toEqual([]);
  });

  it('rejects completed status without action', () => {
    const incompletePack: HoloShellDeviceSafetyReceiptPack = {
      ...validPack,
      action: undefined,
      status: 'completed',
    };
    const errors = validateHoloShellDeviceSafetyReceiptPack(incompletePack);
    expect(errors.some((e) => e.includes('action is required when status=completed'))).toBe(true);
  });

  it('rejects missing inventory', () => {
    const errors = validateHoloShellDeviceSafetyReceiptPack({
      ...validPack,
      inventory: undefined as unknown as DeviceInventoryReceipt,
    });
    expect(errors.some((e) => e.includes('inventory is required'))).toBe(true);
  });

  it('rejects missing envelope', () => {
    const errors = validateHoloShellDeviceSafetyReceiptPack({
      ...validPack,
      envelope: undefined as unknown as DeviceSafetyEnvelopeReceipt,
    });
    expect(errors.some((e) => e.includes('envelope is required'))).toBe(true);
  });

  it('rejects invalid status', () => {
    const errors = validateHoloShellDeviceSafetyReceiptPack({
      ...validPack,
      status: 'unknown' as HoloShellDeviceSafetyReceiptPack['status'],
    });
    expect(errors.some((e) => e.includes('status is unsupported'))).toBe(true);
  });
});

// ── Clone helpers ──

describe('Device Safety Receipts — clone helpers', () => {
  it('clones DeviceInventoryReceipt deeply', () => {
    const cloned = cloneDeviceInventoryReceipt(validInventoryReceipt);
    expect(cloned).toEqual(validInventoryReceipt);
    expect(cloned).not.toBe(validInventoryReceipt);
    expect(cloned.devices).not.toBe(validInventoryReceipt.devices);
    expect(cloned.devices[0]).not.toBe(validInventoryReceipt.devices[0]);
  });

  it('clones DeviceSafetyEnvelopeReceipt deeply', () => {
    const cloned = cloneDeviceSafetyEnvelopeReceipt(validEnvelopeReceipt);
    expect(cloned).toEqual(validEnvelopeReceipt);
    expect(cloned).not.toBe(validEnvelopeReceipt);
    expect(cloned.consentScopes).not.toBe(validEnvelopeReceipt.consentScopes);
    expect(cloned.safeRanges).not.toBe(validEnvelopeReceipt.safeRanges);
    expect(cloned.privacyRedactions).not.toBe(validEnvelopeReceipt.privacyRedactions);
  });

  it('clones ConsentReceipt deeply', () => {
    const cloned = cloneConsentReceipt(validConsentReceipt);
    expect(cloned).toEqual(validConsentReceipt);
    expect(cloned).not.toBe(validConsentReceipt);
    expect(cloned.consentedScopes).not.toBe(validConsentReceipt.consentedScopes);
  });

  it('clones DeviceActionReceipt deeply', () => {
    const cloned = cloneDeviceActionReceipt(validActionReceipt);
    expect(cloned).toEqual(validActionReceipt);
    expect(cloned).not.toBe(validActionReceipt);
    expect(cloned.safeRangeViolations).not.toBe(validActionReceipt.safeRangeViolations);
  });

  it('clones ReplayLessonReceipt deeply', () => {
    const cloned = cloneReplayLessonReceipt(validReplayLesson);
    expect(cloned).toEqual(validReplayLesson);
    expect(cloned).not.toBe(validReplayLesson);
    expect(cloned.lessons).not.toBe(validReplayLesson.lessons);
  });

  it('clones HoloShellDeviceSafetyReceiptPack deeply', () => {
    const pack: HoloShellDeviceSafetyReceiptPack = {
      id: 'pack-001',
      inventory: validInventoryReceipt,
      envelope: validEnvelopeReceipt,
      consent: validConsentReceipt,
      action: validActionReceipt,
      replay: validReplayLesson,
      status: 'completed',
      hash: 'sha256-pack-hash',
      hashAlgorithm: 'sha256',
    };
    const cloned = cloneHoloShellDeviceSafetyReceiptPack(pack);
    expect(cloned).toEqual(pack);
    expect(cloned).not.toBe(pack);
    expect(cloned.inventory).not.toBe(pack.inventory);
    expect(cloned.envelope).not.toBe(pack.envelope);
    expect(cloned.consent).not.toBe(pack.consent);
    expect(cloned.action).not.toBe(pack.action);
    expect(cloned.replay).not.toBe(pack.replay);
  });
});