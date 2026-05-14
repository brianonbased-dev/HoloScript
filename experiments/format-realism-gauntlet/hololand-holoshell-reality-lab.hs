// HoloLand/HoloShell Reality Lab pipeline.
// Gathers HoloShell command receipts, normalizes failures, and emits task seeds
// without pretending failed parse, render, or interop steps are green.

pipeline "HoloLandHoloShellRealityLab" {
  schedule: "manual"
  timeout: 90s
  retry: { max: 1, backoff: "fixed" }

  source CommandReceipts {
    type: "filesystem"
    path: "experiments/format-realism-gauntlet/holoshell-command-output.sample.json"
    format: "json"
  }

  transform NormalizeCommandOutput {
    scenarioId -> scenarioId
    commandId -> evidenceId
    stage -> stage
    surface -> surface
    status -> commandStatus
    exitCode -> exitCode
    command -> reproCommand
    stdout -> stdoutSummary
    stderr -> stderrSummary
    gapSeverity -> gapSeverity
    gapCode -> gapCode
    splashZone -> splashZone
    wotThing -> wotThing
    physicsChannel -> physicsChannel
    spatialAudioCue -> spatialAudioCue
    economyDelta -> economyDelta
  }

  filter FailedCommands {
    where: commandStatus != "pass"
  }

  validate HoloMeshSeedContract {
    evidenceId : required, string
    commandStatus : required, string
    exitCode : required, integer
    gapSeverity : required, string
    gapCode : required, string
    splashZone : required, string
    reproCommand : required, string
  }

  sink LocalGapDigest {
    type: "filesystem"
    path: "${env.FORMAT_REALITY_LAB_OUT}"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "webhook"
    endpoint: "${env.HOLOMESH_BOARD_SEED_URL}"
    method: "POST"
    body: {
      source: "format-stress-reality-lab",
      scenario: "hololand-holoshell-reality-lab",
      failure_count: "${data.length}"
    }
    on_error: { action: "log", continue: true }
  }
}
