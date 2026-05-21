// HoloShell cloud-drive permission cleanup flow.
// Describes data flow, command custody, validation, replay, and task filing.

environment {
  skybox: "night"
  ambient_light: 0.25
}

object "provider_account_boundary" {
  geometry: "cube"
  color: "#1f6feb"
  position: { x: -4.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  input_path: "input.provider_account"
  format: "json"
  mode: "read_only"
  schema: "BrowserAccountBoundaryReceipt"
  validation: "redacted account label required; credential extrusion false; cookie export blocked"
}

object "connected_app_inventory" {
  geometry: "cube"
  color: "#2ea043"
  position: { x: -3, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "provider_account_boundary.provider;provider_account_boundary.browserProfile;provider_connected_apps"
  emits: "redacted_app_list;scope_labels;stale_grant_candidates"
  validation: "public receipts contain app labels only when redacted or hashed"
}

object "scope_policy_diff" {
  geometry: "cube"
  color: "#d29922"
  position: { x: -1.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "requestedScopes;grantedScopes;minimumRequiredScopes;neverScopes"
  emits: "minimumScopeSatisfied;excessScopesAbsent;overbroadScopeIds"
  blocks: "drive_full;files_readwrite_all;admin;billing;delete;wildcard"
  validation: "minimum scope is satisfied and excess scopes are absent before tool unlock"
}

object "revoke_executor" {
  geometry: "cube"
  color: "#ef476f"
  position: { x: 0, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "stale_grant_candidates;human_revoke_selection;fresh_user_gesture"
  writes: "PermissionRevocationReceipt"
  blocks: "silent_revoke;unverified_revoke;residual_session_unreported"
  validation: "every removed grant has revokeVerified true or a visible residual access warning"
}

object "archive_quarantine" {
  geometry: "cube"
  color: "#06d6a0"
  position: { x: 1.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "selected_cloud_files;provider_export_ready;downloaded_archive"
  emits: "archive_hash;public_relative_paths;private_absolute_path_receipt;sensitivity_scan"
  blocks: "partial_download;unexpected_executable;absolute_path_leak;source_cloud_mutation"
  validation: "download goes to quarantine, archive is hashed, private paths stay private, source cloud files are not changed"
}

object "hololand_preview_import" {
  geometry: "cube"
  color: "#7dcfff"
  position: { x: 3, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "archive_hash;unpack_manifest_hash;sensitivity_scan_status;minimum_scope_receipt"
  writes: "preview_only_task_file;AccountExportReplayReceipt"
  validation: "preview import allowed only after archive verification and minimum-scope permission pack validation"
}

object "task_and_replay_filer" {
  geometry: "cube"
  color: "#9ece6a"
  position: { x: 4.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "permission_pack;account_export_pack;revoke_receipts;preview_task_file"
  writes: ".bench-logs/holoshell-human-os-frontier/2026-05-21/cloud-drive-permission-cleanup/evidence-pack.md"
  task_seed: ".bench-logs/holoshell-human-os-frontier/2026-05-21/cloud-drive-permission-cleanup/holomesh-tasks.json"
  validation: "real gaps become HoloMesh tasks with affected repo path, expected behavior, owner surface, and evidence"
}

object "flow_contract" {
  geometry: "cube"
  color: "#80cbc4"
  position: { x: 0, y: 0.8, z: -2 }
  scale: { x: 6.8, y: 0.12, z: 0.12 }

  sequence: "account_boundary to connected_app_inventory to scope_policy_diff to revoke_executor to archive_quarantine to hololand_preview_import to task_and_replay_filer"
  replay: "same account hash, app list hash, scope diff hash, revocation receipts, archive hash, and preview manifest reproduce the cleanup state"
  taskability: "missing provider adapter, missing validator, missing HoloLand room, or stale codebase graph becomes an actionable task"
}
