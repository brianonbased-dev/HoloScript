/**
 * HoloLand Receipts — domain-extension receipt types for HoloLand
 * (hardware validation, replay determinism, agent steward actions).
 *
 * Layered on top of the existing ArtifactReceipt foundation in
 * board-types.ts. The Frontier spec for HoloLand requires receipts
 * for hardware capture, replay reproduction, and agent steward
 * actions. Each is a typed envelope around an ArtifactReceipt-style
 * provenance/verification core, so existing board tooling
 * (validateArtifactReceipt, attachTaskArtifacts) keeps working.
 *
 * Created: task_1778186605462_4z0o (P1 holoscript-upstream)
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Hardware ──

/**
 * Capture-source identifier for a hardware receipt.
 *
 * - quest3 / quest3s / quest-pro / vision-pro / pico4 — XR HMDs
 * - lookingglass — Looking Glass quilt rendering rig
 * - lidar-scanner — phone or standalone LiDAR sensor
 * - camera-rig — multi-camera capture rig
 * - hardware-other — anything outside the enumerated set; describe in
 *   `HardwareReceipt.deviceModel`.
 */
export const HARDWARE_RECEIPT_KINDS = [
  'quest3',
  'quest3s',
  'quest-pro',
  'vision-pro',
  'pico4',
  'lookingglass',
  'lidar-scanner',
  'camera-rig',
  'hardware-other',
] as const;

export type HardwareReceiptKind = (typeof HARDWARE_RECEIPT_KINDS)[number];

export interface HardwareReceipt {
  /** Stable receipt id, e.g. `hw_quest3_20260507_xyz`. */
  id: string;
  /** Bucketed device family. Use `hardware-other` and `deviceModel` for off-list. */
  kind: HardwareReceiptKind;
  /** Capture timestamp (ISO-8601 or Unix ms — caller's choice; consumers must accept both). */
  capturedAt: string | number;
  /** Hardware fingerprint hash (e.g. sha256 of device serial + firmware). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Free-form model string when `kind` is `hardware-other`. */
  deviceModel?: string;
  /** Firmware/runtime version string captured at the same moment. */
  firmwareVersion?: string;
  /** Path or URI to the captured payload (image bundle, scan, telemetry log). */
  path?: string;
  uri?: string;
  /** Provenance link back to the producing task / commit / parent receipt. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the capture round-trips. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Replay ──

export interface ReplayInput {
  /** Stable input id within the replay envelope. */
  id: string;
  /** Wall-clock or simulation timestamp at which the input was injected. */
  at: string | number;
  /** Source of the input — agent name, hardware tag, scripted-fixture id. */
  source: string;
  /** Opaque payload — schema is per-event-kind; consumers must validate. */
  payload: Record<string, unknown>;
  /** Optional kind tag for fast routing (e.g. `vr.controller`, `agent.dm`). */
  kind?: string;
}

export interface ReplayOutcome {
  /** Stable outcome id within the replay envelope. */
  id: string;
  /** Status of the replayed scenario. */
  status: 'matched' | 'diverged' | 'errored' | 'skipped';
  /** Wall-clock or simulation timestamp when the outcome was sealed. */
  at: string | number;
  /** Hash of the canonical state diff produced by the run. */
  stateHash?: string;
  /** Hash algorithm for `stateHash`. */
  stateHashAlgorithm?: ArtifactHashAlgorithm;
  /** Human-readable summary, kept short (under ~200 chars by convention). */
  summary?: string;
  /** Pointers to artifacts produced (e.g. CAEL trace, screenshot). */
  artifactIds?: string[];
  metadata?: Record<string, unknown>;
}

// ── Agent steward action ──

export const AGENT_ACTION_KINDS = [
  'spawn-encounter',
  'gate-quest',
  'reward-issue',
  'mod-action',
  'world-event',
  'governance-vote',
  'agent-other',
] as const;

export type AgentActionKind = (typeof AGENT_ACTION_KINDS)[number];

