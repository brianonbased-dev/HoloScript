import { describe, expect, it } from 'vitest';
import {
  CLOUD_PERMISSION_CLEANUP_WORKFLOW,
  HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
  cloudExposureRisk,
  cloneHoloShellCloudPermissionCleanupReceiptPack,
  summarizeCloudExposure,
  validateProviderMetadataInventoryWitnessReceipt,
  validateCloudPermissionCleanupReplayReceipt,
  validateCloudPermissionCleanupVerificationReceipt,
  validateCloudPermissionRevokePlanReceipt,
  validateCloudShareInventoryReceipt,
  validateHoloShellCloudPermissionCleanupReceiptPack,
  type CloudSharedItemExposure,
  type HoloShellCloudPermissionCleanupReceiptPack,
} from '../holoshell-cloud-permission-cleanup-receipts';

const publicLinkItem: CloudSharedItemExposure = {
  id: 'item-public-link',
  providerItemIdHash: 'sha256:item-public-link',
  redactedName: 'Project Folder <redacted>',
  itemKind: 'folder',
  linkVisibility: 'public',
  subjects: [
    {
      subjectKind: 'link',
      redactedLabel: 'Anyone with link',
      labelHash: 'sha256:anyone-link',
      boundary: 'public',
      role: 'viewer',
      inherited: false,
    },
  ],
  riskLevel: 'critical',
  intendedPolicy: 'revoke',
};

const externalEditorItem: CloudSharedItemExposure = {
  id: 'item-external-editor',
  providerItemIdHash: 'sha256:item-external-editor',
  redactedName: 'World Source <redacted>',
  itemKind: 'file',
  linkVisibility: 'restricted',
  subjects: [
    {
      subjectKind: 'user',
      redactedLabel: 'e***@external.example',
      labelHash: 'sha256:external-editor',
      boundary: 'external',
      role: 'editor',
      inherited: false,
    },
  ],
  riskLevel: 'high',
  intendedPolicy: 'revoke',
};

