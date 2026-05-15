// HoloShell document and spreadsheet custody data pipeline.
// Normalizes file snapshot, parser, preview, approval, export, diff, and replay
// receipts into one deterministic work-file record for HoloShell.

pipeline "HoloShellDocumentSpreadsheetCustodyPipeline" {
  schedule: "manual"
  timeout: 180s
  retry: { max: 0 }

  source SelectedWorkFile {
    type: "filesystem"
    path: "${input.selected_file}"
    format: "binary"
    mode: "read_only"
  }

  source ParserAdapterRegistry {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-15/document-spreadsheet-evidence-pack.json"
    format: "json"
  }

  source ApprovalPacket {
    type: "filesystem"
    path: "${input.approval_packet}"
    format: "json"
    optional: true
  }

  transform FileSnapshot {
    path -> redactedPath
    bytes -> sourceBytes
    sha256 -> sourceHash
    extension -> sourceKind
    officeApps -> installedOfficeApps
  }

  transform WorkModel {
    sourceKind -> parserChoice
    sourceHash -> replayKey
    supportedFormats -> parseEligibility
  }

  validate SourceCustodyContract {
    redactedPath : required, string
    sourceBytes : required
    sourceHash : required, string
    sourceKind : required, string
    parseEligibility : required
  }

  transform TransformPreview {
    parserChoice -> adapter
    replayKey -> previewReplayKey
    approvalId -> approvalId
  }

  validate PreviewBeforeExport {
    adapter : required, string
    previewReplayKey : required, string
    approvalId : optional, string
  }

  filter NeedsGuardedApproval {
    where: approvalId == null
  }

  sink CustodyEvidencePack {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-15/document-spreadsheet-evidence-pack.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-05-15/document-spreadsheet-holomesh-tasks.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }
}
