import { describe, expect, it } from 'vitest';
import {
  PHOTO_BACKUP_CUSTODY_RECEIPT_VERSION,
  PHOTO_BACKUP_VERIFICATION_RECEIPT_VERSION,
  PHOTO_BACKUP_DELETE_BLOCKER_RECEIPT_VERSION,
  PHOTO_BACKUP_DELETE_APPROVAL_TEXT,
  type PhotoBackupCustodyReceipt,
  type PhotoBackupVerificationReceipt,
  type PhotoBackupDeleteBlockerReceipt,
  clonePhotoBackupCustodyReceipt,
  validatePhotoBackupCustodyReceipt,
  validatePhotoBackupVerificationReceipt,
  validatePhotoBackupDeleteBlockerReceipt,
  clonePhotoBackupDeleteBlockerReceipt,
} from '../holoshell-photo-backup-receipts';

function makeCustodyReceipt(): PhotoBackupCustodyReceipt {
  return {
    schemaVersion: PHOTO_BACKUP_CUSTODY_RECEIPT_VERSION,
    receiptId: 'photo-backup.fixture',
    generatedAt: '2026-05-21T12:00:00.000Z',
    source: {
      albumLabel: 'Family Photos',
      albumFingerprint: 'albumabcdef1234',
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
      privacyClass: 'local_private',
    },
    summary: {
      status: 'planned',
      albumCount: 2,
      photoCount: 2,
      videoCount: 1,
      duplicateGroupCount: 1,
      unreadableCount: 0,
      originalsDeleted: false,
      deleteBlocked: true,
      restoreVerified: false,
    },
    privacyEnvelope: {
      chosen: false,
      metadataPolicy: 'not_chosen',
      rawPixelsInPublicReceipt: false,
      gpsRedacted: true,
      faceLabelsRedacted: true,
    },
    targetPlan: {
      targetKind: 'not_chosen',
      quotaChecked: false,
      deleteSemanticsVisible: false,
      providerAccountResolved: false,
    },
    files: [
      {
        id: 'media.1',
        name: 'img-001.jpg',
        relativePath: 'summer/img-001.jpg',
        mediaKind: 'photo',
        sizeBytes: 32,
        hashSha256: 'a'.repeat(64),
        hashStatus: 'complete',
        duplicateGroupId: 'duplicate.1',
        unreadable: false,
        privacyMetadataClasses: ['gps', 'faces'],
      },
      {
        id: 'media.2',
        name: 'img-001-copy.jpg',
        relativePath: 'summer/img-001-copy.jpg',
        mediaKind: 'photo',
        sizeBytes: 32,
        hashSha256: 'a'.repeat(64),
        hashStatus: 'complete',
        duplicateGroupId: 'duplicate.1',
        unreadable: false,
        privacyMetadataClasses: ['gps', 'faces'],
      },
      {
        id: 'media.3',
        name: 'clip-001.mov',
        relativePath: 'winter/clip-001.mov',
        mediaKind: 'video',
        sizeBytes: 48,
        hashSha256: 'b'.repeat(64),
        hashStatus: 'complete',
        unreadable: false,
        privacyMetadataClasses: ['gps', 'camera_serial'],
      },
    ],
    replay: {
      replayInputs: ['albumFingerprint:albumabcdef1234', 'maxFiles:250'],
      rollbackPlan: 'Remove generated .tmp/holoshell photo receipts. Source media was read only.',
    },
    output: {
      privateReceiptPath: '.tmp/holoshell/photo-backup-receipts/photo-backup.fixture-private.json',
      latestPath: '.tmp/holoshell/photo-backup-custody-latest.json',
    },
  };
}

function makeVerificationReceipt(): PhotoBackupVerificationReceipt {
  return {
    schemaVersion: PHOTO_BACKUP_VERIFICATION_RECEIPT_VERSION,
    verificationId: 'photo-backup-verification.fixture',
    generatedAt: '2026-05-21T12:05:00.000Z',
    sourceReceipt: '.tmp/holoshell/photo-backup-custody-latest.json',
    copyManifestHash: 'c'.repeat(64),
    sampleRestore: {
      performed: true,
      hashMatch: true,
      countMatch: true,
      privacyModeMatch: true,
    },
    summary: {
      status: 'verified',
      copyExecuted: true,
      sampleRestorePassed: true,
      originalsDeleted: false,
    },
    rollback: {
      plan: 'Keep originals and remove generated backup test copy if needed.',
      originalsDeletionAllowed: false,
    },
  };
}

