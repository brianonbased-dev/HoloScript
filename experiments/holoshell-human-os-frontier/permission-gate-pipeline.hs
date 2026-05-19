// HoloShell permission gate flow.
// This .hs source uses parseable object wiring to describe data flow,
// command custody, validation, replay, and HoloMesh task filing.

environment {
  skybox: "night"
  ambient_light: 0.25
}

object "permission_gate_receipt_source" {
  geometry: "cube"
  color: "#1f6feb"
  position: { x: -4, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  input_path: "input.permission_gate_receipt"
  format: "json"
  mode: "read_only"
  schema: "HoloShellPermissionGateReceiptPack"
}

object "subject_normalizer" {
  geometry: "cube"
  color: "#2ea043"
  position: { x: -2.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "subject.subjectKind;subject.provider;subject.redactedSubjectLabel;subject.subjectLabelHash;subject.browserProfile;subject.deviceIdHash"
  emits: "subjectKind;provider;redactedSubjectLabel;subjectLabelHash;browserProfile;deviceIdHash"
  validation: "subject label redacted; subject hash required; credentialExtrusionAllowed false"
}

object "scope_diff_validator" {
  geometry: "cube"
  color: "#d29922"
  position: { x: -1, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "request.requestedScopes;request.minimumRequiredScopes;request.neverScopes;grant.grantedScopes;grant.extraScopes;grant.missingRequiredScopes"
  emits: "minimumScopeSatisfied;excessScopesAbsent;scopeDiffHash"
  validation: "requested scopes include every required scope; granted scopes equal minimum set; never scopes absent"
}

object "grant_custody_validator" {
  geometry: "cube"
  color: "#e0af68"
  position: { x: 0.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "request.permissionEnvelope;request.requiresFreshUserGesture;grant.freshUserGesture;grant.hiddenAutomationUsed;grant.rawCredentialCaptured"
  blocks: "silent_oauth;cookie_scrape;token_copy;background_consent;absolute_path_leak"
  validation: "fresh human gesture required; hidden automation false; raw credential captured false"
}

object "verification_and_revoke_validator" {
  geometry: "cube"
  color: "#9ece6a"
  position: { x: 2, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "verification.minimumScopeSatisfied;verification.excessScopesAbsent;verification.readyForHoloLand;grant.revocationInstruction;revocation.revokeVerified"
  emits: "readyForHoloLand;revocationInstructionVisible;revokeVerified"
  validation: "ready requires verified minimum scope, no excess scope, and visible revoke path"
}

object "replay_and_task_filer" {
  geometry: "cube"
  color: "#f7768e"
  position: { x: 3.5, y: 2, z: -2 }
  scale: { x: 0.8, y: 0.3, z: 0.12 }

  reads: "replay.replayKey;replay.overbroadScopeAccepted;replay.rawCredentialCaptured;hash;schemaContract"
  writes: ".bench-logs/holoshell-human-os-frontier/2026-05-19/permission-gate-evidence-pack.md"
  task_seed: ".bench-logs/holoshell-human-os-frontier/2026-05-19/permission-gate-holomesh-tasks.json"
  validation: "receipt hash required; replay key required; overbroad scope and raw credential capture must be false"
}

object "flow_contract" {
  geometry: "cube"
  color: "#7dcfff"
  position: { x: 0, y: 0.8, z: -2 }
  scale: { x: 5.6, y: 0.12, z: 0.12 }

  sequence: "receipt_source to subject to scope_diff to grant_custody to verification_and_revoke to replay_and_task_filer"
  replay: "same provider, subject hash, scope set, grant hash, verification hash, and revoke instruction reproduce the plan"
  taskability: "missing adapter, missing room gate, or missing policy helper becomes a HoloMesh task with evidence and owner surface"
}
