// HoloShell cross-provider sync data pipeline.
// Ingests Gmail, Google Drive, local filesystem, GitHub, and Google Sheets;
// normalises receipts into a unified delta view; stages write proposals;
// executes approved writes; and assembles a replayable sync run receipt.

pipeline "HoloShellCrossProviderSyncPipeline" {
  schedule: "manual"
  timeout: 300s
  retry: { max: 1, on: ["auth_transient_error", "network_transient_error"] }

  // ── Inputs ──

  source RunConfig {
    type: "inline"
    schema: {
      runId: string
      providers: ["gmail", "google-drive", "local-filesystem", "github", "google-sheets"]
      queryWindow: "72h"
      lastReceiptPath: string
      approvalTokenPath: string
    }
    defaults: {
      queryWindow: "72h"
      providers: ["gmail", "google-drive", "local-filesystem", "github", "google-sheets"]
    }
  }

  source LastSyncReceipt {
    type: "filesystem"
    path: "${input.lastReceiptPath}"
    format: "json"
    mode: "read_only"
    optional: true
    nb: "absent on first run — triggers full ingest with no delta baseline"
  }

  source ApprovalTokens {
    type: "filesystem"
    path: "${input.approvalTokenPath}"
    format: "json"
    mode: "read_only"
    optional: true
    nb: "absent when running in ingest-only mode; required for execute stage"
  }

  // ── Stage 1: Auth check (all providers in parallel) ──

  transform AuthCheck {
    parallel: true
    steps: [
      { provider: "gmail",            check: "google_oauth_token_valid", scopes: ["readonly"] }
      { provider: "google-drive",     check: "google_oauth_token_valid", scopes: ["drive.readonly"] }
      { provider: "local-filesystem", check: "fs_read_access",           paths: ["C:\\Users\\Josep\\Documents\\GitHub\\"] }
      { provider: "github",           check: "gh_auth_status" }
      { provider: "google-sheets",    check: "google_oauth_token_valid", scopes: ["spreadsheets.readonly"] }
    ]
    output: AuthCheckResult
    on_error: { action: "record_skip", continue: true }
  }

  validate AuthCheckContract {
    local-filesystem : required, auth_ok
    // gmail, google-drive, google-sheets, github: optional (skipped if not available)
    // pipeline continues with available providers; skipped providers are recorded
  }

  // ── Stage 2: Provider ingest (available providers in parallel) ──

  transform GmailIngest {
    when: AuthCheckResult.gmail == "auth_ok"
    absorptionPath: "browser-automation"
    trustState: "external"
    reads: {
      unread: true
      query: "newer_than:${input.queryWindow} -label:archived"
      fields: ["id", "subject", "from", "date", "labelIds", "snippet"]
      maxResults: 50
    }
    output: GmailReceipt
    produces: ProviderIngestReceipt { provider: "gmail" }
    on_skip: { reason: "auth_unavailable", record: true }
  }

  transform DriveIngest {
    when: AuthCheckResult["google-drive"] == "auth_ok"
    absorptionPath: "browser-automation"
    trustState: "external"
    reads: {
      modifiedAfter: "${lastReceipt.timestamp ?? now() - 72h}"
      fields: ["id", "name", "mimeType", "modifiedTime", "md5Checksum", "parents"]
      maxResults: 100
    }
    output: DriveReceipt
    produces: ProviderIngestReceipt { provider: "google-drive" }
    on_skip: { reason: "auth_unavailable", record: true }
  }

  transform LocalFilesystemIngest {
    absorptionPath: "cli"
    trustState: "local"
    steps: [
      { exec: "git", args: ["status", "--porcelain=v2", "--branch"], cwd: "C:\\Users\\Josep\\Documents\\GitHub\\HoloScript", capture: "stdout" }
      { exec: "git", args: ["status", "--porcelain=v2", "--branch"], cwd: "C:\\Users\\Josep\\Documents\\GitHub\\Hololand", capture: "stdout" }
      { exec: "git", args: ["log", "--oneline", "-10"], cwd: "C:\\Users\\Josep\\Documents\\GitHub\\HoloScript", capture: "stdout" }
    ]
    hashComparison: {
      against: "${lastReceipt.localFilesystemHash ?? null}"
      algorithm: "sha256"
    }
    output: LocalReceipt
    produces: ProviderIngestReceipt { provider: "local-filesystem" }
  }

  transform GitHubIngest {
    when: AuthCheckResult.github == "auth_ok"
    absorptionPath: "cli"
    trustState: "known"
    steps: [
      { exec: "gh", args: ["pr", "list", "--repo", "brianonbased-dev/HoloScript", "--json", "number,title,state,headRefName,createdAt,statusCheckRollup"], capture: "stdout" }
      { exec: "gh", args: ["issue", "list", "--repo", "brianonbased-dev/HoloScript", "--json", "number,title,state,labels,createdAt"], capture: "stdout" }
      { exec: "gh", args: ["run", "list", "--repo", "brianonbased-dev/HoloScript", "--limit", "5", "--json", "databaseId,name,status,conclusion,createdAt"], capture: "stdout" }
    ]
    output: GitHubReceipt
    produces: ProviderIngestReceipt { provider: "github" }
    absorptionGap: "stdout parsed as ad-hoc JSON — CliReceipt schema pending (see gap registry)"
    on_skip: { reason: "auth_unavailable", record: true }
  }

  transform SheetsIngest {
    when: AuthCheckResult["google-sheets"] == "auth_ok"
    absorptionPath: "browser-automation"
    trustState: "external"
    reads: {
      modifiedAfter: "${lastReceipt.timestamp ?? now() - 72h}"
      namedRanges: ["TaskTracker", "SprintBacklog"]
      fields: ["rowIndex", "values", "lastModified"]
      maxRows: 200
    }
    output: SheetsReceipt
    produces: ProviderIngestReceipt { provider: "google-sheets" }
    on_skip: { reason: "auth_unavailable", record: true }
  }

  // ── Stage 3: Normalise into unified delta ──

  transform NormaliseReceipts {
    inputs: [GmailReceipt, DriveReceipt, LocalReceipt, GitHubReceipt, SheetsReceipt]
    schema: "HoloShellSyncDeltaItem"
    fields: {
      itemId: string
      provider: enum["gmail", "google-drive", "local-filesystem", "github", "google-sheets"]
      kind: enum["new", "modified", "deleted", "error"]
      timestamp: datetime
      summary: string
      providerUrl: string
      rawHash: string
      actionable: boolean
    }
    output: UnifiedDelta
  }

  // ── Stage 4: Diff against last receipt ──

  transform DiffAgainstLastReceipt {
    when: LastSyncReceipt.present == true
    compare: UnifiedDelta
    against: "${lastReceipt.deltaHashes}"
    algorithm: "hash_set_delta"
    output: DeltaDiff
    exitWhenNoDelta: true
    exitMessage: "All providers match last sync receipt — nothing to do."
  }

  // ── Stage 5: Plan write proposals ──

  transform PlanWriteProposals {
    when: DeltaDiff.newItems.count > 0
    rules: [
      { if: "github.new_issue exists",  then: "propose: append_spreadsheet_row(sheets, github_issue_summary)" }
      { if: "gmail.new_email matches project_keyword", then: "propose: file_holomesh_board_task(email_action_item)" }
      { if: "drive.new_file in project_folder", then: "propose: update_local_file(local_path, drive_file_hash)" }
      { if: "local.git_status has untracked", then: "propose: create_drive_folder(project_branch_name)" }
      { if: "sheets.row_delta matches milestone", then: "propose: create_github_issue(milestone_summary)" }
    ]
    output: WriteProposalPack
    humanFacing: true
    approvalRequired: true
    compensatingActions: true
  }

  validate WriteProposalContract {
    proposalId : required, string
    targetProvider : required, string
    operation : required, string
    parameters : required, object
    compensatingAction : required, string
    approvalToken : required, string
  }

  // ── Stage 6: Approval gate ──

  filter PendingApproval {
    where: WriteProposalPack.proposals.any(p => p.approvalToken == null)
    action: "halt_and_emit_approval_request"
    emits: "holoshell:cross_provider_sync:approval_request"
    nb: "pipeline pauses here if running in interactive mode; in batch mode exits with pending_approval status"
  }

  // ── Stage 7: Execute approved writes ──

  transform ExecuteWrites {
    when: ApprovalTokens.present == true
    executes: WriteProposalPack.proposals.filter(p => ApprovalTokens.contains(p.proposalId))
    errorPolicy: { action: "record_failure", continue: true, maxFailures: 3 }
    output: WriteExecutionResults
    produces: WriteExecutionReceipt
  }

  // ── Stage 8: Verify outcomes ──

  transform VerifyOutcomes {
    verifies: WriteExecutionResults
    checks: [
      { provider: "google-sheets", check: "row_exists_after_append" }
      { provider: "github", check: "issue_or_pr_state_matches" }
      { provider: "local-filesystem", check: "file_hash_matches_expected" }
    ]
    output: VerificationReport
  }

  // ── Stage 9: Assemble sync run receipt ──

  transform AssembleSyncRunReceipt {
    inputs: [RunConfig, AuthCheckResult, UnifiedDelta, WriteProposalPack, WriteExecutionResults, VerificationReport]
    schema: "HoloShellSyncRunReceipt"
    fields: {
      runId: string
      startTimestamp: datetime
      endTimestamp: datetime
      providersIngested: [string]
      providersSkipped: [string]
      deltaItemCount: number
      writeProposalCount: number
      writesExecuted: number
      writesFailed: number
      approvalTokensCaptured: number
      ingestReceiptHashes: [string]
      writeReceiptHashes: [string]
      gapsEncountered: [string]
      replayInputs: ["runId", "lastReceiptPath", "approvalTokenPath", "providerConfigs"]
    }
    output: SyncRunReceipt
  }

  // ── Sinks ──

  sink SyncRunReceiptFile {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-06-09/cross-provider-sync-receipt.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink UnifiedDeltaFile {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-06-09/unified-delta.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink GapRegistryFile {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-06-09/gap-registry.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }

  sink HoloMeshTaskSeed {
    type: "filesystem"
    path: ".bench-logs/holoshell-human-os-frontier/2026-06-09/holomesh-tasks-to-file.json"
    method: "write"
    format: "json"
    on_error: { action: "log", continue: true }
  }
}
