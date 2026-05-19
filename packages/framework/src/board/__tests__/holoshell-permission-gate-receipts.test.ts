import { describe, expect, it } from 'vitest';
import {
  HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
  PERMISSION_GATE_ENVELOPES,
  PERMISSION_GATE_STATUSES,
  PERMISSION_GATE_WORKFLOW,
  PERMISSION_SUBJECT_KINDS,
  PERMISSION_VERIFICATION_METHODS,
  buildPermissionScopeDiff,
  cloneHoloShellPermissionGateReceiptPack,
  evaluatePermissionScopePolicy,
  isSupportedPermissionGateEnvelope,
  isSupportedPermissionGateStatus,
  isSupportedPermissionSubjectKind,
  isSupportedPermissionVerificationMethod,
  normalizePermissionScopeName,
  permissionPreviewHasPublicLeak,
  redactPermissionGatePreview,
  validateHoloShellPermissionGateReceiptPack,
  validatePermissionGrantReceipt,
  validatePermissionReplayReceipt,
  validatePermissionRequestReceipt,
  validatePermissionSubjectReceipt,
  validatePermissionVerificationReceipt,
  type HoloShellPermissionGateReceiptPack,
} from '../holoshell-permission-gate-receipts';

const driveFileScope = {
  scope: 'drive.file',
  purpose: 'Allow HoloLand to read and update only files it creates for a world build.',
  required: true,
  riskLevel: 'medium',
  providerLabel: 'Google Drive per-file app access',
};

const validPack: HoloShellPermissionGateReceiptPack = {
  id: 'permission-gate-pack-001',
  schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
  workflow: PERMISSION_GATE_WORKFLOW,
  status: 'verified',
  subject: {
    id: 'permission-subject-001',
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    subjectKind: 'provider_account',
    provider: 'google',
    redactedSubjectLabel: 'Google Drive account <redacted>',
    subjectLabelHash: 'sha256:subject-label',
    accountLabelHash: 'sha256:account-label',
    browserProfile: 'profile:default-redacted',
    credentialAdjacent: true,
    publicReceiptMayContainAbsolutePath: false,
    credentialExtrusionAllowed: false,
    createdAt: '2026-05-19T16:00:00.000Z',
    hash: 'sha256:subject',
    hashAlgorithm: 'sha256',
  },
  request: {
    id: 'permission-request-001',
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    subjectReceiptId: 'permission-subject-001',
    requestedScopes: [driveFileScope],
    minimumRequiredScopes: [driveFileScope],
    neverScopes: ['*', 'drive', 'admin', 'billing', 'delete', 'full_access'],
    purpose: 'Build a HoloLand world from approved local and cloud files.',
    permissionEnvelope: 'guarded_grant',
    requiresFreshUserGesture: true,
    approvalId: 'approval-permission-001',
    commandOrUrlPreview: 'https://accounts.google.com/o/oauth2/v2/auth?...scope=drive.file',
    commandPreviewContainsAbsolutePaths: false,
    requestedAt: '2026-05-19T16:01:00.000Z',
    expiresAt: '2026-05-19T16:11:00.000Z',
    hash: 'sha256:request',
    hashAlgorithm: 'sha256',
  },
  grant: {
    id: 'permission-grant-001',
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    requestReceiptId: 'permission-request-001',
    grantedScopes: [driveFileScope],
    deniedScopes: [],
    missingRequiredScopes: [],
    extraScopes: [],
    grantObservedAt: '2026-05-19T16:02:00.000Z',
    freshUserGesture: true,
    hiddenAutomationUsed: false,
    rawCredentialCaptured: false,
    tokenReferenceHash: 'sha256:token-reference',
    refreshChainHash: 'sha256:refresh-chain',
    expiresAt: '2026-05-19T17:02:00.000Z',
    revocationInstruction: 'Open provider app permissions and remove HoloLand Builder access.',
    revocationUrlHash: 'sha256:revocation-url',
    hash: 'sha256:grant',
    hashAlgorithm: 'sha256',
  },
  verification: {
    id: 'permission-verification-001',
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    grantReceiptId: 'permission-grant-001',
    verificationMethod: 'oauth_tokeninfo',
    verifiedAt: '2026-05-19T16:03:00.000Z',
    minimumScopeSatisfied: true,
    excessScopesAbsent: true,
    verifiedScopes: [driveFileScope],
    scopeDiffHash: 'sha256:scope-diff',
    readyForHoloLand: true,
    credentialExtrusionAllowed: false,
    publicReceiptMayContainAbsolutePath: false,
    hash: 'sha256:verification',
    hashAlgorithm: 'sha256',
  },
  replay: {
    id: 'permission-replay-001',
    schemaVersion: HOLOSHELL_PERMISSION_GATE_RECEIPT_VERSION,
    workflow: PERMISSION_GATE_WORKFLOW,
    status: 'verified',
    subjectReceiptId: 'permission-subject-001',
    requestReceiptId: 'permission-request-001',
    grantReceiptId: 'permission-grant-001',
    verificationReceiptId: 'permission-verification-001',
    replayKey: 'sha256:permission-gate-replay',
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: true,
    createdAt: '2026-05-19T16:04:00.000Z',
    hash: 'sha256:replay',
    hashAlgorithm: 'sha256',
  },
  hash: 'sha256:pack',
  hashAlgorithm: 'sha256',
};

