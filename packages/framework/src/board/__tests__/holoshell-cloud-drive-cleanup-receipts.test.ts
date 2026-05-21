import { describe, expect, it } from 'vitest';
import {
  CLOUD_DRIVE_CLEANUP_WORKFLOW,
  HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION,
  cloneHoloShellCloudDriveCleanupReceiptPack,
  isSupportedCloudDriveCleanupStatus,
  isSupportedCloudDriveConnectedAppState,
  isSupportedCloudDriveProvider,
  validateCloudDriveConnectedAppInventoryReceipt,
  validateHoloShellCloudDriveCleanupReceiptPack,
  type CloudDriveConnectedAppInventoryReceipt,
  type HoloShellCloudDriveCleanupReceiptPack,
} from '../holoshell-cloud-drive-cleanup-receipts';
import type { HoloShellAccountExportReceiptPack } from '../holoshell-account-export-receipts';
import type { HoloShellPermissionGateReceiptPack } from '../holoshell-permission-gate-receipts';

const driveFileScope = {
  scope: 'drive.file',
  purpose: 'Read and update only HoloLand-created world files selected by the human.',
  required: true,
  riskLevel: 'medium',
  providerLabel: 'Google Drive per-file access',
};

const permissionGate: HoloShellPermissionGateReceiptPack = {
  id: 'permission-pack-001',
  schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0',
  workflow: 'provider-app-device-permission-gate',
  status: 'verified',
  subject: {
    id: 'subject-001',
    schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0',
    subjectKind: 'provider_account',
    provider: 'google',
    redactedSubjectLabel: 'Google Drive account <redacted>',
    subjectLabelHash: 'sha256:subject',
    browserProfile: 'Default',
    credentialAdjacent: true,
    publicReceiptMayContainAbsolutePath: false,
    credentialExtrusionAllowed: false,
    createdAt: '2026-05-21T10:00:00.000Z',
    hash: 'sha256:subject',
    hashAlgorithm: 'sha256',
  },
  request: {
    id: 'request-001',
    schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0',
    subjectReceiptId: 'subject-001',
    requestedScopes: [driveFileScope],
    minimumRequiredScopes: [driveFileScope],
    neverScopes: ['*', 'drive', 'drive.readonly', 'admin', 'billing', 'delete', 'full_access'],
    purpose: 'Clean cloud-drive access before HoloLand preview import.',
    permissionEnvelope: 'guarded_grant',
    requiresFreshUserGesture: true,
    approvalId: 'approval-001',
    commandOrUrlPreview: 'https://accounts.google.com/o/oauth2/v2/auth?scope=drive.file',
    commandPreviewContainsAbsolutePaths: false,
    requestedAt: '2026-05-21T10:01:00.000Z',
    hash: 'sha256:request',
    hashAlgorithm: 'sha256',
  },
  grant: {
    id: 'grant-001',
    schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0',
    requestReceiptId: 'request-001',
    grantedScopes: [driveFileScope],
    deniedScopes: [],
    missingRequiredScopes: [],
    extraScopes: [],
    grantObservedAt: '2026-05-21T10:02:00.000Z',
    freshUserGesture: true,
    hiddenAutomationUsed: false,
    rawCredentialCaptured: false,
    tokenReferenceHash: 'sha256:token',
    revocationInstruction: 'Open provider app permissions and revoke HoloLand Builder.',
    hash: 'sha256:grant',
    hashAlgorithm: 'sha256',
  },
  verification: {
    id: 'verification-001',
    schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0',
    grantReceiptId: 'grant-001',
    verificationMethod: 'oauth_tokeninfo',
    verifiedAt: '2026-05-21T10:03:00.000Z',
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
    schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0',
    workflow: 'provider-app-device-permission-gate',
    status: 'verified',
    subjectReceiptId: 'subject-001',
    requestReceiptId: 'request-001',
    grantReceiptId: 'grant-001',
    verificationReceiptId: 'verification-001',
    replayKey: 'sha256:permission-replay',
    rawCredentialCaptured: false,
    overbroadScopeAccepted: false,
    readyForHoloLand: true,
    createdAt: '2026-05-21T10:04:00.000Z',
    hash: 'sha256:permission-replay',
    hashAlgorithm: 'sha256',
  },
  hash: 'sha256:permission-pack',
  hashAlgorithm: 'sha256',
};

const revocation = {
  id: 'revocation-001',
  schemaVersion: 'hololand.holoshell.permission-gate.v0.1.0' as const,
  grantReceiptId: 'grant-001',
  revokedAt: '2026-05-21T10:05:00.000Z',
  revokeVerified: true,
  revocationMethod: 'provider_settings',
  requiresFreshUserGesture: true as const,
  hiddenAutomationUsed: false as const,
  rollbackNote: 'Provider access removed; residual browser sessions may expire asynchronously.',
  hash: 'sha256:revocation',
  hashAlgorithm: 'sha256' as const,
};

