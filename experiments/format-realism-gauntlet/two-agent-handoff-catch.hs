pipeline "TwoAgentHandoffCatchReceipts" {
  schedule: "manual"
  timeout: 45s

  source HandoffEvents {
    type: "filesystem"
    path: "experiments/format-realism-gauntlet/two-agent-handoff-catch-events.sample.json"
    format: "json"
  }

  transform NormalizeHandoff {
    segment -> segment
    owner -> owner
    status -> status
  }

  filter NonPassingSegments {
    where: status != "pass"
  }

  validate HandoffGapContract {
    segment : required, string
    owner   : required, string
    status  : required, string
  }

  sink LocalHandoffGapDigest {
    type: "filesystem"
    path: ".bench-logs/format-stress/two-agent-handoff-catch/pipeline-output"
    method: "write"
    format: "json"
  }
}