describe('HoloShell photo backup receipts', () => {
  it('accepts read-only planned custody receipts with deletion blocked', () => {
    expect(validatePhotoBackupCustodyReceipt(makeCustodyReceipt())).toEqual([]);
  });

  it('rejects absolute public paths', () => {
    const receipt = makeCustodyReceipt();
    receipt.files[0].relativePath = 'C:\\Users\\josep\\Pictures\\summer\\img-001.jpg';
    expect(validatePhotoBackupCustodyReceipt(receipt)).toContain(
      'PhotoBackupFileProxy(media.1).relativePath must be repo-relative/redacted, not an absolute path.'
    );
  });

  it('rejects original deletion before restore proof', () => {
    const receipt = makeCustodyReceipt() as unknown as Omit<
      PhotoBackupCustodyReceipt,
      'summary'
    > & {
      summary: Omit<PhotoBackupCustodyReceipt['summary'], 'originalsDeleted'> & {
        originalsDeleted: boolean;
      };
    };
    receipt.summary.originalsDeleted = true;
    expect(
      validatePhotoBackupCustodyReceipt(receipt as unknown as PhotoBackupCustodyReceipt)
    ).toContain('PhotoBackupCustodyReceipt.summary.originalsDeleted must be false.');
  });

  it('requires quota and delete semantics when a target is chosen', () => {
    const receipt = makeCustodyReceipt();
    receipt.targetPlan.targetKind = 'cloud_provider';
    expect(validatePhotoBackupCustodyReceipt(receipt)).toEqual(
      expect.arrayContaining([
        'PhotoBackupCustodyReceipt.targetPlan.quotaChecked must be true when a target is chosen.',
        'PhotoBackupCustodyReceipt.targetPlan.deleteSemanticsVisible must be true when a target is chosen.',
        'PhotoBackupCustodyReceipt.targetPlan.providerAccountResolved must be true for cloud providers.',
      ])
    );
  });

  it('rejects verified receipts without full sample restore proof', () => {
    const receipt = makeVerificationReceipt();
    receipt.sampleRestore.hashMatch = false;
    expect(validatePhotoBackupVerificationReceipt(receipt)).toContain(
      'PhotoBackupVerificationReceipt.sampleRestore must fully pass when status is verified.'
    );
  });

  it('clones custody receipts deeply', () => {
    const receipt = makeCustodyReceipt();
    const clone = clonePhotoBackupCustodyReceipt(receipt);
    clone.files[0].name = 'changed.jpg';
    expect(receipt.files[0].name).toBe('img-001.jpg');
  });
});

function makeDeleteBlockerReceipt(
  overrides?: Partial<PhotoBackupDeleteBlockerReceipt>
): PhotoBackupDeleteBlockerReceipt {
  return {
    schemaVersion: PHOTO_BACKUP_DELETE_BLOCKER_RECEIPT_VERSION,
    blockerId: 'delete-blocker.fixture',
    generatedAt: '2026-05-22T14:00:00.000Z',
    sourceCustodyReceipt: '.tmp/holoshell/photo-backup-custody-latest.json',
    sourceVerificationReceipt: '.tmp/holoshell/photo-backup-verification-latest.json',
    deleteBlocker: {
      blocked: true,
      reason: 'never_approved',
    },
    deletionApproval: {
      approved: false,
    },
    summary: {
      originalsDeleted: false,
      deleteBlocked: true,
      restoreVerified: true,
    },
    rollback: {
      plan: 'Originals remain on device. Backup copy is permanent.',
      originalsRemainOnDevice: true,
    },
    ...overrides,
  };
}

