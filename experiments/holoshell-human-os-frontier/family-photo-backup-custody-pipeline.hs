// HoloShell family photo backup custody data pipeline.
// Normalizes album snapshot, duplicate detection, privacy redaction,
// target copy manifest, restore proof, and delete-blocker receipts into one
// deterministic custody record for HoloShell.

pipeline "HoloShellFamilyPhotoBackupCustodyPipeline" {
  schedule: "manual"
  timeout: 300s
  retry: { max: 0 }

  source SelectedAlbum {
    type: "filesystem"
    path: "${input.album_path}"
    format: "binary"
    mode: "read_only"
  }

  source AlbumFingerprint {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-22/photo-backup-album-fingerprint.json"
    format: "json"
  }

  source BackupTargetConfig {
    type: "filesystem"
    path: "${input.backup_target_config}"
    format: "json"
    optional: true
  }

  transform AlbumSnapshot {
    albumLabel -> albumLabel
    fileCount -> photoCount
    totalBytes -> albumBytes
    hashAlgorithm -> hashAlgorithm
  }

  transform DuplicateDetection {
    fileHashes -> duplicateGroups
    duplicateGroups -> uniqueFileCount
    uniqueFileCount -> summaryDuplicateGroupCount
  }

  transform PrivacyEnvelope {
    gpsCoordinates -> gpsRedacted
    faceLabels -> faceLabelsRedacted
    cameraSerials -> cameraSerialsRedacted
    metadataPolicy -> chosenMetadataPolicy
    rawPixelsInPublic -> rawPixelsInPublicReceipt
  }

  transform TargetCopyManifest {
    targetKind -> targetKind
    quotaChecked -> quotaChecked
    providerAccountResolved -> providerAccountResolved
    deleteSemanticsVisible -> deleteSemanticsVisible
    copyManifestHash -> copyManifestHash
  }

  transform RestoreVerification {
    copyManifestHash -> sourceReceiptHash
    sampleRestoreHash -> sampleRestoreHashMatch
    sampleRestoreCount -> sampleRestoreCountMatch
    sampleRestorePrivacy -> sampleRestorePrivacyMatch
  }

  validate SourceAlbumGate {
    albumLabel : required, string
    albumBytes : required
    hashAlgorithm : required, string
    originalsDeleted : required, false
    deleteBlocked : required, true
  }

  validate DuplicateMemoryTable {
    duplicateGroups : required
    uniqueFileCount : required
    summaryDuplicateGroupCount : required
  }

  validate PrivacyAndEncryptionGate {
    gpsRedacted : required, true
    faceLabelsRedacted : required, true
    rawPixelsInPublicReceipt : required, false
    chosenMetadataPolicy : required, string
  }

  validate ProviderBoundaryGate {
    targetKind : required, string
    quotaChecked : conditional(targetKind != "not_chosen", true)
    deleteSemanticsVisible : conditional(targetKind != "not_chosen", true)
    providerAccountResolved : conditional(targetKind == "cloud_provider", true)
  }

  validate RestoreProofGate {
    sourceReceiptHash : required, string
    sampleRestoreHashMatch : required, true
    sampleRestoreCountMatch : required, true
    sampleRestorePrivacyMatch : required, true
    originalsDeletionAllowed : required, false
  }

  validate DeleteBlocker {
    deleteBlocked : required, true
    restoreVerified : required, true
    originalsDeleted : required, false
    requiresFreshApproval : required, true
  }

  sink CustodyReceiptPack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-22/photo-backup-custody-receipt-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink VerificationReceipt {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-22/photo-backup-verification-receipt.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-22/photo-backup-holomesh-tasks.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }
}