import { describe, expect, it } from 'vitest';
import {
  PHOTO_BACKUP_CUSTODY_RECEIPT_VERSION,
  PHOTO_BACKUP_VERIFICATION_RECEIPT_VERSION,
  type PhotoBackupCustodyReceipt,
  type PhotoBackupVerificationReceipt,
  clonePhotoBackupCustodyReceipt,
  validatePhotoBackupCustodyReceipt,
  validatePhotoBackupVerificationReceipt,
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
    const receipt = makeCustodyReceipt() as unknown as Omit<PhotoBackupCustodyReceipt, 'summary'> & {
      summary: Omit<PhotoBackupCustodyReceipt['summary'], 'originalsDeleted'> & { originalsDeleted: boolean };
    };
    receipt.summary.originalsDeleted = true;
    expect(validatePhotoBackupCustodyReceipt(receipt as unknown as PhotoBackupCustodyReceipt)).toContain(
      'PhotoBackupCustodyReceipt.summary.originalsDeleted must be false.'
    );
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