function makeInventory(
  overrides: Partial<CloudDriveConnectedAppInventoryReceipt> = {}
): CloudDriveConnectedAppInventoryReceipt {
  return {
    id: 'inventory-001',
    schemaVersion: HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_DRIVE_CLEANUP_WORKFLOW,
    provider: 'google',
    redactedAccountLabel: 'Google account <redacted>',
    accountLabelHash: 'sha256:account',
    browserProfile: 'Default',
    observedAt: '2026-05-21T10:00:00.000Z',
    connectedApps: [
      {
        appIdHash: 'sha256:hololand-builder',
        redactedAppLabel: 'HoloLand Builder',
        state: 'minimum_required',
        scopes: [
          {
            scope: 'drive.file',
            providerLabel: 'Google Drive per-file access',
            normalizedScope: 'drive.file',
            purpose: 'Preview selected HoloLand world files.',
            riskLevel: 'medium',
            minimumRequired: true,
            overbroad: false,
          },
        ],
        lastSeenAt: '2026-05-21T09:59:00.000Z',
        revokeCandidate: false,
      },
      {
        appIdHash: 'sha256:old-builder',
        redactedAppLabel: 'Old HoloLand Builder',
        state: 'overbroad',
        scopes: [
          {
            scope: 'drive',
            providerLabel: 'Full Google Drive access',
            normalizedScope: 'drive',
            purpose: 'Legacy broad access.',
            riskLevel: 'critical',
            minimumRequired: false,
            overbroad: true,
          },
        ],
        revokeCandidate: true,
        residualAccessWarning: 'Provider sessions may remain until browser refresh.',
      },
    ],
    staleGrantCount: 0,
    overbroadGrantCount: 1,
    rawCredentialCaptured: false,
    cookieExported: false,
    publicReceiptMayContainAbsolutePath: false,
    hash: 'sha256:inventory',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeAccountExport(): HoloShellAccountExportReceiptPack {
  return {
    id: 'account-export-pack-001',
    plan: {
      id: 'plan-001',
      provider: 'google',
      redactedAccountLabel: 'Google account <redacted>',
      accountLabelHash: 'sha256:account',
      selectedProducts: [
        {
          id: 'drive-world-files',
          label: 'Drive world files',
          included: true,
          selectionHash: 'sha256:selection',
        },
      ],
      deliveryMethod: 'direct_download',
      archiveFormat: 'zip',
      archiveSizeLimitMb: 512,
      cloudHandoffWarning: false,
      accountMutationAllowed: false,
      requiresFreshUserGesture: true,
      createdAt: '2026-05-21T10:05:00.000Z',
      warnings: [],
      hash: 'sha256:plan',
      hashAlgorithm: 'sha256',
    },
    archive: {
      id: 'archive-001',
      downloadReceiptId: 'download-001',
      verifiedAt: '2026-05-21T10:07:00.000Z',
      archivePartCount: 1,
      verifiedArchivePartCount: 1,
      unpackManifestHash: 'sha256:manifest',
      sensitivityScanStatus: 'pass',
      unexpectedExecutableCount: 0,
      importAllowed: true,
      shareAllowed: false,
      deleteOriginalsAllowed: false,
      replayKey: 'sha256:archive-replay',
      warnings: [],
      hash: 'sha256:archive',
      hashAlgorithm: 'sha256',
    },
    replay: {
      id: 'account-replay-001',
      workflow: 'browser-account-export',
      provider: 'google',
      status: 'verified',
      planReceiptId: 'plan-001',
      archiveReceiptId: 'archive-001',
      replayKey: 'sha256:account-replay',
      rollbackNote: 'Delete only local preview copy; cloud source unchanged.',
      exportIsNotDeletion: true,
      accountMutationPerformed: false,
      sourceCloudDataMutated: false,
      createdAt: '2026-05-21T10:08:00.000Z',
      hash: 'sha256:account-replay',
      hashAlgorithm: 'sha256',
    },
    status: 'verified',
    hash: 'sha256:account-pack',
    hashAlgorithm: 'sha256',
  };
}

function makePack(
  overrides: Partial<HoloShellCloudDriveCleanupReceiptPack> = {}
): HoloShellCloudDriveCleanupReceiptPack {
  return {
    id: 'cloud-cleanup-pack-001',
    schemaVersion: HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_DRIVE_CLEANUP_WORKFLOW,
    status: 'preview_ready',
    inventory: makeInventory(),
    permissionGate,
    revocations: [revocation],
    accountExport: makeAccountExport(),
    replay: {
      id: 'cloud-cleanup-replay-001',
      schemaVersion: HOLOSHELL_CLOUD_DRIVE_CLEANUP_RECEIPT_VERSION,
      workflow: CLOUD_DRIVE_CLEANUP_WORKFLOW,
      status: 'preview_ready',
      inventoryReceiptId: 'inventory-001',
      permissionPackId: 'permission-pack-001',
      accountExportPackId: 'account-export-pack-001',
      revocationReceiptIds: ['revocation-001'],
      replayKey: 'sha256:cloud-cleanup-replay',
      rawCredentialCaptured: false,
      sourceCloudDataMutated: false,
      previewOnlyImport: true,
      readyForHoloLandPreview: true,
      createdAt: '2026-05-21T10:09:00.000Z',
      hash: 'sha256:cleanup-replay',
      hashAlgorithm: 'sha256',
    },
    hash: 'sha256:cleanup-pack',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

describe('HoloShell cloud drive cleanup receipts', () => {
  it('accepts a linked cleanup pack with inventory, revoke, account export, and preview replay', () => {
    expect(validateHoloShellCloudDriveCleanupReceiptPack(makePack())).toEqual([]);
  });

  it('rejects inventory that captures raw credentials or cookies', () => {
    const errors = validateCloudDriveConnectedAppInventoryReceipt(
      makeInventory({
        rawCredentialCaptured: true as unknown as false,
        cookieExported: true as unknown as false,
        publicReceiptMayContainAbsolutePath: true as unknown as false,
      })
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        'CloudDriveConnectedAppInventoryReceipt.rawCredentialCaptured must be false.',
        'CloudDriveConnectedAppInventoryReceipt.cookieExported must be false.',
        'CloudDriveConnectedAppInventoryReceipt.publicReceiptMayContainAbsolutePath must be false.',
      ])
    );
  });

  it('requires revocation receipts when overbroad grants are inventoried', () => {
    expect(validateHoloShellCloudDriveCleanupReceiptPack(makePack({ revocations: [] }))).toContain(
      'HoloShellCloudDriveCleanupReceiptPack.revocations are required when overbroad grants are inventoried.'
    );
  });

  it('allows inventoried packs to stage overbroad grants before revocation receipts exist', () => {
    const pack = makePack({
      status: 'inventoried',
      revocations: [],
      accountExport: undefined,
      replay: {
        ...makePack().replay,
        status: 'inventoried',
        accountExportPackId: undefined,
        revocationReceiptIds: [],
        readyForHoloLandPreview: false,
      },
    });

    expect(validateHoloShellCloudDriveCleanupReceiptPack(pack)).toEqual([]);
  });

  it('requires a verified account export before preview readiness', () => {
    const accountExport = { ...makeAccountExport(), status: 'downloaded' as const };
    const errors = validateHoloShellCloudDriveCleanupReceiptPack(makePack({ accountExport }));

    expect(errors).toContain(
      'HoloShellCloudDriveCleanupReceiptPack.preview_ready requires a verified accountExport pack.'
    );
  });

  it('requires replay links to match the nested receipt IDs', () => {
    const pack = makePack({
      replay: {
        ...makePack().replay,
        inventoryReceiptId: 'wrong-inventory',
        permissionPackId: 'wrong-permission',
        accountExportPackId: 'wrong-export',
      },
    });

    expect(validateHoloShellCloudDriveCleanupReceiptPack(pack)).toEqual(
      expect.arrayContaining([
        'HoloShellCloudDriveCleanupReceiptPack.replay.inventoryReceiptId must match inventory.id.',
        'HoloShellCloudDriveCleanupReceiptPack.replay.permissionPackId must match permissionGate.id.',
        'HoloShellCloudDriveCleanupReceiptPack.replay.accountExportPackId must match accountExport.id.',
      ])
    );
  });

  it('clones nested arrays without retaining mutable references', () => {
    const original = makePack();
    const cloned = cloneHoloShellCloudDriveCleanupReceiptPack(original);

    cloned.inventory.connectedApps[0].scopes[0].providerLabel = 'Changed';
    cloned.replay.revocationReceiptIds.push('another');

    expect(original.inventory.connectedApps[0].scopes[0].providerLabel).toBe(
      'Google Drive per-file access'
    );
    expect(original.replay.revocationReceiptIds).toEqual(['revocation-001']);
  });

  it('exposes type guards for routing cleanup handling', () => {
    expect(isSupportedCloudDriveProvider('google')).toBe(true);
    expect(isSupportedCloudDriveProvider('dropbox')).toBe(false);
    expect(isSupportedCloudDriveCleanupStatus('preview_ready')).toBe(true);
    expect(isSupportedCloudDriveCleanupStatus('published')).toBe(false);
    expect(isSupportedCloudDriveConnectedAppState('overbroad')).toBe(true);
    expect(isSupportedCloudDriveConnectedAppState('ambient')).toBe(false);
  });
});
