// HoloScript pipeline for the humanoid rock throw gauntlet.
// The pipeline is a contract for automation: gather, validate, capture,
// score, and file tasks from the experiment outputs.

pipeline "HumanoidRockThrowCapture" {
  schedule: "manual"
  timeout: 120s
  retry: { max: 1, backoff: "fixed" }

  source Manifest {
    type: "filesystem"
    path: "experiments/format-realism-gauntlet/manifest.json"
    format: "json"
  }

  transform BuildRunPlan {
    schema       -> schemaVersion
    flagship    -> scenarioId
    segments    -> captureSegments
    artifactRoot -> artifactRoot
  }

  validate RunPlan {
    schemaVersion   : required, string
    scenarioId      : required, string
    captureSegments : required
    artifactRoot    : required, string
  }

  sink LocalArtifacts {
    type: "filesystem"
    path: ".bench-logs/format-stress/${date}/humanoid-rock-throw"
    method: "write"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "webhook"
    endpoint: "${env.HOLOMESH_BOARD_SEED_URL}"
    method: "POST"
    body: {
      source: "format-realism-gauntlet",
      scenario: "${scenarioId}",
      segments: "${captureSegments.length}"
    }
    on_error: { action: "log", continue: true }
  }
}
