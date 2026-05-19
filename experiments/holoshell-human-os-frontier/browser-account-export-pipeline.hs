// HoloShell browser account export data pipeline.
// Turns a provider export archive into a deterministic, replayable, verified
// evidence pack before any HoloShell import, delete, or share is allowed.
//
// Phases: classify → download → quarantine → verify → preview → task → replay
// Each phase mints a ProviderExportCustodyReceipt (custody chain) plus an
// AccountExportArchiveReceipt or AccountExportReplayReceipt (verification chain).
// Import/delete/share are BLOCKED until verification passes.

pipeline "HoloShellBrowserAccountExportPipeline" {
  schedule: "manual"
  timeout: 600s
  retry: { max: 0 }

  // ─── Phase 1: Classify ──────────────────────────────────────────────────────
  // User selects provider + products. HoloShell classifies intent and
  // checks boundary conditions (managed account, connected apps, etc.).

  source ClassifyExportIntent {
    type: "user_input"
    provider: "${input.provider}"
    products: "${input.products}"
    format: "json"
    readOnly: true
  }

  transform ClassifyBoundary {
    ClassifyExportIntent -> boundaryCheck : check_managed_account() : check_connected_apps() : check_link_expiry()
  }

  validate BoundaryCheck {
    boundaryCheck.accountMutationPerformed : equals false
    boundaryCheck.sourceFileMutationPerformed : equals false
    boundaryCheck.rawPrivateDataPublished : equals false
    boundaryCheck.privatePathLeakedToPublicReceipt : equals false
  }

  receipt ProviderExportCustodyReceipt {
    phase: "intent_classification"
    provider: "${input.provider}"
    products: "${input.products}"
    envelope: "read_only"
  }

  // ─── Phase 2: Download ──────────────────────────────────────────────────────
  // Provider delivers archive (email link, cloud drive, browser download).
  // HoloShell downloads into quarantine. No import allowed yet.

  source DownloadArchive {
    type: "filesystem"
    path: "${input.archivePath}"
    format: "binary"
    readOnly: true
  }

  transform QuarantineArchive {
    DownloadArchive -> quarantinedArchive : move_to_quarantine() : set_readonly()
  }

  receipt ProviderExportCustodyReceipt {
    phase: "download_quarantine"
    provider: "${input.provider}"
    envelope: "break_glass"
  }

  // ─── Phase 3: Verify ────────────────────────────────────────────────────────
  // HoloShell verifies every part, hashes every file, flags executables,
  // classifies sensitivity, and produces an AccountExportArchiveReceipt.
  // Import/delete/share are BLOCKED until this receipt records
  // verificationResult: "verified" or "verified_with_warnings".

  transform VerifyArchive {
    quarantinedArchive -> verifiedArchive : hash_parts() : check_completeness() : build_manifest() : flag_executables() : classify_sensitivity()
  }

  validate ArchiveVerificationContract {
    verifiedArchive.verificationResult : in ["verified", "verified_with_warnings"]
    verifiedArchive.sourceFileMutationPerformed : equals false
    verifiedArchive.rawPrivateDataPublished : equals false
    verifiedArchive.privatePathLeakedToPublicReceipt : equals false
    verifiedArchive.executablesDetected : equals false OR verifiedArchive.executableBlockImport : equals true
    verifiedArchive.partsComplete : equals true
    verifiedArchive.manifestExtracted : equals true
    verifiedArchive.archiveHash : required, string
  }

  receipt AccountExportArchiveReceipt {
    phase: "verify_files"
    provider: "${input.provider}"
    archiveHash: "${verifiedArchive.archiveHash}"
    fileCount: "${verifiedArchive.fileCount}"
    envelope: "read_only"
  }

  // ─── Phase 4: Preview ────────────────────────────────────────────────────────
  // User previews the verified archive contents. No mutations allowed.
  // Sensitivity labels are visible. Restricted files require explicit consent
  // for sharing. Executable files are highlighted.

  transform BuildPreviewSource {
    verifiedArchive -> previewObjects : make_preview_objects()
    previewObjects -> previewHoloSource : render_holo_source()
  }

  validate PreviewSourceContract {
    previewHoloSource : required
    previewObjects : required
    verifiedArchive.verificationResult : in ["verified", "verified_with_warnings"]
  }

  receipt ProviderExportCustodyReceipt {
    phase: "preview"
    provider: "${input.provider}"
    envelope: "guarded_execute"
  }

  // ─── Phase 5: Task File ──────────────────────────────────────────────────────
  // The verified archive is recorded as a HoloShell task file.
  // Import is now allowed (guarded by the ArchiveVerificationGuard).

  transform BuildTaskFile {
    verifiedArchive -> taskFile : create_task_file()
  }

  validate TaskFileContract {
    taskFile : required
    taskFile.archiveHash : equals "${verifiedArchive.archiveHash}"
    taskFile.importAllowed : equals true OR taskFile.verificationResult : in ["verified", "verified_with_warnings"]
    taskFile.shareAllowed : equals true OR taskFile.sensitivityBlockShare : equals true
  }

  receipt ProviderExportCustodyReceipt {
    phase: "task_file"
    provider: "${input.provider}"
    envelope: "guarded_execute"
  }

  // ─── Phase 6: Replay ─────────────────────────────────────────────────────────
  // Deterministic replay of a previously-verified archive. Proves that the
  // archive content has not changed since verification. Produces an
  // AccountExportReplayReceipt comparing original vs current state.

  transform ReplayVerification {
    verifiedArchive -> replayResult : hash_current_files() : compare_with_original_manifest() : detect_sensitivity_drift() : detect_executable_drift()
  }

  validate ReplayContract {
    replayResult.sourceFileMutationPerformed : equals false
    replayResult.rawPrivateDataPublished : equals false
    replayResult.privatePathLeakedToPublicReceipt : equals false
  }

  receipt AccountExportReplayReceipt {
    phase: "replay"
    provider: "${input.provider}"
    originalArchiveHash: "${verifiedArchive.archiveHash}"
    replayOutcome: "${replayResult.replayOutcome}"
    envelope: "read_only"
  }

  // ─── Sinks ────────────────────────────────────────────────────────────────────

  sink VerifiedArchiveEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-18/account-export-evidence-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "block_import", continue: false }
  }

  sink ReplayEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-18/account-export-replay-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "webhook"
    endpoint: "${env.HOLOMESH_BOARD_SEED_URL}"
    method: "POST"
    body: {
      source: "holoshell-human-os-frontier"
      workflow: "browser-account-export-verify"
      archive_hash: "${verifiedArchive.archiveHash}"
      import_allowed: "${verifiedArchive.guard.importAllowed}"
      share_allowed: "${verifiedArchive.guard.shareAllowed}"
    }
    on_error: { action: "log", continue: true }
  }
}