const validPack: HoloShellCloudPermissionCleanupReceiptPack = {
  id: 'cloud-cleanup-pack-001',
  schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
  workflow: CLOUD_PERMISSION_CLEANUP_WORKFLOW,
  status: 'clean',
  providerMetadataWitness: {
    id: 'provider-metadata-witness-001',
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_PERMISSION_CLEANUP_WORKFLOW,
    provider: 'google_drive',
    providerInputFormat: 'google_drive_permissions',
    sourceKind: 'local_metadata_export',
    exportHash: 'sha256:provider-export',
    exportHashAlgorithm: 'sha256',
    exportRecordCount: 2,
    skippedRecordCount: 0,
    unsupportedRecordCount: 0,
    fieldAllowlist: [
      'files[].id',
      'files[].name',
      'files[].mimeType',
      'files[].permissions[].type',
      'files[].permissions[].role',
      'files[].permissions[].emailAddress',
      'files[].permissions[].permissionDetails[].inheritedFrom',
    ],
    redactionPolicy: 'hash provider item ids; redact account and subject labels; never include content or tokens',
    redactionApplied: true,
    metadataOnly: true,
    blockedFieldsAbsent: true,
    rawContentCaptured: false,
    rawCredentialCaptured: false,
    cookieCaptured: false,
    absolutePathCaptured: false,
    publicReceiptMayContainAbsolutePath: false,
    observedAt: '2026-05-21T19:59:00.000Z',
    hash: 'sha256:witness',
    hashAlgorithm: 'sha256',
  },
  inventory: {
    id: 'cloud-inventory-001',
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    subjectReceiptId: 'permission-subject-001',
    provider: 'google_drive',
    redactedAccountLabel: 'j***@example.com',
    accountLabelHash: 'sha256:account',
    items: [publicLinkItem, externalEditorItem],
    skippedItemCount: 0,
    inventoryComplete: true,
    publicReceiptMayContainAbsolutePath: false,
    rawContentCaptured: false,
    credentialExtrusionAllowed: false,
    providerMetadataWitnessReceiptId: 'provider-metadata-witness-001',
    observedAt: '2026-05-21T20:00:00.000Z',
    hash: 'sha256:inventory',
    hashAlgorithm: 'sha256',
  },
  exposureDiff: {
    id: 'cloud-exposure-diff-001',
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    inventoryReceiptId: 'cloud-inventory-001',
    publicLinkItemIds: ['item-public-link'],
    externalEditorItemIds: ['item-external-editor'],
    inheritedAccessItemIds: [],
    unknownGroupItemIds: [],
    domainWideItemIds: [],
    residualAccessCount: 0,
    readyForRevocationPlan: true,
    hash: 'sha256:diff',
    hashAlgorithm: 'sha256',
  },
  revokePlan: {
    id: 'cloud-revoke-plan-001',
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    exposureDiffReceiptId: 'cloud-exposure-diff-001',
    selectedItemIds: ['item-public-link', 'item-external-editor'],
    approvedExposureIds: ['item-public-link', 'item-external-editor'],
    blockedActions: ['delete_cloud_file', 'move_cloud_file', 'transfer_owner'],
    permissionEnvelope: 'guarded_execute',
    freshApproval: true,
    approvalId: 'approval-cloud-cleanup-001',
    bulkMutationRequested: false,
    deleteOrMoveRequested: false,
    ownerTransferRequested: false,
    rawCredentialCaptured: false,
    hiddenAutomationUsed: false,
    approvedAt: '2026-05-21T20:01:00.000Z',
    hash: 'sha256:plan',
    hashAlgorithm: 'sha256',
  },
  verification: {
    id: 'cloud-verification-001',
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    revokePlanReceiptId: 'cloud-revoke-plan-001',
    providerStateVerified: true,
    revokedExposureIds: ['item-public-link', 'item-external-editor'],
    residualAccessItemIds: [],
    residualAccessCount: 0,
    readyToClaimClean: true,
    verificationMethod: 'provider_settings',
    verifiedAt: '2026-05-21T20:02:00.000Z',
    hash: 'sha256:verification',
    hashAlgorithm: 'sha256',
  },
  replay: {
    id: 'cloud-replay-001',
    schemaVersion: HOLOSHELL_CLOUD_PERMISSION_CLEANUP_RECEIPT_VERSION,
    workflow: CLOUD_PERMISSION_CLEANUP_WORKFLOW,
    status: 'clean',
    inventoryReceiptId: 'cloud-inventory-001',
    exposureDiffReceiptId: 'cloud-exposure-diff-001',
    revokePlanReceiptId: 'cloud-revoke-plan-001',
    verificationReceiptId: 'cloud-verification-001',
    replayKey: 'sha256:cloud-replay',
    residualAccessCount: 0,
    readyToClaimClean: true,
    rawCredentialCaptured: false,
    hiddenAutomationUsed: false,
    createdAt: '2026-05-21T20:03:00.000Z',
    hash: 'sha256:replay',
    hashAlgorithm: 'sha256',
  },
  hash: 'sha256:pack',
  hashAlgorithm: 'sha256',
};

