/**
 * HoloShell Brittney Field Action Receipts
 *
 * Prove autonomous Brittney field actions. Every autonomous action that
 * Brittney (the primary assistant agent) takes in a HoloShell field session
 * produces a receipt pack that is visible, auditable, and reversible by
 * default.
 *
 * Receipt pack structure mirrors the established HoloShell receipt pattern
 * (account-export, device-safety, asset-shard):
 *
 *   1. SourceContext  — who/what initiated the action and why (provenance)
 *   2. PermissionEnvelope — what permission level the action ran under
 *   3. TimelineEntry  — timeline visibility (room change or event log)
 *   4. FieldAction    — the action itself: verb, target, inputs hash, outcome
 *   5. RepairPath     — how to undo or repair if something went wrong
 *   6. ReplayReceipt  — aggregate status tying the above together
 *
 * Safety invariants enforced by validators:
 *   - `mutationExecuted: false` by default (non-destructive default)
 *   - `reversible: true` required unless explicitly overridden with repair
 *   - `sourceContext.autoInitiated: true` required for autonomous actions
 *   - `sourceContext.humanApprovalRequired` tracks governance gate
 *   - `permissionEnvelope` must be one of the enumerated envelopes
 *   - Every action has a `repairPath` (even if it's `not_repairable`,
 *     the field must be present — silence is not safety)
 *
 * Created: task_1779149587047_fd60 ([receipts][safety] Prove autonomous Brittney field actions)
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Enumeration constants ──

export const BRITTNEY_FIELD_ACTION_KINDS = [
  'tool_call',
  'claim_task',
  'complete_task',
  'send_message',
  'knowledge_sync',
  'file_read',
  'file_write',
  'file_delete',
  'network_request',
  'compile_target',
  'absorb_codebase',
  'board_operation',
  'session_handoff',
  'environment_change',
  'agent-other',
] as const;
export type BrittneyFieldActionKind = (typeof BRITTNEY_FIELD_ACTION_KINDS)[number];

export const BRITTNEY_FIELD_PERMISSION_ENVELOPES = [
  'read_only',
  'session_scoped',
  'guarded_execute',
  'break_glass',
  'break_glass_blocked',
] as const;
export type BrittneyFieldPermissionEnvelope =
  (typeof BRITTNEY_FIELD_PERMISSION_ENVELOPES)[number];

export const BRITTNEY_FIELD_OUTCOMES = [
  'success',
  'partial',
  'blocked_by_policy',
  'blocked_by_consent',
  'failed',
  'rolled_back',
] as const;
export type BrittneyFieldOutcome = (typeof BRITTNEY_FIELD_OUTCOMES)[number];

export const BRITTNEY_FIELD_REPAIR_KINDS = [
  'undo_command',
  'git_revert',
  'board_unclaim',
  'board_reopen',
  'manual_repair',
  'not_repairable',
  'auto_rolled_back',
] as const;
export type BrittneyFieldRepairKind = (typeof BRITTNEY_FIELD_REPAIR_KINDS)[number];

export const BRITTNEY_FIELD_SOURCE_KINDS = [
  'auto_claim',
  'auto_continue',
  'auto_heal',
  'auto_audit',
  'hook_triggered',
  'schedule_triggered',
  'peer_delegation',
  'founder_directive',
  'cascade_from_parent',
] as const;
export type BrittneyFieldSourceKind = (typeof BRITTNEY_FIELD_SOURCE_KINDS)[number];

export const BRITTNEY_TIMELINE_VISIBILITIES = [
  'room_broadcast',
  'room_log',
  'private_session',
  'founder_only',
] as const;
export type BrittneyTimelineVisibility = (typeof BRITTNEY_TIMELINE_VISIBILITIES)[number];

export const BRITTNEY_FIELD_CHECK_KINDS = [
  'auto_initiated_flag_set',
  'permission_envelope_declared',
  'mutation_guard_checked',
  'repair_path_present',
  'timeline_entry_created',
  'source_context_traceable',
  'no_hidden_automation',
  'consent_gate_respected',
] as const;
export type BrittneyFieldCheckKind = (typeof BRITTNEY_FIELD_CHECK_KINDS)[number];

// ── Sub-receipt interfaces ──

export interface BrittneyFieldSourceContext {
  id: string;
  sourceKind: BrittneyFieldSourceKind;
  /** The agent or surface that initiated this action. */
  initiatedBy: string;
  /** The reason or trigger for the autonomous action. */
  triggerDescription: string;
  /** True for all autonomous actions — Brittney initiated without human prompting. */
  autoInitiated: true;
  /** Whether a human approval step was required before this action. */
  humanApprovalRequired: boolean;
  /** If human approval was required, was it obtained? */
  humanApprovalObtained: boolean;
  /** Parent action ID if this is a cascade from a prior action. */
  parentActionId?: string;
  /** The task, board item, or session that this action serves. */
  contextRef?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface BrittneyFieldPermissionEnvelopeData {
  id: string;
  envelopeKind: BrittneyFieldPermissionEnvelope;
  /** What the action was allowed to do. */
  scopeDescription: string;
  /** Whether the action was allowed to mutate state. */
  mutationAllowed: boolean;
  /** Whether the action was allowed to access secrets. */
  secretAccessAllowed: boolean;
  /** Whether the action was allowed to make network calls. */
  networkAccessAllowed: boolean;
  /** Whether this envelope required a fresh human gesture. */
  requiresFreshUserGesture: boolean;
  /** Whether the action was reversible by default. */
  reversibleByDefault: true;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface BrittneyFieldTimelineEntry {
  id: string;
  visibility: BrittneyTimelineVisibility;
  /** Room ID or session context where this entry is visible. */
  roomId?: string;
  /** Human-readable summary shown on the timeline. */
  summary: string;
  /** Whether this entry caused a room state change (board, presence, mode). */
  roomChange: boolean;
  /** The field action receipt this entry is about. */
  fieldActionId: string;
  /** ISO-8601 timestamp of when this entry was created. */
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface BrittneyFieldCheck {
  kind: BrittneyFieldCheckKind;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
}

export interface BrittneyFieldRepairPath {
  /** What kind of repair is available. */
  repairKind: BrittneyFieldRepairKind;
  /** Human-readable description of the repair step. */
  description: string;
  /** Command or action to execute for repair (if applicable). */
  repairCommand?: string;
  /** Whether the action is reversible. */
  reversible: boolean;
  /** If true, the action was automatically rolled back before receipt creation. */
  autoRolledBack: boolean;
  /** Reference to the undo receipt if auto-rolled back. */
  undoReceiptId?: string;
}

export interface BrittneyFieldActionReceipt {
  id: string;
  actionKind: BrittneyFieldActionKind;
  /** Human-readable label for `agent-other` actions. */
  actionLabel?: string;
  /** The target of this action (file path, task ID, URL, etc.). */
  target: string;
  /** Hash of the inputs to this action for deterministic replay. */
  inputsHash: string;
  /** Hash of the outputs of this action for verification. */
  outputsHash?: string;
  /** The permission envelope data under which this action ran. */
  permissionEnvelope: BrittneyFieldPermissionEnvelopeData;
  /** Source context proving this was an autonomous action. */
  sourceContext: BrittneyFieldSourceContext;
  /** Timeline entry for visibility. */
  timelineEntry?: BrittneyFieldTimelineEntry;
  /** Safety checks performed before/during this action. */
  checks: BrittneyFieldCheck[];
  /** Repair path — always present, even if `not_repairable`. */
  repairPath: BrittneyFieldRepairPath;
  /** Whether this action mutated any state. */
  mutationExecuted: boolean;
  /** Whether this action was executed in a non-destructive way. */
  nonDestructiveDefault: true;
  /** Outcome of the action. */
  outcome: BrittneyFieldOutcome;
  outcomeDescription?: string;
  /** ISO-8601 timestamp when the action started. */
  startedAt: string;
  /** ISO-8601 timestamp when the action ended. */
  endedAt: string;
  /** The session or surface this action was executed on. */
  executedOn: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  provenance?: ArtifactProvenanceLink;
  verificationCommands?: ArtifactVerificationCommand[];
}

export interface BrittneyFieldReplayReceipt {
  id: string;
  /** The workflow this replay belongs to. */
  workflow: 'brittney-field-action';
  /** The field action this replay summarizes. */
  fieldActionId: string;
  /** Status of the overall receipt pack. */
  status: BrittneyFieldOutcome;
  /** Whether any mutation was actually executed. */
  mutationExecuted: boolean;
  /** Whether all mutations were reversible. */
  allMutationsReversible: boolean;
  /** Whether the action is visible on a timeline. */
  timelineVisible: boolean;
  /** Whether source context is traceable. */
  sourceTraceable: boolean;
  /** Summary of the repair path. */
  repairSummary: string;
  /** ISO-8601 timestamp of replay creation. */
  createdAt: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

export interface HoloShellBrittneyActionReceiptPack {
  id: string;
  action: BrittneyFieldActionReceipt;
  replay: BrittneyFieldReplayReceipt;
  outcome: BrittneyFieldOutcome;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
}

// ── Type guards ──

export function isSupportedBrittneyFieldActionKind(
  kind: string
): kind is BrittneyFieldActionKind {
  return (BRITTNEY_FIELD_ACTION_KINDS as readonly string[]).includes(kind);
}

export function isSupportedBrittneyFieldPermissionEnvelope(
  envelope: string
): envelope is BrittneyFieldPermissionEnvelope {
  return (BRITTNEY_FIELD_PERMISSION_ENVELOPES as readonly string[]).includes(envelope);
}

export function isSupportedBrittneyFieldOutcome(
  outcome: string
): outcome is BrittneyFieldOutcome {
  return (BRITTNEY_FIELD_OUTCOMES as readonly string[]).includes(outcome);
}

export function isSupportedBrittneyFieldRepairKind(
  kind: string
): kind is BrittneyFieldRepairKind {
  return (BRITTNEY_FIELD_REPAIR_KINDS as readonly string[]).includes(kind);
}

export function isSupportedBrittneyFieldSourceKind(
  kind: string
): kind is BrittneyFieldSourceKind {
  return (BRITTNEY_FIELD_SOURCE_KINDS as readonly string[]).includes(kind);
}

export function isSupportedBrittneyTimelineVisibility(
  visibility: string
): visibility is BrittneyTimelineVisibility {
  return (BRITTNEY_TIMELINE_VISIBILITIES as readonly string[]).includes(visibility);
}

// ── Validators ──

function isIsoTimestamp(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function validateHashFields(
  label: string,
  hash: string | undefined,
  algorithm: ArtifactHashAlgorithm | undefined,
  errors: string[]
): void {
  if (!hash) errors.push(`${label}.hash is required.`);
  if (!algorithm) errors.push(`${label}.hashAlgorithm is required.`);
}

function validateChecks(
  checks: BrittneyFieldCheck[] | undefined,
  label: string,
  errors: string[]
): void {
  if (!Array.isArray(checks)) {
    errors.push(`${label}.checks must be an array.`);
    return;
  }
  for (const check of checks) {
    if (!isOneOf(BRITTNEY_FIELD_CHECK_KINDS, String(check.kind))) {
      errors.push(`${label}.checks kind is unsupported: ${String(check.kind)}.`);
    }
    if (!isOneOf(['pass', 'warn', 'fail'] as const, String(check.status))) {
      errors.push(`${label}.checks status is unsupported: ${String(check.status)}.`);
    }
  }
}

function validateVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
  prefix: string,
  errors: string[]
): void {
  for (const command of commands ?? []) {
    if (!command.command) {
      errors.push(`${prefix} has a verification command without command text.`);
    }
  }
}

export function validateBrittneyFieldSourceContext(
  source: BrittneyFieldSourceContext
): string[] {
  const errors: string[] = [];
  if (!source.id) errors.push('BrittneyFieldSourceContext.id is required.');
  if (!isSupportedBrittneyFieldSourceKind(String(source.sourceKind))) {
    errors.push(`BrittneyFieldSourceContext.sourceKind is unsupported: ${String(source.sourceKind)}.`);
  }
  if (!source.initiatedBy) errors.push('BrittneyFieldSourceContext.initiatedBy is required.');
  if (!source.triggerDescription) errors.push('BrittneyFieldSourceContext.triggerDescription is required.');
  if (source.autoInitiated !== true) {
    errors.push('BrittneyFieldSourceContext.autoInitiated must be true for autonomous actions.');
  }
  if (typeof source.humanApprovalRequired !== 'boolean') {
    errors.push('BrittneyFieldSourceContext.humanApprovalRequired must be a boolean.');
  }
  if (source.humanApprovalRequired && typeof source.humanApprovalObtained !== 'boolean') {
    errors.push('BrittneyFieldSourceContext.humanApprovalObtained must be a boolean when humanApprovalRequired is true.');
  }
  validateHashFields('BrittneyFieldSourceContext', source.hash, source.hashAlgorithm, errors);
  return errors;
}

export function validateBrittneyFieldPermissionEnvelopeData(
  envelope: BrittneyFieldPermissionEnvelopeData
): string[] {
  const errors: string[] = [];
  if (!envelope.id) errors.push('BrittneyFieldPermissionEnvelope.id is required.');
  if (!isSupportedBrittneyFieldPermissionEnvelope(String(envelope.envelopeKind))) {
    errors.push(`BrittneyFieldPermissionEnvelope.envelopeKind is unsupported: ${String(envelope.envelopeKind)}.`);
  }
  if (!envelope.scopeDescription) {
    errors.push('BrittneyFieldPermissionEnvelope.scopeDescription is required.');
  }
  if (typeof envelope.mutationAllowed !== 'boolean') {
    errors.push('BrittneyFieldPermissionEnvelope.mutationAllowed must be a boolean.');
  }
  if (typeof envelope.secretAccessAllowed !== 'boolean') {
    errors.push('BrittneyFieldPermissionEnvelope.secretAccessAllowed must be a boolean.');
  }
  if (typeof envelope.networkAccessAllowed !== 'boolean') {
    errors.push('BrittneyFieldPermissionEnvelope.networkAccessAllowed must be a boolean.');
  }
  if (typeof envelope.requiresFreshUserGesture !== 'boolean') {
    errors.push('BrittneyFieldPermissionEnvelope.requiresFreshUserGesture must be a boolean.');
  }
  if (envelope.reversibleByDefault !== true) {
    errors.push('BrittneyFieldPermissionEnvelope.reversibleByDefault must be true.');
  }
  if (envelope.envelopeKind === 'break_glass_blocked' && envelope.mutationAllowed) {
    errors.push('BrittneyFieldPermissionEnvelope break_glass_blocked cannot allow mutations.');
  }
  validateHashFields('BrittneyFieldPermissionEnvelope', envelope.hash, envelope.hashAlgorithm, errors);
  return errors;
}

export function validateBrittneyFieldTimelineEntry(
  entry: BrittneyFieldTimelineEntry
): string[] {
  const errors: string[] = [];
  if (!entry.id) errors.push('BrittneyFieldTimelineEntry.id is required.');
  if (!isSupportedBrittneyTimelineVisibility(String(entry.visibility))) {
    errors.push(`BrittneyFieldTimelineEntry.visibility is unsupported: ${String(entry.visibility)}.`);
  }
  if (!entry.summary) errors.push('BrittneyFieldTimelineEntry.summary is required.');
  if (typeof entry.roomChange !== 'boolean') {
    errors.push('BrittneyFieldTimelineEntry.roomChange must be a boolean.');
  }
  if (!entry.fieldActionId) errors.push('BrittneyFieldTimelineEntry.fieldActionId is required.');
  if (!isIsoTimestamp(entry.createdAt)) {
    errors.push('BrittneyFieldTimelineEntry.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateHashFields('BrittneyFieldTimelineEntry', entry.hash, entry.hashAlgorithm, errors);
  return errors;
}

export function validateBrittneyFieldRepairPath(
  repair: BrittneyFieldRepairPath
): string[] {
  const errors: string[] = [];
  if (!isSupportedBrittneyFieldRepairKind(String(repair.repairKind))) {
    errors.push(`BrittneyFieldRepairPath.repairKind is unsupported: ${String(repair.repairKind)}.`);
  }
  if (!repair.description) errors.push('BrittneyFieldRepairPath.description is required.');
  if (typeof repair.reversible !== 'boolean') {
    errors.push('BrittneyFieldRepairPath.reversible must be a boolean.');
  }
  if (typeof repair.autoRolledBack !== 'boolean') {
    errors.push('BrittneyFieldRepairPath.autoRolledBack must be a boolean.');
  }
  // If repairKind is not_repairable, reversible must be false.
  if (repair.repairKind === 'not_repairable' && repair.reversible) {
    errors.push('BrittneyFieldRepairPath.reversible must be false when repairKind is not_repairable.');
  }
  // If autoRolledBack is true, undoReceiptId should be present.
  if (repair.autoRolledBack && !repair.undoReceiptId) {
    errors.push('BrittneyFieldRepairPath.undoReceiptId is required when autoRolledBack is true.');
  }
  return errors;
}

export function validateBrittneyFieldActionReceipt(
  receipt: BrittneyFieldActionReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('BrittneyFieldActionReceipt.id is required.');
  if (!isSupportedBrittneyFieldActionKind(String(receipt.actionKind))) {
    errors.push(`BrittneyFieldActionReceipt.actionKind is unsupported: ${String(receipt.actionKind)}.`);
  }
  if (receipt.actionKind === 'agent-other' && !receipt.actionLabel) {
    errors.push('BrittneyFieldActionReceipt.actionLabel is required when actionKind is agent-other.');
  }
  if (!receipt.target) errors.push('BrittneyFieldActionReceipt.target is required.');
  if (!receipt.inputsHash) errors.push('BrittneyFieldActionReceipt.inputsHash is required.');

  // Validate permission envelope
  if (!receipt.permissionEnvelope) {
    errors.push('BrittneyFieldActionReceipt.permissionEnvelope is required.');
  } else {
    errors.push(...validateBrittneyFieldPermissionEnvelopeData(receipt.permissionEnvelope));
  }

  // Validate source context
  if (!receipt.sourceContext) {
    errors.push('BrittneyFieldSourceContext is required.');
  } else {
    errors.push(...validateBrittneyFieldSourceContext(receipt.sourceContext));
  }

  // Validate timeline entry if present
  if (receipt.timelineEntry) {
    errors.push(...validateBrittneyFieldTimelineEntry(receipt.timelineEntry));
  }

  // Validate checks
  validateChecks(receipt.checks, 'BrittneyFieldActionReceipt', errors);

  // Validate repair path — always present
  if (!receipt.repairPath) {
    errors.push('BrittneyFieldActionReceipt.repairPath is required (silence is not safety).');
  } else {
    errors.push(...validateBrittneyFieldRepairPath(receipt.repairPath));
  }

  // Safety invariants
  if (typeof receipt.mutationExecuted !== 'boolean') {
    errors.push('BrittneyFieldActionReceipt.mutationExecuted must be a boolean.');
  }
  if (receipt.nonDestructiveDefault !== true) {
    errors.push('BrittneyFieldActionReceipt.nonDestructiveDefault must be true.');
  }
  if (receipt.mutationExecuted && !receipt.repairPath?.reversible && receipt.repairPath?.repairKind !== 'not_repairable') {
    errors.push('BrittneyFieldActionReceipt: mutating action must have reversible repair path or explicitly declare not_repairable.');
  }
  if (receipt.mutationExecuted && receipt.permissionEnvelope?.envelopeKind === 'read_only') {
    errors.push('BrittneyFieldActionReceipt: read_only envelope cannot execute mutations.');
  }

  if (!isSupportedBrittneyFieldOutcome(String(receipt.outcome))) {
    errors.push(`BrittneyFieldActionReceipt.outcome is unsupported: ${String(receipt.outcome)}.`);
  }
  if (!isIsoTimestamp(receipt.startedAt)) {
    errors.push('BrittneyFieldActionReceipt.startedAt must be a valid ISO-8601 timestamp.');
  }
  if (!isIsoTimestamp(receipt.endedAt)) {
    errors.push('BrittneyFieldActionReceipt.endedAt must be a valid ISO-8601 timestamp.');
  }
  if (!receipt.executedOn) errors.push('BrittneyFieldActionReceipt.executedOn is required.');

  validateHashFields('BrittneyFieldActionReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  validateVerificationCommands(
    receipt.verificationCommands,
    `BrittneyFieldActionReceipt ${receipt.id || '<unknown>'}`,
    errors
  );
  return errors;
}

export function validateBrittneyFieldReplayReceipt(
  receipt: BrittneyFieldReplayReceipt
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('BrittneyFieldReplayReceipt.id is required.');
  if (receipt.workflow !== 'brittney-field-action') {
    errors.push('BrittneyFieldReplayReceipt.workflow must be brittney-field-action.');
  }
  if (!receipt.fieldActionId) errors.push('BrittneyFieldReplayReceipt.fieldActionId is required.');
  if (!isSupportedBrittneyFieldOutcome(String(receipt.status))) {
    errors.push(`BrittneyFieldReplayReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (typeof receipt.mutationExecuted !== 'boolean') {
    errors.push('BrittneyFieldReplayReceipt.mutationExecuted must be a boolean.');
  }
  if (typeof receipt.allMutationsReversible !== 'boolean') {
    errors.push('BrittneyFieldReplayReceipt.allMutationsReversible must be a boolean.');
  }
  if (typeof receipt.timelineVisible !== 'boolean') {
    errors.push('BrittneyFieldReplayReceipt.timelineVisible must be a boolean.');
  }
  if (typeof receipt.sourceTraceable !== 'boolean') {
    errors.push('BrittneyFieldReplayReceipt.sourceTraceable must be a boolean.');
  }
  if (!receipt.repairSummary) errors.push('BrittneyFieldReplayReceipt.repairSummary is required.');
  if (!isIsoTimestamp(receipt.createdAt)) {
    errors.push('BrittneyFieldReplayReceipt.createdAt must be a valid ISO-8601 timestamp.');
  }
  validateHashFields('BrittneyFieldReplayReceipt', receipt.hash, receipt.hashAlgorithm, errors);
  return errors;
}

export function validateHoloShellBrittneyActionReceiptPack(
  pack: HoloShellBrittneyActionReceiptPack
): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push('HoloShellBrittneyActionReceiptPack.id is required.');
  if (!pack.action) {
    errors.push('HoloShellBrittneyActionReceiptPack.action is required.');
  } else {
    errors.push(...validateBrittneyFieldActionReceipt(pack.action));
  }
  if (!pack.replay) {
    errors.push('HoloShellBrittneyActionReceiptPack.replay is required.');
  } else {
    errors.push(...validateBrittneyFieldReplayReceipt(pack.replay));
  }
  if (!isSupportedBrittneyFieldOutcome(String(pack.outcome))) {
    errors.push(`HoloShellBrittneyActionReceiptPack.outcome is unsupported: ${String(pack.outcome)}.`);
  }
  validateHashFields('HoloShellBrittneyActionReceiptPack', pack.hash, pack.hashAlgorithm, errors);
  return errors;
}

// ── Clone functions ──

function cloneProvenance(provenance: ArtifactProvenanceLink): ArtifactProvenanceLink {
  return {
    ...provenance,
    ...(provenance.parentArtifactIds ? { parentArtifactIds: [...provenance.parentArtifactIds] } : {}),
  };
}

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[]
): ArtifactVerificationCommand[] {
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

export function cloneBrittneyFieldSourceContext(
  source: BrittneyFieldSourceContext
): BrittneyFieldSourceContext {
  return { ...source };
}

export function cloneBrittneyFieldPermissionEnvelopeData(
  envelope: BrittneyFieldPermissionEnvelopeData
): BrittneyFieldPermissionEnvelopeData {
  return { ...envelope };
}

export function cloneBrittneyFieldTimelineEntry(
  entry: BrittneyFieldTimelineEntry
): BrittneyFieldTimelineEntry {
  return { ...entry };
}

export function cloneBrittneyFieldRepairPath(
  repair: BrittneyFieldRepairPath
): BrittneyFieldRepairPath {
  return { ...repair };
}

export function cloneBrittneyFieldActionReceipt(
  receipt: BrittneyFieldActionReceipt
): BrittneyFieldActionReceipt {
  return {
    ...receipt,
    permissionEnvelope: cloneBrittneyFieldPermissionEnvelopeData(receipt.permissionEnvelope),
    sourceContext: cloneBrittneyFieldSourceContext(receipt.sourceContext),
    ...(receipt.timelineEntry ? { timelineEntry: cloneBrittneyFieldTimelineEntry(receipt.timelineEntry) } : {}),
    checks: receipt.checks.map((check) => ({ ...check })),
    repairPath: cloneBrittneyFieldRepairPath(receipt.repairPath),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) } : {}),
  };
}

export function cloneBrittneyFieldReplayReceipt(
  receipt: BrittneyFieldReplayReceipt
): BrittneyFieldReplayReceipt {
  return { ...receipt };
}

export function cloneHoloShellBrittneyActionReceiptPack(
  pack: HoloShellBrittneyActionReceiptPack
): HoloShellBrittneyActionReceiptPack {
  return {
    ...pack,
    action: cloneBrittneyFieldActionReceipt(pack.action),
    replay: cloneBrittneyFieldReplayReceipt(pack.replay),
  };
}