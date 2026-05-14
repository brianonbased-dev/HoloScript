// HoloShell flagship readiness data pipeline.
// Normalizes command, device, validation, and git receipts into one replayable
// readiness record for a non-developer HoloShell room.

pipeline "HoloShellFlagshipReadinessPipeline" {
  schedule: "manual"
  timeout: 120s
  retry: { max: 0 }

  source GitStatus {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-14/git-status.txt"
    format: "text"
  }

  source BuildLog {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-14/pnpm-build.log"
    format: "text"
  }

  source DeviceLabReceipt {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-14/device-lab-receipt.json"
    format: "json"
  }

  source HoloLandSourceValidations {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-14/source-validations.json"
    format: "receipt-set"
  }

  transform ReadinessSummary {
    gitStatus -> changedFiles
    BuildLog.exitCode -> buildExitCode
    DeviceLabReceipt.receipt.overallStatus -> deviceStatus
    DeviceLabReceipt.receipt.checks -> hardwareChecks
    HoloLandSourceValidations.status -> sourceValidationStatus
  }

  validate ReadinessContract {
    changedFiles : required
    buildExitCode : required
    deviceStatus : required, string
    hardwareChecks : required
    sourceValidationStatus : required, string
  }

  filter NeedsTaskFiling {
    where: buildExitCode != 0 || deviceStatus != "pass" || sourceValidationStatus != "pass"
  }

  sink ReadinessEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-14/readiness-evidence-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "webhook"
    endpoint: "${env.HOLOMESH_BOARD_SEED_URL}"
    method: "POST"
    body: {
      source: "holoshell-human-os-frontier",
      workflow: "prepare-computer-for-hololand-world",
      failure_count: "${data.length}"
    }
    on_error: { action: "log", continue: true }
  }
}
