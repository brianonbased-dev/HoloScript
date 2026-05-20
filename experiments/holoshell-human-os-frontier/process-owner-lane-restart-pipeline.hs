// HoloShell process owner-lane restart data pipeline.
// Turns process health and managed-service status receipts into a deterministic
// start/restart plan, approval packet, after-action verification, and replay key.

pipeline "HoloShellProcessOwnerLaneRestartPipeline" {
  schedule: "manual"
  timeout: 180s
  retry: { max: 0 }

  source ProcessHealthReceipt {
    type: "filesystem"
    path: "${input.process_health_receipt}"
    format: "json"
    mode: "read_only"
  }

  source ControlDaemonStatus {
    type: "filesystem"
    path: "${input.control_daemon_status_receipt}"
    format: "json"
    mode: "read_only"
  }

  source NetworkSentinelStatus {
    type: "filesystem"
    path: "${input.network_sentinel_status_receipt}"
    format: "json"
    mode: "read_only"
  }

  source ApprovalPacket {
    type: "filesystem"
    path: "${input.approval_packet}"
    format: "json"
    mode: "read_only"
    optional: true
  }

  source AfterActionReceipt {
    type: "filesystem"
    path: "${input.after_action_receipt}"
    format: "json"
    mode: "read_only"
    optional: true
  }

  transform OwnerLaneSummary {
    riskState -> riskState
    processCount -> processCount
    shellRunCount -> shellRunCount
    ownerHandoffPlanCount -> ownerHandoffPlanCount
    ownerUnknownReviewCount -> ownerUnknownReviewCount
    cleanupStopPlanCount -> cleanupStopPlanCount
  }

  transform ServiceReadiness {
    controlDaemonStatus -> controlDaemonStatus
    networkSentinelStatus -> networkSentinelStatus
    pidCommandVerified -> pidCommandVerified
    executeEnabled -> executeEnabled
    trustedExecuteEnabled -> trustedExecuteEnabled
  }

  validate ProcessHealthContract {
    riskState : required, string
    processCount : required, number
    ownerHandoffPlanCount : required, number
    automaticTerminationAllowed : required, false
    exactPidRequired : required, true
  }

  validate ManagedServiceStatusContract {
    serviceStatus : required, string
    exactPidRequired : required, true
    rawCommandLineIncluded : required, false
    destructiveActionsTaken : required, false
    localOnly : required, true
  }

  validate RestartApprovalContract {
    approvalId : required, string
    targetService : required, string
    requestedAction : required, string
    freshHumanGestureCaptured : required, true
    expiresAt : required, string
  }

  validate AfterActionContract {
    requestedAction : required, string
    targetService : required, string
    beforeStatusHash : required, string
    afterStatusHash : required, string
    serviceMutationTaken : required, boolean
    destructiveActionsTaken : required, false
  }

  transform HumanRestartPlan {
    riskState -> headline
    ownerHandoffPlanCount -> ownerHandoffCards
    controlDaemonStatus -> controlDaemonCard
    networkSentinelStatus -> networkSentinelCard
    approvalPacket -> approvalGate
    afterActionReceipt -> replayCard
  }

  filter NeedsServiceStart {
    where: controlDaemonCard.status == "offline" || networkSentinelCard.status == "offline"
  }

  filter NeedsOwnerHandoff {
    where: ownerHandoffCards.count > 0
  }

  sink RestartEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-20/process-owner-lane-restart-evidence-pack.md"
    method: "write"
    format: "markdown"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-20/process-owner-lane-restart-holomesh-tasks.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }
}