export interface AgentActionReceipt {
  /** Stable receipt id, e.g. `act_spawn_quest_20260507_abc`. */
  id: string;
  /** Bucketed action family. */
  kind: AgentActionKind;
  /** Agent identity — wallet address, agent handle, or other stable id. */
  actor: string;
  /** Wall-clock timestamp the action was committed. */
  actedAt: string | number;
  /** Hash of the action payload (input + decision context). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Free-form action label when `kind` is `agent-other`. */
  actionLabel?: string;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the action's effects landed. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Qualcomm NIR Model Export ──

export const QUALCOMM_NIR_RUNTIME_TARGETS = [
  'qualcomm-snpe',
  'qualcomm-qnn',
  'nir-generic',
] as const;

export type QualcommNIRRuntimeTarget = (typeof QUALCOMM_NIR_RUNTIME_TARGETS)[number];

export interface QualcommNIRModelExportReceipt {
  /** Stable receipt id, e.g. `nir_qualcomm_20260509_xyz`. */
  id: string;
  /** Model identifier — matches the NIR graph or HoloScript composition that was exported. */
  modelId: string;
  /** Target device family + SoC, e.g. `Snapdragon 8 Gen 3` or `QCS8550`. */
  targetDevice: string;
  /** Runtime stack used for the on-device inference. */
  runtime: QualcommNIRRuntimeTarget;
  /** End-to-end inference latency in milliseconds (single batch, typical input). */
  latencyMs: number;
  /** Model load / initialization time in milliseconds. */
  loadTimeMs: number;
  /** Peak resident memory in bytes during inference. */
  memoryBytes: number;
  /** Compute-unit utilization ratio, 0.0–1.0 (percentage / 100). */
  computeUnitUtilization: number;
  /** Numerical-correctness envelope. */
  numericalCorrectness: {
    /** Maximum absolute error versus a reference float32 run. */
    maxAbsoluteError: number;
    /** Mean absolute error versus a reference float32 run. */
    meanAbsoluteError: number;
    /** Identifier of the dataset / fixture used for validation. */
    validationDatasetId?: string;
    /** Number of samples exercised in the correctness check. */
    sampleCount?: number;
  };
  /** Capture timestamp (ISO-8601 or Unix ms). */
  capturedAt: string | number;
  /** Hash of the canonical receipt body (id + modelId + targetDevice + ordered metrics). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link back to the producing task / commit / parent receipt. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the metrics can be reproduced. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Cross-Hardware Compilation Receipt ──

/**
 * Device families that HoloScript can compile to via its export targets.
 * Vendors optimize their own lanes (Jetson, Qualcomm AI Hub, etc.);
 * HoloScript differentiates by producing portable evidence across all of them.
 */
export const HARDWARE_COMPILATION_TARGET_KINDS = [
  'jetson', // NVIDIA Jetson (Orin, Nano, AGX, etc.)
  'qualcomm-snapdragon', // Qualcomm Snapdragon / AI Hub
  'intel-loihi', // Intel Loihi (neuromorphic)
  'intel-gaudi', // Intel Gaudi
  'amd-instinct', // AMD Instinct
  'apple-neural', // Apple Neural Engine
  'google-coral', // Google Coral TPU
  'raspberry-pi', // Raspberry Pi
  'arduino', // Arduino / microcontrollers
  'generic-embedded', // Catch-all for unlisted edge devices
] as const;

export type HardwareCompilationTargetKind = (typeof HARDWARE_COMPILATION_TARGET_KINDS)[number];

/**
 * Constraints applied at compile time for a hardware target.
 */
export interface HardwareCompilationConstraints {
  /** Maximum resident memory in megabytes. */
  maxMemoryMB?: number;
  /** Maximum compute units (SMs, DSPs, cores) usable. */
  maxComputeUnits?: number;
  /** Thermal budget in Celsius. */
  thermalBudgetC?: number;
  /** Power budget in Watts. */
  powerBudgetW?: number;
  /** Target inference latency in milliseconds. */
  targetLatencyMs?: number;
  /** Quantization mode. */
  quantization?: 'fp32' | 'fp16' | 'int8' | 'int4' | 'mixed';
}

/**
 * Measured results from running the compiled artifact on target hardware.
 */
export interface HardwareCompilationMeasuredResults {
  /** End-to-end latency in milliseconds. */
  latencyMs?: number;
  /** Throughput in frames per second (or inferences per second). */
  throughputFPS?: number;
  /** Peak resident memory in bytes. */
  peakMemoryBytes?: number;
  /** Average power draw in Watts. */
  powerDrawW?: number;
  /** Number of thermal-throttle events observed. */
  thermalThrottleEvents?: number;
  /** Accuracy versus a reference run, 0.0–1.0. */
  accuracyVsReference?: number;
}

/**
 * Cross-hardware compilation receipt — the portable evidence record that
 * HoloScript generates when compiling to any hardware lane.
 *
 * Competitors (NVIDIA Jetson, Qualcomm AI Hub) record evidence inside
 * their own vendor-specific formats. HoloScript records it once,
 * portably, across all targets. This receipt is the data layer of
 * that differentiator (CG-032).
 */
export interface CrossHardwareCompilationReceipt {
  /** Stable receipt id, e.g. `hwc_jetson_orin_20260509_xyz`. */
  id: string;
  /** HoloScript export target that produced this compilation. */
  exportTarget: string;
  /** Device family — must match a registered hardware compilation target kind. */
  deviceFamily: HardwareCompilationTargetKind;
  /** Free-form device model, e.g. `Jetson Orin Nano 8GB`. */
  deviceModel?: string;
  /** Runtime stack + version, e.g. `TensorRT 10.0` or `QNN 2.22`. */
  runtime: string;
  /** HoloScript compiler version that emitted the artifact. */
  compilerVersion: string;
  /** Vendor toolchain version, e.g. `JetPack 6.0` or `Snapdragon SDK 1.2`. */
  toolchainVersion?: string;
  /** Constraints declared at compile time. */
  constraints?: HardwareCompilationConstraints;
  /** Results measured on-target. */
  measuredResults?: HardwareCompilationMeasuredResults;
  /** Replay inputs that reproduce the measurement. */
  replayInputs?: ReplayInput[];
  /** Provenance link back to the task / commit / parent receipt. */
  provenance?: ArtifactProvenanceLink;
  /** Owner identity — wallet address, agent handle, or team seat. */
  owner?: string;
  /** Hash of the canonical receipt body (id + exportTarget + deviceFamily + ordered fields). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Capture timestamp (ISO-8601 or Unix ms). */
  capturedAt: string | number;
  /** Verification commands that prove the compilation reproduces. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── ValidationReceipt — top-level envelope ──

/**
 * Validation receipt — the canonical top-level envelope a HoloLand
 * scenario emits when it claims a behavior is correct. Aggregates
 * the hardware that produced the scenario, the inputs that were
 * replayed, the outcomes observed, and any agent steward actions
 * that ran during the validation window.
 */
export interface ValidationReceipt {
  /** Stable receipt id, e.g. `val_oasis_session_20260507`. */
  id: string;
  /** Scenario identifier — matches a HoloLand scenario or fixture. */
  scenarioId: string;
  /** When the validation was completed (ISO-8601 or Unix ms). */
  validatedAt: string | number;
  /** Outcome of the overall validation. */
  status: 'passed' | 'failed' | 'inconclusive';
  /** Hash of the canonical receipt body (id + scenarioId + ordered children). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Hardware capture receipts referenced by this validation. */
  hardwareReceipts?: HardwareReceipt[];
  /** Inputs replayed during the validation. */
  replayInputs?: ReplayInput[];
  /** Outcomes observed for each replay input or scenario step. */
  replayOutcomes?: ReplayOutcome[];
  /** Agent steward actions captured during the validation window. */
  agentActions?: AgentActionReceipt[];
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the validation can be replayed. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Validators ──

/**
 * Validate a HardwareReceipt. Returns a list of validation errors;
 * empty array means the receipt is structurally valid (semantic
 * verification is the caller's responsibility).
 */
export function validateHardwareReceipt(receipt: HardwareReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('HardwareReceipt.id is required.');
  if (!isSupportedHardwareReceiptKind(receipt.kind)) {
    errors.push(`HardwareReceipt.kind is unsupported: ${String(receipt.kind)}.`);
  }
  if (receipt.kind === 'hardware-other' && !receipt.deviceModel) {
    errors.push(
      `HardwareReceipt ${receipt.id} kind=hardware-other requires deviceModel.`,
    );
  }
  if (!receipt.hash) errors.push('HardwareReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('HardwareReceipt.hashAlgorithm is required.');
  if (receipt.capturedAt === undefined || receipt.capturedAt === null || receipt.capturedAt === '') {
    errors.push('HardwareReceipt.capturedAt is required.');
  }
  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(`HardwareReceipt ${receipt.id} has a verification command without command text.`);
    }
  }
  return errors;
}

export function validateReplayInput(input: ReplayInput): string[] {
  const errors: string[] = [];
  if (!input.id) errors.push('ReplayInput.id is required.');
  if (!input.source) errors.push('ReplayInput.source is required.');
  if (input.at === undefined || input.at === null || input.at === '') {
    errors.push('ReplayInput.at is required.');
  }
  if (input.payload === null || input.payload === undefined || typeof input.payload !== 'object') {
    errors.push(`ReplayInput ${input.id || '<unknown>'}.payload must be an object.`);
  }
  return errors;
}

export function validateReplayOutcome(outcome: ReplayOutcome): string[] {
  const errors: string[] = [];
  if (!outcome.id) errors.push('ReplayOutcome.id is required.');
  if (!isSupportedReplayOutcomeStatus(outcome.status)) {
    errors.push(`ReplayOutcome.status is unsupported: ${String(outcome.status)}.`);
  }
  if (outcome.at === undefined || outcome.at === null || outcome.at === '') {
    errors.push('ReplayOutcome.at is required.');
  }
  if (outcome.stateHash && !outcome.stateHashAlgorithm) {
    errors.push(
      `ReplayOutcome ${outcome.id}.stateHashAlgorithm is required when stateHash is set.`,
    );
  }
  return errors;
}

export function validateAgentActionReceipt(receipt: AgentActionReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('AgentActionReceipt.id is required.');
  if (!isSupportedAgentActionKind(receipt.kind)) {
    errors.push(`AgentActionReceipt.kind is unsupported: ${String(receipt.kind)}.`);
  }
  if (receipt.kind === 'agent-other' && !receipt.actionLabel) {
    errors.push(
      `AgentActionReceipt ${receipt.id} kind=agent-other requires actionLabel.`,
    );
  }
  if (!receipt.actor) errors.push('AgentActionReceipt.actor is required.');
  if (!receipt.hash) errors.push('AgentActionReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('AgentActionReceipt.hashAlgorithm is required.');
  if (receipt.actedAt === undefined || receipt.actedAt === null || receipt.actedAt === '') {
    errors.push('AgentActionReceipt.actedAt is required.');
  }
  return errors;
}

export function validateQualcommNIRModelExportReceipt(
  receipt: QualcommNIRModelExportReceipt,
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('QualcommNIRModelExportReceipt.id is required.');
  if (!receipt.modelId) {
    errors.push('QualcommNIRModelExportReceipt.modelId is required.');
  }
  if (!receipt.targetDevice) {
    errors.push('QualcommNIRModelExportReceipt.targetDevice is required.');
  }
  if (!isSupportedQualcommNIRRuntimeTarget(receipt.runtime)) {
    errors.push(
      `QualcommNIRModelExportReceipt.runtime is unsupported: ${String(receipt.runtime)}.`,
    );
  }
  if (typeof receipt.latencyMs !== 'number' || receipt.latencyMs < 0) {
    errors.push(
      `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.latencyMs must be a non-negative number.`,
    );
  }
  if (typeof receipt.loadTimeMs !== 'number' || receipt.loadTimeMs < 0) {
    errors.push(
      `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.loadTimeMs must be a non-negative number.`,
    );
  }
  if (typeof receipt.memoryBytes !== 'number' || receipt.memoryBytes < 0) {
    errors.push(
      `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.memoryBytes must be a non-negative number.`,
    );
  }
  if (
    typeof receipt.computeUnitUtilization !== 'number' ||
    receipt.computeUnitUtilization < 0 ||
    receipt.computeUnitUtilization > 1
  ) {
    errors.push(
      `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.computeUnitUtilization must be between 0 and 1.`,
    );
  }
  if (!receipt.numericalCorrectness || typeof receipt.numericalCorrectness !== 'object') {
    errors.push(
      `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.numericalCorrectness is required.`,
    );
  } else {
    if (typeof receipt.numericalCorrectness.maxAbsoluteError !== 'number') {
      errors.push(
        `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.numericalCorrectness.maxAbsoluteError is required.`,
      );
    }
    if (typeof receipt.numericalCorrectness.meanAbsoluteError !== 'number') {
      errors.push(
        `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'}.numericalCorrectness.meanAbsoluteError is required.`,
      );
    }
  }
  if (!receipt.hash) errors.push('QualcommNIRModelExportReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('QualcommNIRModelExportReceipt.hashAlgorithm is required.');
  if (
    receipt.capturedAt === undefined ||
    receipt.capturedAt === null ||
    receipt.capturedAt === ''
  ) {
    errors.push('QualcommNIRModelExportReceipt.capturedAt is required.');
  }
  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(
        `QualcommNIRModelExportReceipt ${receipt.id || '<unknown>'} has a verification command without command text.`,
      );
    }
  }
  return errors;
}

/**
 * Validate a CrossHardwareCompilationReceipt. Returns a list of validation errors;
 * empty array means the receipt is structurally valid.
 */
export function validateCrossHardwareCompilationReceipt(
  receipt: CrossHardwareCompilationReceipt,
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('CrossHardwareCompilationReceipt.id is required.');
  if (!receipt.exportTarget) errors.push('CrossHardwareCompilationReceipt.exportTarget is required.');
  if (!isSupportedHardwareCompilationTarget(receipt.deviceFamily)) {
    errors.push(
      `CrossHardwareCompilationReceipt.deviceFamily is unsupported: ${String(receipt.deviceFamily)}.`,
    );
  }
  if (!receipt.runtime) errors.push('CrossHardwareCompilationReceipt.runtime is required.');
  if (!receipt.compilerVersion) {
    errors.push('CrossHardwareCompilationReceipt.compilerVersion is required.');
  }
  if (!receipt.hash) errors.push('CrossHardwareCompilationReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('CrossHardwareCompilationReceipt.hashAlgorithm is required.');
  if (
    receipt.capturedAt === undefined ||
    receipt.capturedAt === null ||
    receipt.capturedAt === ''
  ) {
    errors.push('CrossHardwareCompilationReceipt.capturedAt is required.');
  }

  // Constraints: if present, numeric fields must be non-negative
  if (receipt.constraints) {
    const c = receipt.constraints;
    if (c.maxMemoryMB !== undefined && c.maxMemoryMB < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.constraints.maxMemoryMB must be non-negative.`,
      );
    }
    if (c.maxComputeUnits !== undefined && c.maxComputeUnits < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.constraints.maxComputeUnits must be non-negative.`,
      );
    }
    if (c.powerBudgetW !== undefined && c.powerBudgetW < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.constraints.powerBudgetW must be non-negative.`,
      );
    }
    if (c.targetLatencyMs !== undefined && c.targetLatencyMs < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.constraints.targetLatencyMs must be non-negative.`,
      );
    }
  }

