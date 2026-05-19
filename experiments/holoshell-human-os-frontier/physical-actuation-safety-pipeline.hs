// HoloShell Physical Actuation Safety Pipeline
//
// Parseable object-flow source for the data path. This intentionally avoids a
// richer pipeline block until the local parser accepts the full orchestration
// shape used by prior frontier notes.

object "human_intent_source" {
  geometry: "cube"
  color: "#2f6f9f"
  source: "plain language request + selected HoloLand room actor"
  output: "bounded actuation intent"
  guard: "reject broad, payment, deletion, credential, or irreversible requests"
}

object "hardware_inventory_source" {
  geometry: "cube"
  color: "#437c50"
  source: "codex hardware audit + device lab probe + hardware reality bridge"
  output: "redacted DeviceInventoryReceipt"
  validator: "validateDeviceInventoryReceipt"
}

object "minimum_permission_gate" {
  geometry: "cube"
  color: "#7c4d9f"
  source: "human_intent_source + permission gate receipts"
  output: "minimum scope verification"
  guard: "overbroad scope, missing revoke path, or credential extrusion blocks execution"
  validator: "validateHoloShellPermissionGateReceiptPack"
}

object "simulation_preview" {
  geometry: "cube"
  color: "#9f7a2f"
  source: "hardware_inventory_source + human_intent_source"
  output: "ActuationSimulationReceipt"
  guard: "no deterministic preview means no physical command"
}

object "freshness_gate" {
  geometry: "cube"
  color: "#6f7c2f"
  source: "sensor sample + approval nonce + adapter health"
  output: "SensorFreshnessReceipt"
  guard: "stale sensor, stale approval, or unhealthy adapter blocks execution"
}

object "safety_envelope_validator" {
  geometry: "cube"
  color: "#9f4d4d"
  source: "minimum_permission_gate + simulation_preview + freshness_gate"
  output: "DeviceSafetyEnvelopeReceipt"
  guard: "requires safe ranges, safe stop, receipt sink, redaction, and rollback note"
  validator: "validateDeviceSafetyEnvelopeReceipt"
}

object "guarded_action_adapter" {
  geometry: "cube"
  color: "#4d789f"
  source: "safety_envelope_validator + nonce-bound approval + local adapter"
  output: "DeviceActionReceipt or SafeStopReceipt"
  guard: "mutationExecuted cannot be true unless executionAllowed and safeStopArmed are true"
  validator: "validateDeviceActionReceipt"
}

object "rollback_limit_receipt" {
  geometry: "cube"
  color: "#5f5f5f"
  source: "guarded_action_adapter + before/after snapshots"
  output: "PhysicalRollbackLimitReceipt"
  guard: "software replay can be deterministic while physical rollback may be partial or impossible"
}

object "replay_and_task_sink" {
  geometry: "cube"
  color: "#6b5f8f"
  source: "all receipts + blocked reasons + validation gaps"
  output: "ReplayLessonReceipt + HoloMesh task draft"
  validator: "validateReplayLessonReceipt"
}