describe('Photo backup delete blocker receipts', () => {
  it('accepts a delete-blocked receipt when deletion is not approved', () => {
    expect(validatePhotoBackupDeleteBlockerReceipt(makeDeleteBlockerReceipt())).toEqual([]);
  });

  it('accepts a deletion-approved receipt with correct approval text and conditions', () => {
    const receipt = makeDeleteBlockerReceipt({
      deleteBlocker: { blocked: false, reason: 'human_approval_not_given' },
      deletionApproval: {
        approved: true,
        approvalText: PHOTO_BACKUP_DELETE_APPROVAL_TEXT,
        approvedAt: '2026-05-22T14:05:00.000Z',
      },
      summary: {
        originalsDeleted: true,
        deleteBlocked: false,
        restoreVerified: true,
      },
    });
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toEqual([]);
  });

  it('rejects wrong schema version', () => {
    const receipt = makeDeleteBlockerReceipt({
      schemaVersion: 'wrong.version',
    } as unknown as PhotoBackupDeleteBlockerReceipt);
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toContain(
      'PhotoBackupDeleteBlockerReceipt.schemaVersion is unsupported.'
    );
  });

  it('rejects delete blocker with blocked=false when deletion is not approved', () => {
    const receipt = makeDeleteBlockerReceipt({
      deleteBlocker: { blocked: false, reason: 'never_approved' },
      summary: {
        originalsDeleted: false,
        deleteBlocked: false,
        restoreVerified: true,
      },
    });
    const errors = validatePhotoBackupDeleteBlockerReceipt(receipt);
    expect(errors).toContain(
      'PhotoBackupDeleteBlockerReceipt.deleteBlocker.blocked must be true when deletion is not approved.'
    );
    expect(errors).toContain(
      'PhotoBackupDeleteBlockerReceipt.summary.deleteBlocked must be true when deletion is not approved.'
    );
  });

  it('rejects deletion approval without canonical approval text', () => {
    const receipt = makeDeleteBlockerReceipt({
      deleteBlocker: { blocked: false, reason: 'human_approval_not_given' },
      deletionApproval: {
        approved: true,
        approvalText: 'sure, go ahead',
        approvedAt: '2026-05-22T14:05:00.000Z',
      },
      summary: {
        originalsDeleted: true,
        deleteBlocked: false,
        restoreVerified: true,
      },
    });
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toContain(
      'PhotoBackupDeleteBlockerReceipt.deletionApproval.approvalText must match the canonical approval text.'
    );
  });

  it('rejects originalsDeleted=true when deletion is not approved', () => {
    const receipt = makeDeleteBlockerReceipt({
      summary: {
        originalsDeleted: true,
        deleteBlocked: true,
        restoreVerified: true,
      },
    });
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toContain(
      'PhotoBackupDeleteBlockerReceipt.summary.originalsDeleted must be false when deletion is not approved.'
    );
  });

  it('rejects deletion-approved receipt where originals are not marked deleted', () => {
    const receipt = makeDeleteBlockerReceipt({
      deleteBlocker: { blocked: false, reason: 'human_approval_not_given' },
      deletionApproval: {
        approved: true,
        approvalText: PHOTO_BACKUP_DELETE_APPROVAL_TEXT,
        approvedAt: '2026-05-22T14:05:00.000Z',
      },
      summary: {
        originalsDeleted: false,
        deleteBlocked: false,
        restoreVerified: true,
      },
    });
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toContain(
      'PhotoBackupDeleteBlockerReceipt.summary.originalsDeleted must be true when deletion is approved.'
    );
  });

  it('rejects deletion-approved receipt without restore proof', () => {
    const receipt = makeDeleteBlockerReceipt({
      deleteBlocker: { blocked: false, reason: 'human_approval_not_given' },
      deletionApproval: {
        approved: true,
        approvalText: PHOTO_BACKUP_DELETE_APPROVAL_TEXT,
        approvedAt: '2026-05-22T14:05:00.000Z',
      },
      summary: {
        originalsDeleted: true,
        deleteBlocked: false,
        restoreVerified: false,
      },
    });
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toContain(
      'PhotoBackupDeleteBlockerReceipt.summary.restoreVerified must be true when deletion is approved.'
    );
  });

  it('rejects rollback without originalsRemainOnDevice', () => {
    const receipt = makeDeleteBlockerReceipt({
      rollback: {
        plan: 'Some plan',
        originalsRemainOnDevice: false as unknown as true,
      },
    } as unknown as PhotoBackupDeleteBlockerReceipt);
    expect(validatePhotoBackupDeleteBlockerReceipt(receipt)).toContain(
      'PhotoBackupDeleteBlockerReceipt.rollback.originalsRemainOnDevice must be true.'
    );
  });

  it('clones delete blocker receipts deeply', () => {
    const receipt = makeDeleteBlockerReceipt();
    const clone = clonePhotoBackupDeleteBlockerReceipt(receipt);
    clone.blockerId = 'changed';
    expect(receipt.blockerId).toBe('delete-blocker.fixture');
  });
});