describe('HoloShell permission gate constants', () => {
  it('covers subject, envelope, status, and verification vocabularies', () => {
    expect(PERMISSION_SUBJECT_KINDS).toContain('provider_account');
    expect(PERMISSION_SUBJECT_KINDS).toContain('device');
    expect(PERMISSION_GATE_ENVELOPES).toContain('guarded_grant');
    expect(PERMISSION_GATE_STATUSES).toContain('verified');
    expect(PERMISSION_VERIFICATION_METHODS).toContain('oauth_tokeninfo');
  });

  it('validates supported values', () => {
    expect(isSupportedPermissionSubjectKind('connector')).toBe(true);
    expect(isSupportedPermissionSubjectKind('ambient_secret')).toBe(false);
    expect(isSupportedPermissionGateEnvelope('guarded_grant')).toBe(true);
    expect(isSupportedPermissionGateEnvelope('silent_oauth')).toBe(false);
    expect(isSupportedPermissionGateStatus('revoked')).toBe(true);
    expect(isSupportedPermissionGateStatus('invisible')).toBe(false);
    expect(isSupportedPermissionVerificationMethod('connector_probe')).toBe(true);
    expect(isSupportedPermissionVerificationMethod('trust_me')).toBe(false);
  });
});

describe('validateHoloShellPermissionGateReceiptPack', () => {
  it('accepts a verified minimum-scope provider account grant', () => {
    expect(validateHoloShellPermissionGateReceiptPack(validPack)).toEqual([]);
  });

  it('rejects broad requested scopes from neverScopes and wildcard patterns', () => {
    const request = {
      ...validPack.request,
      requestedScopes: [{ ...driveFileScope, scope: '*' }],
    };
    expect(validatePermissionRequestReceipt(request)).toContain(
      'PermissionRequestReceipt.requestedScopes[0].scope is listed in neverScopes: *.'
    );
  });

  it('rejects broad administrative granted scopes', () => {
    const grant = {
      ...validPack.grant!,
      grantedScopes: [{ ...driveFileScope, scope: 'admin' }],
      extraScopes: [],
    };
    const errors = validatePermissionGrantReceipt(grant, validPack.request);
    expect(errors).toEqual(
      expect.arrayContaining([
        'PermissionGrantReceipt.grantedScopes[0].scope is listed in neverScopes: admin.',
        'PermissionGrantReceipt.grantedScopes includes scopes outside the minimum set: admin.',
      ])
    );
  });

  it('rejects raw credential capture and hidden automation', () => {
    const grant = {
      ...validPack.grant!,
      hiddenAutomationUsed: true,
      rawCredentialCaptured: true,
    };
    const errors = validatePermissionGrantReceipt(grant, validPack.request);
    expect(errors).toEqual(
      expect.arrayContaining([
        'PermissionGrantReceipt.hiddenAutomationUsed must be false.',
        'PermissionGrantReceipt.rawCredentialCaptured must be false.',
      ])
    );
  });

  it('rejects extra granted scopes even when the provider returns them', () => {
    const grant = {
      ...validPack.grant!,
      grantedScopes: [
        driveFileScope,
        { ...driveFileScope, scope: 'drive.readonly', required: false },
      ],
      extraScopes: ['drive.readonly'],
    };
    const errors = validatePermissionGrantReceipt(grant, validPack.request);
    expect(errors).toEqual(
      expect.arrayContaining([
        'PermissionGrantReceipt.grantedScopes includes scopes outside the minimum set: drive.readonly.',
        'PermissionGrantReceipt.extraScopes must be empty before a grant can be accepted.',
      ])
    );
  });

  it('rejects grants without a revoke path', () => {
    const grant = { ...validPack.grant!, revocationInstruction: '' };
    expect(validatePermissionGrantReceipt(grant, validPack.request)).toContain(
      'PermissionGrantReceipt.revocationInstruction is required.'
    );
  });

  it('rejects ready states when verification found excess scopes', () => {
    const verification = { ...validPack.verification!, excessScopesAbsent: false };
    expect(validatePermissionVerificationReceipt(verification)).toContain(
      'PermissionVerificationReceipt.readyForHoloLand requires excessScopesAbsent.'
    );
  });

  it('rejects public absolute path leakage', () => {
    const request = {
      ...validPack.request,
      commandOrUrlPreview: 'node C:/Users/private/oauth-helper.js',
    };
    expect(validatePermissionRequestReceipt(request)).toContain(
      'PermissionRequestReceipt.commandOrUrlPreview must be redacted before public receipts.'
    );
  });

  it('rejects ready replay without verified status and verification receipt', () => {
    const replay = {
      ...validPack.replay,
      status: 'granted',
      verificationReceiptId: undefined,
    };
    const errors = validatePermissionReplayReceipt(replay);
    expect(errors).toEqual(
      expect.arrayContaining([
        'PermissionReplayReceipt.readyForHoloLand requires verified status.',
        'PermissionReplayReceipt.readyForHoloLand requires verificationReceiptId.',
      ])
    );
  });

  it('validates subject redaction invariants directly', () => {
    const subject = {
      ...validPack.subject,
      publicReceiptMayContainAbsolutePath: true,
      credentialExtrusionAllowed: true,
    };
    const errors = validatePermissionSubjectReceipt(subject);
    expect(errors).toEqual(
      expect.arrayContaining([
        'PermissionSubjectReceipt.publicReceiptMayContainAbsolutePath must be false.',
        'PermissionSubjectReceipt.credentialExtrusionAllowed must be false.',
      ])
    );
  });
});

