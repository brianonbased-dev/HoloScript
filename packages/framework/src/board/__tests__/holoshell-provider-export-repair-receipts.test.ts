import { describe, expect, it } from 'vitest';
import {
  EXPORT_REPAIR_REPLAY_RECEIPT_VERSION,
  PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION,
  PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION,
  PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION,
  PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION,
  buildProviderExportRepairPlanReceipt,
  buildProviderExportWitnessFixtureResult,
  cloneHoloShellProviderExportRepairReceiptPack,
  isSupportedProviderExportRepairAction,
  isSupportedProviderExportRepairStatus,
  type ExportRepairReplayReceipt,
  type HoloShellProviderExportRepairReceiptPack,
  type PartialArchiveEvidenceReceipt,
  type ProviderExportFailureKind,
  type ProviderExportFailureReceipt,
  type ProviderExportRepairPlanReceipt,
  type ProviderExportWitnessFixture,
  type ProviderExportWitnessStatus,
  validateExportRepairReplayReceipt,
  validateHoloShellProviderExportRepairReceiptPack,
  validatePartialArchiveEvidenceReceipt,
  validateProviderExportFailureReceipt,
  validateProviderExportRepairPlanReceipt,
} from '../holoshell-provider-export-repair-receipts';

function makeFailure(
  overrides: Partial<ProviderExportFailureReceipt> = {}
): ProviderExportFailureReceipt {
  return {
    id: 'failure-001',
    schemaVersion: PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION,
    provider: 'google',
    redactedAccountLabel: 'j***@example.com',
    accountLabelHash: 'account-hash-001',
    exportIdHash: 'export-hash-001',
    failureKind: 'missing_archive_part',
    providerWaitState: 'ready_to_download',
    deliveryMethod: 'email_link',
    archiveFormat: 'zip',
    observedAt: '2026-05-19T08:00:00Z',
    linkExpiresAt: '2026-05-20T08:00:00Z',
    adminOrManagedAccountBlock: false,
    connectedAppAccessInvolved: false,
    accountMutationPerformed: false,
    rawPrivateDataPublished: false,
    privatePathLeakedToPublicReceipt: false,
    hash: 'failure-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeArchiveEvidence(
  overrides: Partial<PartialArchiveEvidenceReceipt> = {}
): PartialArchiveEvidenceReceipt {
  return {
    id: 'partial-001',
    schemaVersion: PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION,
    failureReceiptId: 'failure-001',
    quarantineReceiptId: 'quarantine-001',
    destinationFolderLabel: '.tmp/holoshell/account-export-quarantine',
    destinationFolderHash: 'destination-hash-001',
    observedParts: [
      {
        partId: 'takeout-001.zip',
        redactedPath: 'exports/google/takeout-001.zip',
        sizeBytes: 1024,
        sha256: 'part-hash-001',
        complete: true,
        openTest: 'pass',
      },
      {
        partId: 'takeout-002.zip',
        redactedPath: 'exports/google/takeout-002.zip',
        sizeBytes: 0,
        sha256: 'missing-part-placeholder-hash',
        complete: false,
        openTest: 'not_tested',
      },
    ],
    expectedPartCount: 3,
    missingPartCount: 1,
    verifiedPartCount: 1,
    unzipError: 'expected central directory for third archive part',
    unexpectedExecutableCount: 0,
    sensitivityScanStatus: 'warn',
    missingEvidence: ['takeout-003.zip not present in quarantine'],
    importAllowed: false,
    deleteAllowed: false,
    shareAllowed: false,
    rawPrivateDataPublished: false,
    privateAbsolutePathReceipt: 'private-path-receipt-001',
    hash: 'partial-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makePlan(
  overrides: Partial<ProviderExportRepairPlanReceipt> = {}
): ProviderExportRepairPlanReceipt {
  return {
    id: 'repair-plan-001',
    schemaVersion: PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION,
    failureReceiptId: 'failure-001',
    partialArchiveEvidenceReceiptId: 'partial-001',
    repairAction: 'resume_download',
    safeReason:
      'Archive evidence is missing 1 part(s); resume or re-download into quarantine before import.',
    selectedProductsHash: 'selected-products-hash-001',
    userApprovalNonce: 'nonce-001',
    requiresFreshUserGesture: true,
    retryWillMutateProviderState: false,
    previousEvidencePreserved: true,
    importBlockedUntilVerified: true,
    deleteBlockedUntilApproved: true,
    rawPrivateDataPublished: false,
    rollbackNote: 'No local deletion until repaired archive verifies.',
    plannedAt: '2026-05-19T08:02:00Z',
    hash: 'plan-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeReplay(overrides: Partial<ExportRepairReplayReceipt> = {}): ExportRepairReplayReceipt {
  return {
    id: 'repair-replay-001',
    schemaVersion: EXPORT_REPAIR_REPLAY_RECEIPT_VERSION,
    failureReceiptId: 'failure-001',
    repairPlanReceiptId: 'repair-plan-001',
    replayKey: 'intent+provider+parts',
    originalFailureKind: 'missing_archive_part',
    repairedOutcome: 'waiting',
    missingEvidenceListed: true,
    replayableWithoutProviderAccess: true,
    rawPrivateDataPublished: false,
    lesson: 'The archive is not safe to import until every part is present and verified.',
    nextSafeAction: 'Resume the download into quarantine and verify all parts before import.',
    createdAt: '2026-05-19T08:03:00Z',
    hash: 'replay-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makePack(
  overrides: Partial<HoloShellProviderExportRepairReceiptPack> = {}
): HoloShellProviderExportRepairReceiptPack {
  return {
    id: 'repair-pack-001',
    schemaVersion: PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION,
    status: 'verified',
    failure: makeFailure(),
    archiveEvidence: makeArchiveEvidence(),
    repairPlan: makePlan(),
    replay: makeReplay(),
    importAllowed: false,
    deleteAllowed: false,
    shareAllowed: false,
    hash: 'pack-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeWitnessFixture(
  overrides: Partial<ProviderExportWitnessFixture> = {}
): ProviderExportWitnessFixture {
  return {
    idPrefix: 'takeout-fixture',
    provider: 'google',
    providerStatus: 'ready_link',
    redactedAccountLabel: 'j***@example.com',
    accountLabelHash: 'account-hash-001',
    exportIdHash: 'export-hash-001',
    deliveryMethod: 'email_link',
    archiveFormat: 'zip',
    observedAt: '2026-06-21T08:00:00Z',
    linkExpiresAt: '2026-06-22T08:00:00Z',
    connectedAppAccessInvolved: false,
    selectedProductsHash: 'selected-products-hash-001',
    userApprovalNonce: 'approval-nonce-001',
    plannedAt: '2026-06-21T08:01:00Z',
    quarantine: {
      quarantineReceiptId: 'quarantine-001',
      destinationFolderLabel: 'exports/google-takeout-quarantine',
      destinationFolderHash: 'destination-hash-001',
      expectedPartCount: 3,
      observedParts: [
        {
          partId: 'takeout-001.zip',
          redactedPath: 'exports/google/takeout-001.zip',
          sizeBytes: 1024,
          sha256: 'part-hash-001',
          complete: true,
          openTest: 'pass',
        },
        {
          partId: 'takeout-002.zip',
          redactedPath: 'exports/google/takeout-002.zip',
          sizeBytes: 2048,
          sha256: 'part-hash-002',
          complete: true,
          openTest: 'fail',
        },
      ],
      missingEvidence: [
        'takeout-003.zip not present in quarantine',
        'takeout-002.zip failed archive open test',
      ],
      unzipError: 'takeout-002.zip central directory mismatch',
      unexpectedExecutableCount: 0,
      sensitivityScanStatus: 'warn',
      privateAbsolutePathReceipt: 'private-path-receipt-001',
    },
    ...overrides,
  };
}

function planFor(
  failureKind: ProviderExportFailureKind,
  archiveOverrides: Partial<PartialArchiveEvidenceReceipt> = {},
  failureOverrides: Partial<ProviderExportFailureReceipt> = {}
): ProviderExportRepairPlanReceipt {
  return buildProviderExportRepairPlanReceipt(
    makeFailure({ failureKind, ...failureOverrides }),
    makeArchiveEvidence({ missingPartCount: 0, missingEvidence: [], ...archiveOverrides }),
    {
      id: `plan-${failureKind}`,
      selectedProductsHash: 'products-hash-001',
      userApprovalNonce: 'approval-nonce-001',
      plannedAt: '2026-05-19T08:04:00Z',
      hash: `plan-hash-${failureKind}`,
      hashAlgorithm: 'sha256',
    }
  );
}

describe('HoloShell provider export repair receipts', () => {
  it('validates failed export repair receipts and packs', () => {
    expect(validateProviderExportFailureReceipt(makeFailure())).toEqual([]);
    expect(validatePartialArchiveEvidenceReceipt(makeArchiveEvidence())).toEqual([]);
    expect(validateProviderExportRepairPlanReceipt(makePlan())).toEqual([]);
    expect(validateExportRepairReplayReceipt(makeReplay())).toEqual([]);
    expect(validateHoloShellProviderExportRepairReceiptPack(makePack())).toEqual([]);
  });

  it('rejects account mutation, private publication, leaked paths, and unsupported state', () => {
    const receipt = makeFailure({
      redactedAccountLabel: 'C:/Users/josep/private/account',
      failureKind: 'mystery_failure' as ProviderExportFailureKind,
      providerWaitState: 'sent_email' as ProviderExportFailureReceipt['providerWaitState'],
      accountMutationPerformed: true as false,
      rawPrivateDataPublished: true as false,
      privatePathLeakedToPublicReceipt: true as false,
    });

    expect(validateProviderExportFailureReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'ProviderExportFailureReceipt.redactedAccountLabel must be redacted or hashed, not an absolute path.',
        'ProviderExportFailureReceipt.failureKind is unsupported: mystery_failure.',
        'ProviderExportFailureReceipt.providerWaitState is unsupported: sent_email.',
        'ProviderExportFailureReceipt.accountMutationPerformed must be false.',
        'ProviderExportFailureReceipt.rawPrivateDataPublished must be false.',
        'ProviderExportFailureReceipt.privatePathLeakedToPublicReceipt must be false.',
      ])
    );
  });

  it('blocks import, delete, share, private publication, and public absolute paths for partial archives', () => {
    const receipt = makeArchiveEvidence({
      destinationFolderLabel: 'C:/Users/josep/Downloads/Takeout',
      privateAbsolutePathReceipt: 'C:/Users/josep/Downloads/Takeout/private-receipt.json',
      missingPartCount: 1,
      missingEvidence: [],
      importAllowed: true as false,
      deleteAllowed: true as false,
      shareAllowed: true as false,
      rawPrivateDataPublished: true as false,
    });

    expect(validatePartialArchiveEvidenceReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'PartialArchiveEvidenceReceipt.destinationFolderLabel must be redacted or hashed, not an absolute path.',
        'PartialArchiveEvidenceReceipt.missingEvidence must list missing parts when missingPartCount > 0.',
        'PartialArchiveEvidenceReceipt.importAllowed must be false.',
        'PartialArchiveEvidenceReceipt.deleteAllowed must be false.',
        'PartialArchiveEvidenceReceipt.shareAllowed must be false.',
        'PartialArchiveEvidenceReceipt.rawPrivateDataPublished must be false.',
        'PartialArchiveEvidenceReceipt.privateAbsolutePathReceipt must be a private receipt id, not an absolute path.',
      ])
    );
  });

  it('requires fresh gesture, preserved evidence, and blocked import/delete for repair plans', () => {
    const receipt = makePlan({
      requiresFreshUserGesture: false as true,
      previousEvidencePreserved: false as true,
      importBlockedUntilVerified: false as true,
      deleteBlockedUntilApproved: false as true,
      rawPrivateDataPublished: true as false,
    });

    expect(validateProviderExportRepairPlanReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'ProviderExportRepairPlanReceipt.requiresFreshUserGesture must be true.',
        'ProviderExportRepairPlanReceipt.previousEvidencePreserved must be true.',
        'ProviderExportRepairPlanReceipt.importBlockedUntilVerified must be true.',
        'ProviderExportRepairPlanReceipt.deleteBlockedUntilApproved must be true.',
        'ProviderExportRepairPlanReceipt.rawPrivateDataPublished must be false.',
      ])
    );
  });

  it('chooses deterministic repair actions from failure evidence', () => {
    expect(
      planFor('provider_delay', {}, { providerWaitState: 'provider_waiting' }).repairAction
    ).toBe('wait');
    expect(planFor('missing_archive_part', { missingPartCount: 1 }).repairAction).toBe(
      'resume_download'
    );
    expect(planFor('admin_blocked', {}, { adminOrManagedAccountBlock: true }).repairAction).toBe(
      'manual_provider_ticket'
    );
    expect(planFor('cloud_handoff_block').repairAction).toBe('change_delivery_method');
    expect(planFor('corrupt_archive').repairAction).toBe('change_archive_size');
    expect(planFor('link_expired').repairAction).toBe('re_download_same_link');
  });

  it('clones repair packs without retaining mutable arrays', () => {
    const original = makePack();
    const clone = cloneHoloShellProviderExportRepairReceiptPack(original);

    clone.archiveEvidence!.observedParts[0].partId = 'changed.zip';
    clone.archiveEvidence!.missingEvidence.push('new.zip');

    expect(original.archiveEvidence!.observedParts[0].partId).toBe('takeout-001.zip');
    expect(original.archiveEvidence!.missingEvidence).toEqual([
      'takeout-003.zip not present in quarantine',
    ]);
  });

  it('exposes repair routing guards', () => {
    expect(isSupportedProviderExportRepairAction('resume_download')).toBe(true);
    expect(isSupportedProviderExportRepairAction('click_random_provider_button')).toBe(false);
    expect(isSupportedProviderExportRepairStatus('repair_planned')).toBe(true);
    expect(isSupportedProviderExportRepairStatus('ready_for_retry')).toBe(false);
  });

  it('builds a fixture-backed witness pack without public private-path leaks', () => {
    const result = buildProviderExportWitnessFixtureResult(makeWitnessFixture());

    expect(result.validationErrors).toEqual([]);
    expect(result.pack.importAllowed).toBe(false);
    expect(result.pack.deleteAllowed).toBe(false);
    expect(result.pack.shareAllowed).toBe(false);
    expect(result.pack.archiveEvidence?.importAllowed).toBe(false);
    expect(result.pack.archiveEvidence?.deleteAllowed).toBe(false);
    expect(result.pack.archiveEvidence?.shareAllowed).toBe(false);
    expect(result.pack.failure.failureKind).toBe('corrupt_archive');
    expect(result.pack.repairPlan?.repairAction).toBe('change_archive_size');
    expect(result.pack.replay?.replayableWithoutProviderAccess).toBe(true);
    expect(result.publicRepairDockSummary.blockedActions).toEqual(['import', 'delete', 'share']);
    expect(result.publicRepairDockSummary.lesson).toContain('Do not import, delete, or share');

    const publicReceiptJson = JSON.stringify({
      failure: result.pack.failure,
      archiveEvidence: result.pack.archiveEvidence,
      repairPlan: result.pack.repairPlan,
      replay: result.pack.replay,
      publicRepairDockSummary: result.publicRepairDockSummary,
    });
    expect(publicReceiptJson).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(publicReceiptJson).not.toContain('/Users/josep');
  });

  it('routes provider witness statuses to deterministic safe retry actions', () => {
    const missingOnlyFixture = {
      ...makeWitnessFixture().quarantine,
      observedParts: [
        {
          partId: 'takeout-001.zip',
          redactedPath: 'exports/google/takeout-001.zip',
          sizeBytes: 1024,
          sha256: 'part-hash-001',
          complete: true,
          openTest: 'pass' as const,
        },
      ],
      expectedPartCount: 2,
      missingEvidence: ['takeout-002.zip not present in quarantine'],
      unzipError: undefined,
      sensitivityScanStatus: 'warn' as const,
    };

    const cases: Array<{
      status: ProviderExportWitnessStatus;
      failureKind: ProviderExportFailureKind;
      action: ProviderExportRepairPlanReceipt['repairAction'];
      quarantine?: ProviderExportWitnessFixture['quarantine'];
    }> = [
      { status: 'provider_waiting', failureKind: 'provider_delay', action: 'wait' },
      { status: 'expired_link', failureKind: 'link_expired', action: 're_download_same_link' },
      { status: 'admin_block', failureKind: 'admin_blocked', action: 'manual_provider_ticket' },
      {
        status: 'cloud_handoff_block',
        failureKind: 'cloud_handoff_block',
        action: 'change_delivery_method',
      },
      {
        status: 'ready_link',
        failureKind: 'missing_archive_part',
        action: 'resume_download',
        quarantine: missingOnlyFixture,
      },
    ];

    for (const { status, failureKind, action, quarantine } of cases) {
      const result = buildProviderExportWitnessFixtureResult(
        makeWitnessFixture({
          idPrefix: `fixture-${status}`,
          providerStatus: status,
          ...(quarantine ? { quarantine } : {}),
        })
      );
      expect(result.validationErrors).toEqual([]);
      expect(result.pack.failure.failureKind).toBe(failureKind);
      expect(result.pack.repairPlan?.repairAction).toBe(action);
    }
  });

  it('rejects fixture receipts that leak absolute paths into public fields', () => {
    const result = buildProviderExportWitnessFixtureResult(
      makeWitnessFixture({
        quarantine: {
          ...makeWitnessFixture().quarantine,
          destinationFolderLabel: 'C:/Users/josep/Downloads/Takeout',
          privateAbsolutePathReceipt: 'C:/Users/josep/private/path-receipt.json',
          observedParts: [
            {
              partId: 'takeout-001.zip',
              redactedPath: 'C:/Users/josep/Downloads/Takeout/takeout-001.zip',
              sizeBytes: 1024,
              sha256: 'part-hash-001',
              complete: true,
              openTest: 'pass',
            },
          ],
        },
      })
    );

    expect(result.validationErrors).toEqual(
      expect.arrayContaining([
        'PartialArchiveEvidenceReceipt.destinationFolderLabel must be redacted or hashed, not an absolute path.',
        'PartialArchivePartEvidence.redactedPath must be redacted or hashed, not an absolute path.',
        'PartialArchiveEvidenceReceipt.privateAbsolutePathReceipt must be a private receipt id, not an absolute path.',
      ])
    );
  });
});
