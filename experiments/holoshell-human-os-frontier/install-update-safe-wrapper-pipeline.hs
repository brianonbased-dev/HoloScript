// HoloShell install/update safe wrapper flow.
// This .hs source uses parseable object wiring to describe data flow,
// command custody, validation, replay, and HoloMesh task filing.

environment {
  skybox: "night"
  ambient_light: 0.25
}

object "package_mutation_receipt_source" {
  geometry: "cube"
  color: "#1f6feb"
  position: { x: -4, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  input_path: "input.package_mutation_receipt"
  format: "json"
  mode: "read_only"
  schema: "HoloShellPackageMutationReceipt"
}

object "identity_normalizer" {
  geometry: "cube"
  color: "#2ea043"
  position: { x: -2.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "candidate.packageId;candidate.packageName;candidate.manager;candidate.source;candidate.currentVersion;candidate.availableVersion"
  emits: "packageId;packageName;manager;source;fromVersion;toVersion"
  validation: "packageId required; packageName required; manager required; source required"
}

object "machine_preflight_normalizer" {
  geometry: "cube"
  color: "#d29922"
  position: { x: -1, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "preflight.adminRequired;preflight.adminSession;preflight.diskStatus;preflight.networkStatus;preflight.processConflictStatus;preflight.packageManagerAvailable"
  emits: "adminRequired;adminSession;diskStatus;networkStatus;processConflictStatus;packageManagerAvailable"
  validation: "all preflight fields required; network spend needs owner gesture when protective"
}

object "approval_gate_validator" {
  geometry: "cube"
  color: "#e0af68"
  position: { x: 0.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "permissionEnvelope;approval.approvalRequired;approval.requiresFreshUserGesture;approval.approvedCommandPreview;approval.rollbackLimits"
  blocks: "ambient_execute;silent_admin;silent_uninstall;system_path_change_without_receipt;startup_change_without_receipt"
  validation: "break_glass required for mutation; fresh human gesture required; rollback limits visible"
}

object "launch_witness_validator" {
  geometry: "cube"
  color: "#9ece6a"
  position: { x: 2, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "verification.binaryPath;verification.versionCommand;verification.versionCommandPassed;verification.launchVerified;verification.verifiedVersion"
  emits: "binaryExists;versionCommandPassed;launchVerified;verifiedVersion"
  validation: "launchVerified requires binary path, version command, command pass, and verified version"
}

object "replay_and_task_filer" {
  geometry: "cube"
  color: "#f7768e"
  position: { x: 3.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "replayKey;hash;schemaContract;summary"
  writes: ".bench-logs/holoshell-human-os-frontier/2026-05-19/install-update-safe-wrapper-evidence-pack.json"
  task_seed: ".bench-logs/holoshell-human-os-frontier/2026-05-19/install-update-safe-wrapper-holomesh-tasks.json"
  validation: "receipt hash required; replay key required; HoloMesh task includes evidence and owner surface"
}

object "flow_contract" {
  geometry: "cube"
  color: "#7dcfff"
  position: { x: 0, y: 0.8, z: -2 }
  scale: { x: 5.6, y: 0.12, z: 0.12 }

  sequence: "receipt_source to identity to preflight to approval_gate to launch_witness to replay_and_task_filer"
  replay: "same package id, manager, source, versions, command preview, and receipt hash reproduce the plan"
  taskability: "missing validator, missing UI gate, or missing adapter becomes a HoloMesh task with evidence"
}
