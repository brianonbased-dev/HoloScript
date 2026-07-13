// HoloShell flagship readiness data pipeline.
// Normalizes command, device, validation, and git receipts into one replayable
// readiness record for a non-developer HoloShell room.

pipeline "HoloShellFlagshipReadinessPipeline" {
  schedule: "manual"
  timeout: 120s
  retry: { max: 0 }

  source CurrentHostReadinessPack {
    type: "filesystem"
    path: "${input.current_host_readiness_pack}"
    fallback: ".bench-logs/holoshell-human-os-frontier/latest/ready-world-evidence-pack.json"
    format: "json"
  }

  transform ReadinessSummary {
    CurrentHostReadinessPack.generatedAt -> generatedAt
    CurrentHostReadinessPack.packHash -> packHash
    CurrentHostReadinessPack.host -> host
    CurrentHostReadinessPack.repos -> repos
    CurrentHostReadinessPack.sourceContract.status -> sourceValidationStatus
    CurrentHostReadinessPack.sourceContract.contractChecks -> sourceContractChecks
    CurrentHostReadinessPack.readiness.status -> readinessStatus
    CurrentHostReadinessPack.readiness.blockers -> blockers
    CurrentHostReadinessPack.readiness.warnings -> warnings
  }

  validate ReadinessContract {
    generatedAt : required
    packHash : required, string
    host : required
    repos : required
    sourceValidationStatus : required, string
    sourceContractChecks : required
    readinessStatus : required, string
    blockers : required
    warnings : required
  }

  filter NeedsTaskFiling {
    where: readinessStatus == "blocked" || sourceValidationStatus != "pass"
  }

  sink ReadinessEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/latest/ready-world-evidence-pack.json"
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