describe('HoloShell cloud permission cleanup receipts', () => {
  it('accepts a verified clean cloud-share cleanup pack', () => {
    expect(validateHoloShellCloudPermissionCleanupReceiptPack(validPack)).toEqual([]);
  });

  it('summarizes public links and external editors from inventory', () => {
    expect(summarizeCloudExposure(validPack.inventory.items)).toEqual({
      publicLinkItemIds: ['item-public-link'],
      externalEditorItemIds: ['item-external-editor'],
      inheritedAccessItemIds: [],
      unknownGroupItemIds: [],
      domainWideItemIds: [],
    });
    expect(cloudExposureRisk(publicLinkItem)).toBe('critical');
    expect(cloudExposureRisk(externalEditorItem)).toBe('high');
  });

  it('accepts metadata-only provider inventory witness receipts', () => {
    expect(validateProviderMetadataInventoryWitnessReceipt(validPack.providerMetadataWitness)).toEqual([]);
  });

  it('rejects provider metadata witnesses that allow content or credential fields', () => {
    const witness = {
      ...validPack.providerMetadataWitness!,
      fieldAllowlist: ['files[].id', 'files[].content', 'access_token', 'files[]', 'files[].permissions.*'],
      metadataOnly: false,
      blockedFieldsAbsent: false,
      rawContentCaptured: true,
      rawCredentialCaptured: true,
      cookieCaptured: true,
      absolutePathCaptured: true,
    };

    expect(validateProviderMetadataInventoryWitnessReceipt(witness)).toEqual(
      expect.arrayContaining([
        'ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[1] contains blocked field: files[].content.',
        'ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[2] contains blocked field: access_token.',
        'ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[3] must name a specific metadata field, not an overbroad collection: files[].',
        'ProviderMetadataInventoryWitnessReceipt.fieldAllowlist[4] must name a specific metadata field, not an overbroad collection: files[].permissions.*.',
        'ProviderMetadataInventoryWitnessReceipt.metadataOnly must be true.',
        'ProviderMetadataInventoryWitnessReceipt.blockedFieldsAbsent must be true.',
        'ProviderMetadataInventoryWitnessReceipt.rawContentCaptured must be false.',
        'ProviderMetadataInventoryWitnessReceipt.rawCredentialCaptured must be false.',
        'ProviderMetadataInventoryWitnessReceipt.cookieCaptured must be false.',
        'ProviderMetadataInventoryWitnessReceipt.absolutePathCaptured must be false.',
      ])
    );
  });

  it('rejects raw account and path leakage in public inventory receipts', () => {
    const inventory = {
      ...validPack.inventory,
      redactedAccountLabel: 'joseph@example.com',
      items: [
        {
          ...publicLinkItem,
          redactedName: '/Users/josep/Secret Folder',
        },
      ],
    };
    const errors = validateCloudShareInventoryReceipt(inventory);
    expect(errors).toEqual(
      expect.arrayContaining([
        'CloudShareInventoryReceipt.redactedAccountLabel must be redacted before public receipts.',
        'CloudShareInventoryReceipt.items[0].redactedName must be redacted before public receipts.',
      ])
    );
  });

  it('rejects exposure diffs that reference unknown inventory items', () => {
    const diff = {
      ...validPack.exposureDiff,
      publicLinkItemIds: ['missing-item'],
    };
    expect(validateHoloShellCloudPermissionCleanupReceiptPack({ ...validPack, exposureDiff: diff })).toContain(
      'CloudExposureDiffReceipt.publicLinkItemIds references unknown inventory item: missing-item.'
    );
  });

  it('rejects malformed exposure and verification arrays without throwing', () => {
    const pack = {
      ...validPack,
      exposureDiff: {
        ...validPack.exposureDiff,
        publicLinkItemIds: 'not-an-array',
      },
      verification: {
        ...validPack.verification!,
        revokedExposureIds: undefined,
      },
    } as unknown as HoloShellCloudPermissionCleanupReceiptPack;

    expect(validateHoloShellCloudPermissionCleanupReceiptPack(pack)).toEqual(
      expect.arrayContaining([
        'CloudExposureDiffReceipt.publicLinkItemIds must be an array.',
        'CloudPermissionCleanupVerificationReceipt.revokedExposureIds must be an array.',
        'HoloShellCloudPermissionCleanupReceiptPack.clean claim leaves exposure unverified or residual: item-external-editor.',
      ])
    );
  });

  it('rejects revoke plans that hide bulk, delete, owner-transfer, or automation risks', () => {
    const plan = {
      ...validPack.revokePlan!,
      selectedItemIds: ['item-public-link', 'item-not-reviewed'],
      approvedExposureIds: ['item-public-link'],
      bulkMutationRequested: true,
      deleteOrMoveRequested: true,
      ownerTransferRequested: true,
      hiddenAutomationUsed: true,
      rawCredentialCaptured: true,
    };
    const errors = validateCloudPermissionRevokePlanReceipt(plan, validPack.exposureDiff);
    expect(errors).toEqual(
      expect.arrayContaining([
        'CloudPermissionRevokePlanReceipt.bulkMutationRequested must be false.',
        'CloudPermissionRevokePlanReceipt.deleteOrMoveRequested must be false.',
        'CloudPermissionRevokePlanReceipt.ownerTransferRequested must be false.',
        'CloudPermissionRevokePlanReceipt.rawCredentialCaptured must be false.',
        'CloudPermissionRevokePlanReceipt.hiddenAutomationUsed must be false.',
        'CloudPermissionRevokePlanReceipt.selectedItemIds must each have itemized approvedExposureIds review.',
        'CloudPermissionRevokePlanReceipt.selectedItemIds references non-exposure item: item-not-reviewed.',
      ])
    );
  });

  it('rejects clean claims with residual access', () => {
    const verification = {
      ...validPack.verification!,
      residualAccessCount: 1,
      readyToClaimClean: true,
    };
    expect(validateCloudPermissionCleanupVerificationReceipt(verification)).toContain(
      'CloudPermissionCleanupVerificationReceipt.readyToClaimClean requires zero residual access.'
    );

    const replay = {
      ...validPack.replay,
      residualAccessCount: 1,
      readyToClaimClean: true,
    };
    expect(validateCloudPermissionCleanupReplayReceipt(replay)).toContain(
      'CloudPermissionCleanupReplayReceipt.readyToClaimClean requires zero residual access.'
    );
  });

  it('rejects clean claims where inherited or external access remains unverified', () => {
    const inheritedItem: CloudSharedItemExposure = {
      ...externalEditorItem,
      id: 'item-inherited-access',
      providerItemIdHash: 'sha256:item-inherited-access',
      subjects: [
        {
          subjectKind: 'group',
          redactedLabel: 'Team Editors',
          labelHash: 'sha256:team-editors',
          boundary: 'organization',
          role: 'editor',
          inherited: true,
        },
      ],
      inheritedFromItemId: 'folder-parent',
      riskLevel: 'medium',
    };
    const pack: HoloShellCloudPermissionCleanupReceiptPack = {
      ...validPack,
      inventory: {
        ...validPack.inventory,
        items: [...validPack.inventory.items, inheritedItem],
      },
      exposureDiff: {
        ...validPack.exposureDiff,
        inheritedAccessItemIds: ['item-inherited-access'],
      },
      verification: {
        ...validPack.verification!,
        revokedExposureIds: ['item-public-link'],
        residualAccessItemIds: ['item-external-editor', 'item-inherited-access'],
        residualAccessCount: 0,
      },
    };

    expect(validateHoloShellCloudPermissionCleanupReceiptPack(pack)).toEqual(
      expect.arrayContaining([
        'CloudPermissionCleanupVerificationReceipt.residualAccessCount must match residualAccessItemIds length.',
        'HoloShellCloudPermissionCleanupReceiptPack.clean claim leaves exposure unverified or residual: item-external-editor.',
        'HoloShellCloudPermissionCleanupReceiptPack.clean claim leaves exposure unverified or residual: item-inherited-access.',
      ])
    );
  });

  it('deep-copies mutable arrays when cloning packs', () => {
    const clone = cloneHoloShellCloudPermissionCleanupReceiptPack(validPack);
    expect(clone).toEqual(validPack);
    expect(clone).not.toBe(validPack);
    expect(clone.inventory.items).not.toBe(validPack.inventory.items);
    expect(clone.providerMetadataWitness?.fieldAllowlist).not.toBe(
      validPack.providerMetadataWitness?.fieldAllowlist
    );
    expect(clone.inventory.items[0].subjects).not.toBe(validPack.inventory.items[0].subjects);
    expect(clone.exposureDiff.publicLinkItemIds).not.toBe(validPack.exposureDiff.publicLinkItemIds);
    expect(clone.revokePlan?.selectedItemIds).not.toBe(validPack.revokePlan?.selectedItemIds);
    expect(clone.verification?.residualAccessItemIds).not.toBe(
      validPack.verification?.residualAccessItemIds
    );
  });
});