describe('permission scope policy helpers', () => {
  it('normalizes provider scope names for deterministic comparison', () => {
    expect(normalizePermissionScopeName(' Drive.File ')).toBe('drive.file');
  });

  it('evaluates forbidden scope policy with neverScopes and broad authority terms', () => {
    expect(evaluatePermissionScopePolicy('drive.file', validPack.request.neverScopes)).toEqual({
      scope: 'drive.file',
      normalizedScope: 'drive.file',
      allowed: true,
    });
    expect(evaluatePermissionScopePolicy('billing', validPack.request.neverScopes)).toEqual({
      scope: 'billing',
      normalizedScope: 'billing',
      allowed: false,
      reason: 'is listed in neverScopes',
    });
    expect(evaluatePermissionScopePolicy('project.owner', [])).toEqual({
      scope: 'project.owner',
      normalizedScope: 'project.owner',
      allowed: false,
      reason: 'requests broad administrative authority',
    });
  });

  it('builds reusable minimum-scope diffs for adapters and validators', () => {
    const diff = buildPermissionScopeDiff({
      requestedScopes: [driveFileScope],
      minimumRequiredScopes: [driveFileScope],
      grantedScopes: [
        driveFileScope,
        { ...driveFileScope, scope: 'drive.readonly', required: false },
      ],
      neverScopes: validPack.request.neverScopes,
    });

    expect(diff.minimumScopeSatisfied).toBe(true);
    expect(diff.excessScopesAbsent).toBe(false);
    expect(diff.extraGrantedScopes).toEqual(['drive.readonly']);
    expect(diff.missingGrantedRequiredScopes).toEqual([]);
    expect(diff.forbiddenGrantedScopes).toEqual([]);
  });

  it('redacts credential material and absolute paths from public previews', () => {
    const redaction = redactPermissionGatePreview(
      'node C:/Users/private/oauth-helper.js --url https://provider.example/callback?access_token=secret'
    );

    expect(redaction.redacted).toBe(true);
    expect(redaction.absolutePathRedacted).toBe(true);
    expect(redaction.credentialMaterialRedacted).toBe(true);
    expect(redaction.preview).toContain('<absolute-path-redacted>');
    expect(redaction.preview).toContain('access_token=<redacted>');
    expect(permissionPreviewHasPublicLeak('Bearer abc.def.ghi')).toBe(true);
    expect(permissionPreviewHasPublicLeak('https://accounts.example/auth?scope=drive.file')).toBe(false);
  });

  it('keeps already-redacted previews stable across repeated checks', () => {
    const redaction = redactPermissionGatePreview('Bearer <redacted> access_token=<redacted>');

    expect(redaction.redacted).toBe(false);
    expect(redaction.credentialMaterialRedacted).toBe(false);
    expect(redaction.preview).toBe('Bearer <redacted> access_token=<redacted>');
    expect(permissionPreviewHasPublicLeak(redaction.preview)).toBe(false);
  });
});

describe('cloneHoloShellPermissionGateReceiptPack', () => {
  it('deep-copies mutable scope arrays and nested receipts', () => {
    const clone = cloneHoloShellPermissionGateReceiptPack(validPack);
    expect(clone).toEqual(validPack);
    expect(clone).not.toBe(validPack);
    expect(clone.subject).not.toBe(validPack.subject);
    expect(clone.request.requestedScopes).not.toBe(validPack.request.requestedScopes);
    expect(clone.request.minimumRequiredScopes).not.toBe(validPack.request.minimumRequiredScopes);
    expect(clone.request.neverScopes).not.toBe(validPack.request.neverScopes);
    expect(clone.grant?.grantedScopes).not.toBe(validPack.grant?.grantedScopes);
    expect(clone.verification?.verifiedScopes).not.toBe(validPack.verification?.verifiedScopes);
    expect(clone.replay).not.toBe(validPack.replay);
  });
});