  // Measured results: if present, numeric fields must be non-negative
  if (receipt.measuredResults) {
    const m = receipt.measuredResults;
    if (m.latencyMs !== undefined && m.latencyMs < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.measuredResults.latencyMs must be non-negative.`,
      );
    }
    if (m.peakMemoryBytes !== undefined && m.peakMemoryBytes < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.measuredResults.peakMemoryBytes must be non-negative.`,
      );
    }
    if (m.powerDrawW !== undefined && m.powerDrawW < 0) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.measuredResults.powerDrawW must be non-negative.`,
      );
    }
    if (
      m.accuracyVsReference !== undefined &&
      (m.accuracyVsReference < 0 || m.accuracyVsReference > 1)
    ) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'}.measuredResults.accuracyVsReference must be between 0 and 1.`,
      );
    }
  }

  // Replay inputs
  if (receipt.replayInputs) {
    for (const input of receipt.replayInputs) {
      for (const e of validateReplayInput(input)) {
        errors.push(`replayInputs[${input.id || '<unknown>'}]: ${e}`);
      }
    }
  }

  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(
        `CrossHardwareCompilationReceipt ${receipt.id || '<unknown>'} has a verification command without command text.`,
      );
    }
  }
  return errors;
}

/**
 * Validate a ValidationReceipt envelope. Recursively validates all
 * nested receipts; child errors are prefixed with `<child>[id]: `
 * for grep-friendly diagnostics.
 */
