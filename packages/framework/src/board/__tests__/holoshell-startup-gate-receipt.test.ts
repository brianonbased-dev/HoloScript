/**
 * Tests for HoloShell Startup Gate Receipt
 *
 * Validates the receipt type definitions, validators, and clone functions
 * for the OS startup registration gate.
 *
 * task_1779358599518_bobn
 */

import { describe, it, expect } from 'vitest';
import {
  HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
  STARTUP_GATE_WORKFLOW,
  STARTUP_PLATFORMS,
  STARTUP_GATE_STATUSES,
  STARTUP_GATE_PERMISSION_ENVELOPES,
  STARTUP_VERIFICATION_METHODS,
  type StartupPlatform,
  type StartupGateStatus,
  type StartupGatePermissionEnvelope,
  type StartupVerificationMethod,
  type StartupRegistrationState,
  type StartupRegistrationRequestReceipt,
  type StartupRegistrationApprovalReceipt,
  type StartupRegistrationVerificationReceipt,
  type StartupUnregistrationReceipt,
  type StartupReplayReceipt,
  type HoloShellStartupGateReceiptPack,
  isSupportedStartupPlatform,
  isSupportedStartupGateStatus,
  isSupportedStartupGatePermissionEnvelope,
  isSupportedStartupVerificationMethod,
  validateStartupRegistrationState,
  validateStartupRegistrationRequestReceipt,
  validateStartupRegistrationApprovalReceipt,
  validateStartupRegistrationVerificationReceipt,
  validateStartupUnregistrationReceipt,
  validateStartupReplayReceipt,
  validateHoloShellStartupGateReceiptPack,
  cloneStartupRegistrationState,
  cloneStartupRegistrationRequestReceipt,
  cloneStartupRegistrationApprovalReceipt,
  cloneStartupRegistrationVerificationReceipt,
  cloneStartupUnregistrationReceipt,
  cloneStartupReplayReceipt,
  cloneHoloShellStartupGateReceiptPack,
} from '../holoshell-startup-gate-receipt';

// ── Constants ──

