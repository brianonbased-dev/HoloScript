// HoloShell failed provider export repair pipeline.
// Board task: task_1779178784570_a5c2 — Build provider export repair room (marathon cycle 14, grok1-x402, 2026-05-19)
// Turns a provider export failure or partial local archive into a deterministic
// repair plan with preserved evidence, approval gates, and replayable lessons.
//
// 5-lane cross-link: maps to Interrupted/Completeness/Retry/Quarantine/ImportHandoff states from sibling download recovery spec.
// Receipts: ProviderExportFailureReceipt, PartialArchiveEvidenceReceipt, ProviderExportRepairPlanReceipt, ExportRepairReplayReceipt
// (implemented in policy.hsplus + consumed by room.holo)

pipeline "HoloShellFailedProviderExportRepairPipeline" {
  schedule: "manual"
  timeout: 900s
  retry: { max: 0 }

  source ObserveProviderFailure {
    type: "filesystem"
    path: "${input.providerStatusReceiptPath}"
    format: "json"
    readOnly: true
  }

  source InspectPartialArchive {
    type: "filesystem"
    path: "${input.quarantinePath}"
    format: "archive_parts"
    readOnly: true
  }

  transform ClassifyFailure {
    ObserveProviderFailure -> providerFailure : classify_provider_wait_state() : classify_link_expiry() : classify_admin_block()
    InspectPartialArchive -> partialArchive : hash_parts() : detect_missing_parts() : detect_corruption() : detect_executables() : classify_sensitivity()
  }

  validate FailureObservationContract {
    providerFailure.accountMutationPerformed : equals false
    providerFailure.rawPrivateDataPublished : equals false
    providerFailure.privatePathLeakedToPublicReceipt : equals false
    partialArchive.importAllowed : equals false
    partialArchive.deleteAllowed : equals false
  }

  receipt ProviderExportFailureReceipt {
    phase: "observe_failure"
    provider: "${input.provider}"
    failureKind: "${providerFailure.failureKind}"
    deliveryMethod: "${providerFailure.deliveryMethod}"
    envelope: "read_only"
  }

  transform PreserveEvidence {
    partialArchive -> preservedEvidence : write_redacted_part_manifest() : write_hash_manifest() : seal_delete_block()
  }

  validate PreservationContract {
    preservedEvidence.observedParts : required
    preservedEvidence.missingParts : required
    preservedEvidence.perPartHashes : required
    preservedEvidence.rawPrivateDataPublished : equals false
    preservedEvidence.privatePathLeakedToPublicReceipt : equals false
  }

  receipt PartialArchiveEvidenceReceipt {
    phase: "preserve_partial_archive"
    provider: "${input.provider}"
    observedPartCount: "${preservedEvidence.observedPartCount}"
    missingPartCount: "${preservedEvidence.missingPartCount}"
    envelope: "read_only"
  }

  transform BuildRepairPlan {
    providerFailure -> repairPlan : choose_safe_repair_action() : compare_retry_options() : bind_approval_nonce()
    preservedEvidence -> repairEvidenceSummary : summarize_missing_parts()
  }

  validate RepairPlanContract {
    repairPlan.action : in ["wait", "resume_download", "re_download_same_link", "split_product_scope", "change_archive_size", "change_delivery_method", "manual_provider_ticket"]
    repairPlan.previousEvidencePreserved : equals true
    repairPlan.userApprovalNonce : required, string
    repairPlan.rollbackNote : required, string
    repairPlan.rawPrivateDataPublished : equals false
  }

  receipt ProviderExportRepairPlanReceipt {
    phase: "plan_repair"
    provider: "${input.provider}"
    repairAction: "${repairPlan.action}"
    approvalNonce: "${repairPlan.userApprovalNonce}"
    envelope: "guarded_execute"
  }

  transform BuildReplayLesson {
    repairPlan -> replayLesson : build_replay_key() : write_plain_language_lesson()
    preservedEvidence -> replayMissingEvidence : list_missing_evidence()
  }

  validate ReplayLessonContract {
    replayLesson.replayKey : required, string
    replayLesson.originalFailureKind : required, string
    replayLesson.missingEvidenceListed : equals true
    replayLesson.replayableWithoutProviderAccess : equals true
    replayLesson.rawPrivateDataPublished : equals false
  }

  receipt ExportRepairReplayReceipt {
    phase: "replay_lesson"
    provider: "${input.provider}"
    originalFailureKind: "${replayLesson.originalFailureKind}"
    replayKey: "${replayLesson.replayKey}"
    envelope: "read_only"
  }

  sink RepairEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-19/failed-provider-export-repair-evidence-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: false }
  }

  sink HoloMeshTaskSeed {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-19/failed-provider-export-repair-holomesh-tasks.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }
}