export function validateValidationReceipt(receipt: ValidationReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('ValidationReceipt.id is required.');
  if (!receipt.scenarioId) errors.push('ValidationReceipt.scenarioId is required.');
  if (!isSupportedValidationStatus(receipt.status)) {
    errors.push(`ValidationReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (!receipt.hash) errors.push('ValidationReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('ValidationReceipt.hashAlgorithm is required.');
  if (receipt.validatedAt === undefined || receipt.validatedAt === null || receipt.validatedAt === '') {
    errors.push('ValidationReceipt.validatedAt is required.');
  }

  for (const hw of receipt.hardwareReceipts ?? []) {
    for (const e of validateHardwareReceipt(hw)) {
      errors.push(`hardwareReceipts[${hw.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const input of receipt.replayInputs ?? []) {
    for (const e of validateReplayInput(input)) {
      errors.push(`replayInputs[${input.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const outcome of receipt.replayOutcomes ?? []) {
    for (const e of validateReplayOutcome(outcome)) {
      errors.push(`replayOutcomes[${outcome.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const action of receipt.agentActions ?? []) {
    for (const e of validateAgentActionReceipt(action)) {
      errors.push(`agentActions[${action.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(`ValidationReceipt ${receipt.id} has a verification command without command text.`);
    }
  }
  return errors;
}

// ── Type guards ──

export function isSupportedHardwareReceiptKind(kind: string): kind is HardwareReceiptKind {
  return (HARDWARE_RECEIPT_KINDS as readonly string[]).includes(kind);
}

export function isSupportedAgentActionKind(kind: string): kind is AgentActionKind {
  return (AGENT_ACTION_KINDS as readonly string[]).includes(kind);
}

const REPLAY_OUTCOME_STATUSES = ['matched', 'diverged', 'errored', 'skipped'] as const;
export function isSupportedReplayOutcomeStatus(
  status: string,
): status is ReplayOutcome['status'] {
  return (REPLAY_OUTCOME_STATUSES as readonly string[]).includes(status);
}

export function isSupportedQualcommNIRRuntimeTarget(
  target: string,
): target is QualcommNIRRuntimeTarget {
  return (QUALCOMM_NIR_RUNTIME_TARGETS as readonly string[]).includes(target);
}

export function isSupportedHardwareCompilationTarget(
  target: string,
): target is HardwareCompilationTargetKind {
  return (HARDWARE_COMPILATION_TARGET_KINDS as readonly string[]).includes(target);
}

const VALIDATION_STATUSES = ['passed', 'failed', 'inconclusive'] as const;
export function isSupportedValidationStatus(
  status: string,
): status is ValidationReceipt['status'] {
  return (VALIDATION_STATUSES as readonly string[]).includes(status);
}

// ── Cloning ──

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
): ArtifactVerificationCommand[] | undefined {
  if (!commands) return undefined;
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

function cloneProvenance(
  provenance: ArtifactProvenanceLink | undefined,
): ArtifactProvenanceLink | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    ...(provenance.parentArtifactIds
      ? { parentArtifactIds: [...provenance.parentArtifactIds] }
      : {}),
  };
}

export function cloneHardwareReceipt(receipt: HardwareReceipt): HardwareReceipt {
  return {
    ...receipt,
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}

export function cloneReplayInput(input: ReplayInput): ReplayInput {
  return {
    ...input,
    payload: { ...input.payload },
  };
}

export function cloneReplayOutcome(outcome: ReplayOutcome): ReplayOutcome {
  return {
    ...outcome,
    ...(outcome.artifactIds ? { artifactIds: [...outcome.artifactIds] } : {}),
    ...(outcome.metadata ? { metadata: { ...outcome.metadata } } : {}),
  };
}

export function cloneAgentActionReceipt(receipt: AgentActionReceipt): AgentActionReceipt {
  return {
    ...receipt,
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}

export function cloneValidationReceipt(receipt: ValidationReceipt): ValidationReceipt {
  return {
    ...receipt,
    ...(receipt.hardwareReceipts
      ? { hardwareReceipts: receipt.hardwareReceipts.map(cloneHardwareReceipt) }
      : {}),
    ...(receipt.replayInputs
      ? { replayInputs: receipt.replayInputs.map(cloneReplayInput) }
      : {}),
    ...(receipt.replayOutcomes
      ? { replayOutcomes: receipt.replayOutcomes.map(cloneReplayOutcome) }
      : {}),
    ...(receipt.agentActions
      ? { agentActions: receipt.agentActions.map(cloneAgentActionReceipt) }
      : {}),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}

export function cloneCrossHardwareCompilationReceipt(
  receipt: CrossHardwareCompilationReceipt,
): CrossHardwareCompilationReceipt {
  return {
    ...receipt,
    ...(receipt.constraints ? { constraints: { ...receipt.constraints } } : {}),
    ...(receipt.measuredResults ? { measuredResults: { ...receipt.measuredResults } } : {}),
    ...(receipt.replayInputs
      ? { replayInputs: receipt.replayInputs.map(cloneReplayInput) }
      : {}),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