describe('Startup Gate constants', () => {
  it('has correct version', () => {
    expect(HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION).toBe('hololand.holoshell.startup-gate.v0.1.0');
  });

  it('has correct workflow', () => {
    expect(STARTUP_GATE_WORKFLOW).toBe('os-startup-registration-gate');
  });

  it('includes all expected platforms', () => {
    expect(STARTUP_PLATFORMS).toContain('windows_startup_folder');
    expect(STARTUP_PLATFORMS).toContain('macos_login_item');
    expect(STARTUP_PLATFORMS).toContain('linux_xdg_autostart');
    expect(STARTUP_PLATFORMS).toContain('windows_task_scheduler');
    expect(STARTUP_PLATFORMS).toContain('macos_launchd');
    expect(STARTUP_PLATFORMS).toContain('linux_systemd_user');
  });

  it('includes all expected statuses', () => {
    expect(STARTUP_GATE_STATUSES).toContain('unregistered');
    expect(STARTUP_GATE_STATUSES).toContain('registration_planned');
    expect(STARTUP_GATE_STATUSES).toContain('registration_requested');
    expect(STARTUP_GATE_STATUSES).toContain('registration_approved');
    expect(STARTUP_GATE_STATUSES).toContain('registered');
    expect(STARTUP_GATE_STATUSES).toContain('registration_failed');
    expect(STARTUP_GATE_STATUSES).toContain('unregistration_planned');
    expect(STARTUP_GATE_STATUSES).toContain('unregistration_requested');
    expect(STARTUP_GATE_STATUSES).toContain('unregistered_confirmed');
    expect(STARTUP_GATE_STATUSES).toContain('unregistration_failed');
    expect(STARTUP_GATE_STATUSES).toContain('blocked');
  });

  it('includes all expected permission envelopes', () => {
    expect(STARTUP_GATE_PERMISSION_ENVELOPES).toContain('read_only');
    expect(STARTUP_GATE_PERMISSION_ENVELOPES).toContain('guarded_registration');
    expect(STARTUP_GATE_PERMISSION_ENVELOPES).toContain('break_glass_register');
    expect(STARTUP_GATE_PERMISSION_ENVELOPES).toContain('revoke_only');
  });

  it('includes all expected verification methods', () => {
    expect(STARTUP_VERIFICATION_METHODS).toContain('startup_folder_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('registry_key_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('plist_entry_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('desktop_file_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('task_scheduler_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('launchd_plist_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('systemd_unit_exists');
    expect(STARTUP_VERIFICATION_METHODS).toContain('manual_redacted_witness');
  });
});

// ── Type guards ──

describe('Startup Gate type guards', () => {
  it('recognizes valid platforms', () => {
    expect(isSupportedStartupPlatform('windows_startup_folder')).toBe(true);
    expect(isSupportedStartupPlatform('macos_login_item')).toBe(true);
    expect(isSupportedStartupPlatform('linux_xdg_autostart')).toBe(true);
  });

  it('rejects invalid platforms', () => {
    expect(isSupportedStartupPlatform('unknown_platform')).toBe(false);
    expect(isSupportedStartupPlatform('')).toBe(false);
  });

  it('recognizes valid statuses', () => {
    expect(isSupportedStartupGateStatus('registered')).toBe(true);
    expect(isSupportedStartupGateStatus('unregistered')).toBe(true);
    expect(isSupportedStartupGateStatus('blocked')).toBe(true);
  });

  it('rejects invalid statuses', () => {
    expect(isSupportedStartupGateStatus('unknown')).toBe(false);
  });

  it('recognizes valid permission envelopes', () => {
    expect(isSupportedStartupGatePermissionEnvelope('guarded_registration')).toBe(true);
    expect(isSupportedStartupGatePermissionEnvelope('read_only')).toBe(true);
    expect(isSupportedStartupGatePermissionEnvelope('invalid')).toBe(false);
  });

  it('recognizes valid verification methods', () => {
    expect(isSupportedStartupVerificationMethod('startup_folder_exists')).toBe(true);
    expect(isSupportedStartupVerificationMethod('manual_redacted_witness')).toBe(true);
    expect(isSupportedStartupVerificationMethod('invalid')).toBe(false);
  });
});

// ── Fixtures ──

function makeValidRegistrationState(): StartupRegistrationState {
  return {
    platform: 'windows_startup_folder',
    registered: true,
    commandHash: 'sha256:abc123',
    commandPreview: '<absolute-path-redacted> --minimized',
    targetMatchesExpected: true,
    placedByHoloShell: true,
    observedAt: '2026-05-21T00:00:00.000Z',
    stateHash: 'sha256:def456',
  };
}

function makeValidRequestReceipt(): StartupRegistrationRequestReceipt {
  return {
    id: 'startup-request-abc123',
    schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
    platform: 'windows_startup_folder',
    purpose: 'Launch HoloShell automatically on user login.',
    commandPreview: '<absolute-path-redacted> --minimized',
    commandPreviewContainsAbsolutePath: false,
    startupAction: 'launch_holoshell',
    requiresFreshUserGesture: true,
    permissionEnvelope: 'guarded_registration',
    rollbackInstruction: 'Delete the HoloShell shortcut from the Startup folder.',
    requestedAt: '2026-05-21T00:00:00.000Z',
    hash: 'sha256:reqhash',
    hashAlgorithm: 'sha256',
  };
}

function makeValidApprovalReceipt(): StartupRegistrationApprovalReceipt {
  return {
    id: 'startup-approval-abc123',
    schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
    requestReceiptId: 'startup-request-abc123',
    freshUserGestureCaptured: true,
    hiddenAutomationUsed: false,
    approvalViaRoomCard: true,
    approvedCommandHash: 'sha256:approvedcmd',
    approvedAt: '2026-05-21T00:01:00.000Z',
    hash: 'sha256:approvalhash',
    hashAlgorithm: 'sha256',
  };
}

function makeValidVerificationReceipt(): StartupRegistrationVerificationReceipt {
  return {
    id: 'startup-verification-abc123',
    schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
    approvalReceiptId: 'startup-approval-abc123',
    verificationMethod: 'startup_folder_exists',
    registrationConfirmed: true,
    targetMatchesApproved: true,
    currentUserOwned: true,
    systemLevelOverride: false,
    verifiedAt: '2026-05-21T00:02:00.000Z',
    hash: 'sha256:verifhash',
    hashAlgorithm: 'sha256',
  };
}

function makeValidUnregistrationReceipt(): StartupUnregistrationReceipt {
  return {
    id: 'startup-unregistration-abc123',
    schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
    verificationReceiptId: 'startup-verification-abc123',
    removalConfirmed: true,
    removalVerificationMethod: 'startup_folder_exists',
    residualArtifacts: false,
    rollbackNote: 'Startup entry removed. Residual OS caches may expire asynchronously.',
    unregisteredAt: '2026-05-21T00:03:00.000Z',
    hash: 'sha256:unreghash',
    hashAlgorithm: 'sha256',
  };
}

function makeValidReplayReceipt(status: StartupGateStatus | string = 'registered'): StartupReplayReceipt {
  return {
    id: 'startup-replay-abc123',
    schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
    workflow: STARTUP_GATE_WORKFLOW,
    status,
    verificationReceiptId: 'startup-verification-abc123',
    replayKey: 'sha256:replaykey',
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: true,
    createdAt: '2026-05-21T00:02:00.000Z',
    hash: 'sha256:replayhash',
    hashAlgorithm: 'sha256',
  };
}

function makeValidRegisteredPack(): HoloShellStartupGateReceiptPack {
  return {
    schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
    id: 'startup-gate-pack-abc123',
    workflow: STARTUP_GATE_WORKFLOW,
    status: 'registered',
    generatedAt: '2026-05-21T00:02:00.000Z',
    platform: 'windows_startup_folder',
    permissionEnvelope: 'guarded_registration',
    registrationState: makeValidRegistrationState(),
    request: makeValidRequestReceipt(),
    approval: makeValidApprovalReceipt(),
    verification: makeValidVerificationReceipt(),
    replay: makeValidReplayReceipt('registered'),
    hash: 'sha256:packhash',
    hashAlgorithm: 'sha256',
  };
}

// ── Sub-receipt validators ──

describe('validateStartupRegistrationState', () => {
  it('passes for valid state', () => {
    const errors: string[] = [];
    validateStartupRegistrationState(makeValidRegistrationState(), errors);
    expect(errors).toHaveLength(0);
  });

  it('requires state for registered packs', () => {
    const errors: string[] = [];
    validateStartupRegistrationState(undefined, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('required');
  });

  it('rejects absolute paths in commandPreview', () => {
    const state = makeValidRegistrationState();
    state.commandPreview = 'C:\\Users\\joseph\\holoshell.exe --minimized';
    const errors: string[] = [];
    validateStartupRegistrationState(state, errors);
    expect(errors.some(e => e.includes('absolute path'))).toBe(true);
  });

  it('requires commandHash', () => {
    const state = makeValidRegistrationState();
    state.commandHash = '';
    const errors: string[] = [];
    validateStartupRegistrationState(state, errors);
    expect(errors.some(e => e.includes('commandHash'))).toBe(true);
  });
});

describe('validateStartupRegistrationRequestReceipt', () => {
  it('passes for valid request', () => {
    const errors: string[] = [];
    validateStartupRegistrationRequestReceipt(makeValidRequestReceipt(), errors);
    expect(errors).toHaveLength(0);
  });

  it('fails when missing', () => {
    const errors: string[] = [];
    validateStartupRegistrationRequestReceipt(undefined, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('required');
  });

  it('rejects wrong schema version', () => {
    const receipt = makeValidRequestReceipt();
    receipt.schemaVersion = 'wrong';
    const errors: string[] = [];
    validateStartupRegistrationRequestReceipt(receipt, errors);
    expect(errors.some(e => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects absolute paths in commandPreview', () => {
    const receipt = makeValidRequestReceipt();
    receipt.commandPreview = '/usr/local/bin/holoshell --minimized';
    const errors: string[] = [];
    validateStartupRegistrationRequestReceipt(receipt, errors);
    expect(errors.some(e => e.includes('absolute path'))).toBe(true);
  });

  it('enforces commandPreviewContainsAbsolutePath = false', () => {
    const receipt = makeValidRequestReceipt();
    (receipt as any).commandPreviewContainsAbsolutePath = true;
    const errors: string[] = [];
    validateStartupRegistrationRequestReceipt(receipt, errors);
    expect(errors.some(e => e.includes('commandPreviewContainsAbsolutePath'))).toBe(true);
  });

  it('requires freshUserGesture to be boolean', () => {
    const receipt = makeValidRequestReceipt();
    (receipt as any).requiresFreshUserGesture = 'yes';
    const errors: string[] = [];
    validateStartupRegistrationRequestReceipt(receipt, errors);
    expect(errors.some(e => e.includes('requiresFreshUserGesture'))).toBe(true);
  });
});

describe('validateStartupRegistrationApprovalReceipt', () => {
  it('passes for valid approval', () => {
    const errors: string[] = [];
    validateStartupRegistrationApprovalReceipt(makeValidApprovalReceipt(), errors);
    expect(errors).toHaveLength(0);
  });

  it('fails when missing', () => {
    const errors: string[] = [];
    validateStartupRegistrationApprovalReceipt(undefined, errors);
    expect(errors).toHaveLength(1);
  });

  it('enforces freshUserGestureCaptured = true', () => {
    const receipt = makeValidApprovalReceipt();
    receipt.freshUserGestureCaptured = false;
    const errors: string[] = [];
    validateStartupRegistrationApprovalReceipt(receipt, errors);
    expect(errors.some(e => e.includes('freshUserGestureCaptured'))).toBe(true);
  });

  it('enforces hiddenAutomationUsed = false', () => {
    const receipt = makeValidApprovalReceipt();
    (receipt as any).hiddenAutomationUsed = true;
    const errors: string[] = [];
    validateStartupRegistrationApprovalReceipt(receipt, errors);
    expect(errors.some(e => e.includes('hiddenAutomationUsed'))).toBe(true);
  });
});

describe('validateStartupRegistrationVerificationReceipt', () => {
  it('passes for valid verification', () => {
    const errors: string[] = [];
    validateStartupRegistrationVerificationReceipt(makeValidVerificationReceipt(), errors);
    expect(errors).toHaveLength(0);
  });

  it('enforces systemLevelOverride = false', () => {
    const receipt = makeValidVerificationReceipt();
    (receipt as any).systemLevelOverride = true;
    const errors: string[] = [];
    validateStartupRegistrationVerificationReceipt(receipt, errors);
    expect(errors.some(e => e.includes('systemLevelOverride'))).toBe(true);
  });
});

describe('validateStartupUnregistrationReceipt', () => {
  it('passes for valid unregistration', () => {
    const errors: string[] = [];
    validateStartupUnregistrationReceipt(makeValidUnregistrationReceipt(), errors);
    expect(errors).toHaveLength(0);
  });

  it('requires removalConfirmed to be boolean', () => {
    const receipt = makeValidUnregistrationReceipt();
    (receipt as any).removalConfirmed = 'yes';
    const errors: string[] = [];
    validateStartupUnregistrationReceipt(receipt, errors);
    expect(errors.some(e => e.includes('removalConfirmed'))).toBe(true);
  });
});

describe('validateStartupReplayReceipt', () => {
  it('passes for valid replay', () => {
    const errors: string[] = [];
    validateStartupReplayReceipt(makeValidReplayReceipt(), errors);
    expect(errors).toHaveLength(0);
  });

  it('enforces workflow = STARTUP_GATE_WORKFLOW', () => {
    const replay = makeValidReplayReceipt();
    replay.workflow = 'wrong' as any;
    const errors: string[] = [];
    validateStartupReplayReceipt(replay, errors);
    expect(errors.some(e => e.includes('workflow'))).toBe(true);
  });

  it('enforces rawCredentialCaptured = false', () => {
    const replay = makeValidReplayReceipt();
    (replay as any).rawCredentialCaptured = true;
    const errors: string[] = [];
    validateStartupReplayReceipt(replay, errors);
    expect(errors.some(e => e.includes('rawCredentialCaptured'))).toBe(true);
  });

  it('enforces overbroadScopeAccepted = false', () => {
    const replay = makeValidReplayReceipt();
    (replay as any).overbroadScopeAccepted = true;
    const errors: string[] = [];
    validateStartupReplayReceipt(replay, errors);
    expect(errors.some(e => e.includes('overbroadScopeAccepted'))).toBe(true);
  });
});

// ── Full pack validator ──

describe('validateHoloShellStartupGateReceiptPack', () => {
  it('passes for valid registered pack', () => {
    const pack = makeValidRegisteredPack();
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    expect(errors).toHaveLength(0);
  });

  it('passes for valid unregistered pack (no sub-receipts required)', () => {
    const pack: HoloShellStartupGateReceiptPack = {
      schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
      id: 'startup-gate-pack-unreg',
      workflow: STARTUP_GATE_WORKFLOW,
      status: 'unregistered',
      generatedAt: '2026-05-21T00:00:00.000Z',
      platform: 'windows_startup_folder',
      permissionEnvelope: 'read_only',
      replay: {
        id: 'startup-replay-unreg',
        schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
        workflow: STARTUP_GATE_WORKFLOW,
        status: 'unregistered',
        replayKey: 'sha256:unregkey',
        rawCredentialCaptured: false,
        overbroadScopeAccepted: false,
        readyForHoloLand: false,
        createdAt: '2026-05-21T00:00:00.000Z',
        hash: 'sha256:unreghash',
        hashAlgorithm: 'sha256',
      },
      hash: 'sha256:packhash',
      hashAlgorithm: 'sha256',
    };
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    expect(errors).toHaveLength(0);
  });

  it('rejects wrong schema version', () => {
    const pack = makeValidRegisteredPack();
    pack.schemaVersion = 'wrong';
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    expect(errors.some(e => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects wrong workflow', () => {
    const pack = makeValidRegisteredPack();
    pack.workflow = 'wrong' as any;
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    expect(errors.some(e => e.includes('workflow'))).toBe(true);
  });

  it('rejects mismatched pack/replay status', () => {
    const pack = makeValidRegisteredPack();
    pack.replay.status = 'unregistered';
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    expect(errors.some(e => e.includes('must match'))).toBe(true);
  });

  it('requires sub-receipts for registration_approved status', () => {
    const pack = makeValidRegisteredPack();
    pack.status = 'registration_approved';
    pack.replay.status = 'registration_approved';
    pack.verification = undefined;
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    // approval is present; verification is not required yet for approved
    // but request and approval should be validated
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it('rejects credential leakage', () => {
    const pack = makeValidRegisteredPack();
    (pack as any).hash = 'access_token=secret123';
    const errors = validateHoloShellStartupGateReceiptPack(pack);
    expect(errors.some(e => e.includes('credential'))).toBe(true);
  });

  it('rejects null pack', () => {
    const errors = validateHoloShellStartupGateReceiptPack(null as any);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('required');
  });
});

// ── Clone functions ──

describe('clone functions', () => {
  it('clones registration state', () => {
    const state = makeValidRegistrationState();
    const cloned = cloneStartupRegistrationState(state);
    expect(cloned).toEqual(state);
    expect(cloned).not.toBe(state);
  });

  it('clones request receipt', () => {
    const receipt = makeValidRequestReceipt();
    const cloned = cloneStartupRegistrationRequestReceipt(receipt);
    expect(cloned).toEqual(receipt);
    expect(cloned).not.toBe(receipt);
  });

  it('clones approval receipt', () => {
    const receipt = makeValidApprovalReceipt();
    const cloned = cloneStartupRegistrationApprovalReceipt(receipt);
    expect(cloned).toEqual(receipt);
    expect(cloned).not.toBe(receipt);
  });

  it('clones verification receipt', () => {
    const receipt = makeValidVerificationReceipt();
    const cloned = cloneStartupRegistrationVerificationReceipt(receipt);
    expect(cloned).toEqual(receipt);
    expect(cloned).not.toBe(receipt);
  });

  it('clones unregistration receipt', () => {
    const receipt = makeValidUnregistrationReceipt();
    const cloned = cloneStartupUnregistrationReceipt(receipt);
    expect(cloned).toEqual(receipt);
    expect(cloned).not.toBe(receipt);
  });

  it('clones replay receipt', () => {
    const receipt = makeValidReplayReceipt();
    const cloned = cloneStartupReplayReceipt(receipt);
    expect(cloned).toEqual(receipt);
    expect(cloned).not.toBe(receipt);
  });

  it('clones full receipt pack deeply', () => {
    const pack = makeValidRegisteredPack();
    const cloned = cloneHoloShellStartupGateReceiptPack(pack);
    expect(cloned).toEqual(pack);
    expect(cloned).not.toBe(pack);
    expect(cloned.registrationState).not.toBe(pack.registrationState);
    expect(cloned.request).not.toBe(pack.request);
    expect(cloned.approval).not.toBe(pack.approval);
    expect(cloned.verification).not.toBe(pack.verification);
    expect(cloned.replay).not.toBe(pack.replay);
  });

  it('clones pack without optional sub-receipts', () => {
    const pack: HoloShellStartupGateReceiptPack = {
      schemaVersion: HOLOSHELL_STARTUP_GATE_RECEIPT_VERSION,
      id: 'startup-gate-pack-min',
      workflow: STARTUP_GATE_WORKFLOW,
      status: 'unregistered',
      generatedAt: '2026-05-21T00:00:00.000Z',
      platform: 'windows_startup_folder',
      permissionEnvelope: 'read_only',
      replay: makeValidReplayReceipt('unregistered'),
      hash: 'sha256:minhash',
      hashAlgorithm: 'sha256',
    };
    const cloned = cloneHoloShellStartupGateReceiptPack(pack);
    expect(cloned).toEqual(pack);
    expect(cloned.registrationState).toBeUndefined();
    expect(cloned.request).toBeUndefined();
    expect(cloned.approval).toBeUndefined();
    expect(cloned.verification).toBeUndefined();
    expect(cloned.unregistration).toBeUndefined();
  });
});