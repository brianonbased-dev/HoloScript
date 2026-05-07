/**
 * Agent Steward Protocol — accountability envelope for live HoloLand worlds.
 *
 * HoloLand needs agents that run events, factions, economy, safety, and QA
 * with accountability. Existing primitives:
 *   - frontier-shard.ts    ─ what the content IS (Shard / Zone / Encounter / Quest / Item / Skill / LootTable)
 *   - hololand-receipts.ts ─ what HAPPENED on a Shard (HardwareReceipt / ReplayInput / ReplayOutcome / AgentActionReceipt / ValidationReceipt)
 *
 * This module fills the gap between "what happened" and "what an agent
 * decided to do next". It defines:
 *
 *   - AgentSteward       — the actor: identity, role, scope, capabilities,
 *                          governance limits the agent self-binds to
 *   - StewardProposal    — a proposed mutation to live world state, with
 *                          rollback plan, expected impact, and required
 *                          approvals
 *   - WorldIssue         — a moderation/safety/QA finding the steward (or a
 *                          peer agent) raised about the live world; drives
 *                          downstream proposals or emergency rollbacks
 *   - StewardActionReceipt — the after-the-fact proof envelope a steward
 *                          ships when a proposal lands. References the
 *                          proposal, the AgentActionReceipts it spawned
 *                          (from hololand-receipts.ts), and the resulting
 *                          ValidationReceipts that prove the change
 *                          round-trips on hardware/replay.
 *
 * Wiring (consumed by Brittney + HoloMesh):
 *   1. Brittney scans the live world, raises WorldIssue entries.
 *   2. Steward agents claim issues, draft StewardProposal envelopes
 *      (includes RollbackPlan + impact + required approvals).
 *   3. Approvals arrive as governance votes (via team board suggestions
 *      or agent-action receipts of kind `governance-vote`).
 *   4. Once approved, the steward enacts the proposal via
 *      AgentActionReceipts (existing model from hololand-receipts.ts).
 *   5. The post-enactment world is replay-validated, producing
 *      ValidationReceipts.
 *   6. The steward seals a StewardActionReceipt that bundles all of the
 *      above with a final outcome status.
 *
 * Discipline: same shape and rigor as frontier-shard.ts and
 * hololand-receipts.ts — readonly enum tuples, type guards, structural
 * validators returning string[], deep clones, grep-friendly nested error
 * prefixes (`<class>[id]: `), and provenance/verificationCommands on
 * every leaf so existing board tooling keeps working.
 *
 * Created: task_1778186605462_rp05 (P1 holoscript-upstream)
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';
import type {
  AgentActionReceipt,
  ValidationReceipt,
} from './hololand-receipts';

// ── Steward identity ──

/**
 * Steward role family. Drives default capability gates and which kinds of
 * proposals the steward is allowed to author without an additional
 * governance vote (see StewardProposal.requiredApprovals).
 *
 * - event-runner     — schedules and runs scripted events / encounters
 * - faction-keeper   — adjudicates faction reputation, alliances, splits
 * - economy-keeper   — manages currency supply, market makers, sinks/faucets
 * - safety-mod       — moderation / safety review, has emergency rollback
 * - qa-runner        — replay validation, regression runs, coverage reports
 * - lore-keeper      — quest authoring, item/skill curation, narrative gates
 * - steward-other    — anything outside the enumerated set; describe in
 *   `AgentSteward.roleLabel`.
 */
export const STEWARD_ROLES = [
  'event-runner',
  'faction-keeper',
  'economy-keeper',
  'safety-mod',
  'qa-runner',
  'lore-keeper',
  'steward-other',
] as const;

export type StewardRole = (typeof STEWARD_ROLES)[number];

/**
 * Capability bucket a steward self-claims at registration time. Mirrors
 * the Skill primitive in frontier-shard.ts but operates on the world,
 * not on a single character — these are the verbs the steward agent is
 * willing to take responsibility for.
 *
 * - spawn-encounter   — instantiate Encounters into live Zones
 * - gate-quest        — open/close Quest steps for player cohorts
 * - reward-issue      — mint Items or grant Skills outside default LootTable rolls
 * - mod-action        — moderation: hide content, kick actor, freeze zone
 * - economy-tune      — adjust market parameters, sink/faucet rates
 * - world-event       — emit broadcast events that arm on-broadcast encounters
 * - governance-vote   — cast a vote on a peer steward's proposal
 * - capability-other  — anything outside the enumerated set; describe in
 *   `StewardCapability.label`.
 *
 * Note: this enum intentionally OVERLAPS with AGENT_ACTION_KINDS
 * (hololand-receipts.ts) so a StewardProposal's claimed capabilities can
 * be cross-referenced against the AgentActionReceipts it ultimately
 * spawns. The two sets are kept independent to allow each to evolve at
 * its own cadence.
 */
export const STEWARD_CAPABILITY_KINDS = [
  'spawn-encounter',
  'gate-quest',
  'reward-issue',
  'mod-action',
  'economy-tune',
  'world-event',
  'governance-vote',
  'capability-other',
] as const;

export type StewardCapabilityKind = (typeof STEWARD_CAPABILITY_KINDS)[number];

export interface StewardCapability {
  /** Capability bucket. Use `capability-other` and `label` for off-list. */
  kind: StewardCapabilityKind;
  /** Free-form label when `kind` is `capability-other`. */
  label?: string;
  /** Optional Skill ids (from frontier-shard.ts) that gate this capability. */
  requiredSkillIds?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Steward governance scope — the slice of the live world this steward is
 * authoritative over. Stacks: a steward can declare scope at any of
 * shard / zone / faction / quest granularity, with empty arrays meaning
 * "global at that level".
 */
export interface StewardScope {
  /** Shard ids the steward is bound to (empty = all shards). */
  shardIds?: string[];
  /** Zone ids the steward is bound to (empty = all zones in scoped shards). */
  zoneIds?: string[];
  /** Faction ids the steward is bound to (empty = all factions). */
  factionIds?: string[];
  /** Quest ids the steward is bound to (empty = all quests). */
  questIds?: string[];
}

/**
 * AgentSteward — registration record for a live-world steward agent.
 * Persisted as an artifact so its provenance + capabilities are
 * audit-trail visible to peers and to Brittney.
 */
export interface AgentSteward {
  /** Stable steward id, e.g. `steward_oasis_event_runner_001`. */
  id: string;
  /** Agent identity — wallet address, handle, or other stable id. */
  actor: string;
  /** Steward role bucket. Use `steward-other` and `roleLabel` for off-list. */
  role: StewardRole;
  /** Free-form role label when `role` is `steward-other`. */
  roleLabel?: string;
  /** Capabilities the steward self-claims. */
  capabilities: StewardCapability[];
  /** Governance scope (which shards/zones/factions/quests). */
  scope: StewardScope;
  /** Registration timestamp (ISO-8601 or Unix ms). */
  registeredAt: string | number;
  /** Optional expiry (ISO-8601 or Unix ms). Undefined = no expiry. */
  expiresAt?: string | number;
  /** Hash of the canonical steward body (id + actor + role + capabilities + scope). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── World issues — moderation/safety/QA findings ──

/**
 * WorldIssue severity. Drives default escalation: critical issues
 * bypass the normal proposal flow and authorize emergency rollback.
 *
 * - info     — observation, no action required
 * - low      — cosmetic / minor balance issue
 * - medium   — gameplay-affecting, should be triaged within a session
 * - high     — blocks a quest or zone, should be triaged immediately
 * - critical — safety/integrity breach, authorizes emergency rollback
 */
export const WORLD_ISSUE_SEVERITIES = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type WorldIssueSeverity = (typeof WORLD_ISSUE_SEVERITIES)[number];

/**
 * WorldIssue category. Bucketed for routing to the right steward role.
 *
 * - safety       — player-safety or content-safety concern (routes to safety-mod)
 * - moderation   — TOS / community-standard violation (routes to safety-mod)
 * - balance      — gameplay/economy imbalance (routes to economy-keeper or event-runner)
 * - bug          — software defect, scenario does not behave as authored (routes to qa-runner)
 * - lore         — narrative inconsistency (routes to lore-keeper)
 * - performance  — frame-rate / latency / capacity issue (routes to qa-runner)
 * - issue-other  — anything outside the enumerated set; describe in `WorldIssue.categoryLabel`.
 */
export const WORLD_ISSUE_CATEGORIES = [
  'safety',
  'moderation',
  'balance',
  'bug',
  'lore',
  'performance',
  'issue-other',
] as const;

export type WorldIssueCategory = (typeof WORLD_ISSUE_CATEGORIES)[number];

/**
 * WorldIssue status — moves through a small lifecycle from `open` to a
 * terminal state. Stewards transition status by emitting receipts.
 *
 * - open        — newly raised, awaiting triage
 * - triaged     — assigned to a steward, proposal pending
 * - resolved    — proposal landed and validated
 * - dismissed   — explicitly judged not actionable
 * - duplicate   — references another issue id via `duplicateOf`
 */
export const WORLD_ISSUE_STATUSES = [
  'open',
  'triaged',
  'resolved',
  'dismissed',
  'duplicate',
] as const;

export type WorldIssueStatus = (typeof WORLD_ISSUE_STATUSES)[number];

export interface WorldIssue {
  /** Stable issue id, e.g. `issue_oasis_zone_market_balance_001`. */
  id: string;
  /** Bucketed category. Use `issue-other` and `categoryLabel` for off-list. */
  category: WorldIssueCategory;
  /** Free-form category label when `category` is `issue-other`. */
  categoryLabel?: string;
  /** Severity bucket. */
  severity: WorldIssueSeverity;
  /** Lifecycle status. */
  status: WorldIssueStatus;
  /** When the issue was raised (ISO-8601 or Unix ms). */
  raisedAt: string | number;
  /** Reporter — agent handle, wallet address, scripted scanner id. */
  reporter: string;
  /** One-line summary, kept short (under ~200 chars by convention). */
  summary: string;
  /** Optional Shard id this issue is anchored to. */
  shardId?: string;
  /** Optional Zone id this issue is anchored to. */
  zoneId?: string;
  /** Optional Quest id this issue is anchored to. */
  questId?: string;
  /** When status is `duplicate`, references the canonical issue id. */
  duplicateOf?: string;
  /** Hash of the canonical issue body (id + category + severity + reporter + raisedAt). */
  hash?: string;
  hashAlgorithm?: ArtifactHashAlgorithm;
  /** Provenance link back to the producing task / commit / scanner. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Rollback plan ──

/**
 * RollbackStep kind. Mirrors the structural categories of mutation a
 * steward can perform; rollback is the inverse op of the same shape.
 *
 * - state-restore   — restore a captured state hash
 * - inverse-action  — invert a previously committed AgentActionReceipt
 * - manual          — out-of-band recovery; `instructions` required
 * - rollback-other  — anything outside the enumerated set; describe in `RollbackStep.label`.
 */
export const ROLLBACK_STEP_KINDS = [
  'state-restore',
  'inverse-action',
  'manual',
  'rollback-other',
] as const;

export type RollbackStepKind = (typeof ROLLBACK_STEP_KINDS)[number];

export interface RollbackStep {
  /** Stable step id within the rollback plan. */
  id: string;
  /** Step bucket. Use `rollback-other` and `label` for off-list. */
  kind: RollbackStepKind;
  /** Free-form label when `kind` is `rollback-other`. */
  label?: string;
  /** Captured state hash to restore (when kind is `state-restore`). */
  targetStateHash?: string;
  /** Hash algorithm for `targetStateHash`. */
  targetStateHashAlgorithm?: ArtifactHashAlgorithm;
  /** AgentActionReceipt id to invert (when kind is `inverse-action`). */
  invertActionId?: string;
  /** Out-of-band recovery instructions (required when kind is `manual`). */
  instructions?: string;
  metadata?: Record<string, unknown>;
}

export interface RollbackPlan {
  /** Stable rollback plan id within the parent proposal. */
  id: string;
  /** Ordered steps. Must be non-empty. */
  steps: RollbackStep[];
  /** Optional human-readable summary of the rollback strategy. */
  summary?: string;
  metadata?: Record<string, unknown>;
}

// ── Steward proposal ──

/**
 * StewardProposal status — moves from `draft` to a terminal state.
 *
 * - draft       — authored but not yet submitted for governance
 * - submitted   — submitted, awaiting approvals
 * - approved    — sufficient approvals; eligible for enactment
 * - enacted     — landed; spawned AgentActionReceipts
 * - rejected    — explicitly voted down
 * - withdrawn   — author withdrew before reaching a terminal state
 * - rolled-back — enacted then reversed via the RollbackPlan
 */
export const STEWARD_PROPOSAL_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'enacted',
  'rejected',
  'withdrawn',
  'rolled-back',
] as const;

export type StewardProposalStatus = (typeof STEWARD_PROPOSAL_STATUSES)[number];

/**
 * Expected impact bucket for a proposal. Drives default approval
 * thresholds (see StewardProposal.requiredApprovals).
 *
 * - cosmetic    — no gameplay or economy effect
 * - localized   — affects a single Zone or Quest
 * - shard-wide  — affects the entire Shard
 * - cross-shard — affects multiple Shards
 * - economy     — touches currency / market / scarce-item supply
 * - safety      — moderation / TOS enforcement; bypasses normal vote on critical issues
 */
export const PROPOSAL_IMPACT_KINDS = [
  'cosmetic',
  'localized',
  'shard-wide',
  'cross-shard',
  'economy',
  'safety',
] as const;

export type ProposalImpactKind = (typeof PROPOSAL_IMPACT_KINDS)[number];

export interface ProposalImpact {
  /** Impact bucket. */
  kind: ProposalImpactKind;
  /** Affected Shard ids. */
  shardIds?: string[];
  /** Affected Zone ids. */
  zoneIds?: string[];
  /** Affected Quest ids. */
  questIds?: string[];
  /** Optional one-line summary (under ~200 chars by convention). */
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface StewardProposal {
  /** Stable proposal id, e.g. `prop_oasis_market_rebalance_001`. */
  id: string;
  /** Steward id authoring the proposal. */
  stewardId: string;
  /** Lifecycle status. */
  status: StewardProposalStatus;
  /** When the proposal was authored (ISO-8601 or Unix ms). */
  authoredAt: string | number;
  /** Capabilities the proposal will exercise on enactment. Must be a non-empty subset of the steward's declared capabilities. */
  capabilities: StewardCapabilityKind[];
  /** Expected impact bucket(s). Must be non-empty. */
  impact: ProposalImpact[];
  /** Rollback plan. Required for any proposal whose impact includes anything other than `cosmetic`. */
  rollback?: RollbackPlan;
  /** WorldIssue ids this proposal addresses (optional but recommended). */
  addressesIssueIds?: string[];
  /** Number of governance approvals required before enactment. Must be a non-negative integer. */
  requiredApprovals: number;
  /** Approver ids (e.g. peer steward ids or wallet addresses). */
  approvedBy?: string[];
  /** Hash of the canonical proposal body (id + stewardId + authoredAt + capabilities + impact). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** One-line summary of the proposal (under ~200 chars by convention). */
  summary?: string;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the proposal's enactment effects. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Steward action receipt — top-level envelope ──

/**
 * StewardActionReceipt — the proof envelope a steward seals after a
 * proposal lands (or is explicitly rolled back). Bundles the proposal,
 * the AgentActionReceipts it spawned, and the ValidationReceipts that
 * back the post-enactment world.
 *
 * Sibling to ShardReceipt (frontier-shard.ts):
 *   - ShardReceipt          ─ proves a Shard's CONTENT is valid
 *   - StewardActionReceipt  ─ proves an agent's MUTATION on a Shard is accountable
 */
export interface StewardActionReceipt {
  /** Stable receipt id, e.g. `srcpt_steward_oasis_001_20260507`. */
  id: string;
  /** StewardProposal id this receipt enacts (or rolls back). */
  proposalId: string;
  /** Steward id that sealed the receipt. */
  stewardId: string;
  /** Outcome status. */
  status: 'enacted' | 'rolled-back' | 'partial' | 'failed';
  /** When the receipt was sealed (ISO-8601 or Unix ms). */
  sealedAt: string | number;
  /** Hash of the canonical receipt body (id + proposalId + stewardId + ordered children). */
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  /** AgentActionReceipts this enactment spawned (existing model). */
  agentActions?: AgentActionReceipt[];
  /** ValidationReceipts proving the post-enactment world round-trips. */
  validationReceipts?: ValidationReceipt[];
  /** WorldIssues this enactment resolves (must reference issues from the parent proposal's addressesIssueIds). */
  resolvedIssueIds?: string[];
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that prove the enactment can be replayed. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Type guards ──

export function isSupportedStewardRole(role: string): role is StewardRole {
  return (STEWARD_ROLES as readonly string[]).includes(role);
}

export function isSupportedStewardCapabilityKind(
  kind: string,
): kind is StewardCapabilityKind {
  return (STEWARD_CAPABILITY_KINDS as readonly string[]).includes(kind);
}

export function isSupportedWorldIssueSeverity(
  severity: string,
): severity is WorldIssueSeverity {
  return (WORLD_ISSUE_SEVERITIES as readonly string[]).includes(severity);
}

export function isSupportedWorldIssueCategory(
  category: string,
): category is WorldIssueCategory {
  return (WORLD_ISSUE_CATEGORIES as readonly string[]).includes(category);
}

export function isSupportedWorldIssueStatus(
  status: string,
): status is WorldIssueStatus {
  return (WORLD_ISSUE_STATUSES as readonly string[]).includes(status);
}

export function isSupportedRollbackStepKind(
  kind: string,
): kind is RollbackStepKind {
  return (ROLLBACK_STEP_KINDS as readonly string[]).includes(kind);
}

export function isSupportedStewardProposalStatus(
  status: string,
): status is StewardProposalStatus {
  return (STEWARD_PROPOSAL_STATUSES as readonly string[]).includes(status);
}

export function isSupportedProposalImpactKind(
  kind: string,
): kind is ProposalImpactKind {
  return (PROPOSAL_IMPACT_KINDS as readonly string[]).includes(kind);
}

const STEWARD_ACTION_RECEIPT_STATUSES = [
  'enacted',
  'rolled-back',
  'partial',
  'failed',
] as const;

export function isSupportedStewardActionReceiptStatus(
  status: string,
): status is StewardActionReceipt['status'] {
  return (STEWARD_ACTION_RECEIPT_STATUSES as readonly string[]).includes(status);
}

// ── Validators ──

export function validateStewardCapability(cap: StewardCapability): string[] {
  const errors: string[] = [];
  if (!isSupportedStewardCapabilityKind(cap.kind)) {
    errors.push(`StewardCapability.kind is unsupported: ${String(cap.kind)}.`);
  }
  if (cap.kind === 'capability-other' && !cap.label) {
    errors.push('StewardCapability kind=capability-other requires label.');
  }
  return errors;
}

export function validateAgentSteward(steward: AgentSteward): string[] {
  const errors: string[] = [];
  if (!steward.id) errors.push('AgentSteward.id is required.');
  if (!steward.actor) errors.push(`AgentSteward ${steward.id || '<unknown>'}.actor is required.`);
  if (!isSupportedStewardRole(steward.role)) {
    errors.push(`AgentSteward.role is unsupported: ${String(steward.role)}.`);
  }
  if (steward.role === 'steward-other' && !steward.roleLabel) {
    errors.push(`AgentSteward ${steward.id} role=steward-other requires roleLabel.`);
  }
  if (!Array.isArray(steward.capabilities) || steward.capabilities.length === 0) {
    errors.push(`AgentSteward ${steward.id}.capabilities must be a non-empty array.`);
  } else {
    for (let i = 0; i < steward.capabilities.length; i++) {
      const cap = steward.capabilities[i];
      for (const e of validateStewardCapability(cap)) {
        errors.push(`AgentSteward ${steward.id}.capabilities[${i}]: ${e}`);
      }
    }
  }
  if (!steward.scope || typeof steward.scope !== 'object') {
    errors.push(`AgentSteward ${steward.id}.scope is required.`);
  }
  if (
    steward.registeredAt === undefined ||
    steward.registeredAt === null ||
    steward.registeredAt === ''
  ) {
    errors.push(`AgentSteward ${steward.id}.registeredAt is required.`);
  }
  if (!steward.hash) errors.push(`AgentSteward ${steward.id}.hash is required.`);
  if (!steward.hashAlgorithm) {
    errors.push(`AgentSteward ${steward.id}.hashAlgorithm is required.`);
  }
  return errors;
}

export function validateWorldIssue(issue: WorldIssue): string[] {
  const errors: string[] = [];
  if (!issue.id) errors.push('WorldIssue.id is required.');
  if (!isSupportedWorldIssueCategory(issue.category)) {
    errors.push(`WorldIssue.category is unsupported: ${String(issue.category)}.`);
  }
  if (issue.category === 'issue-other' && !issue.categoryLabel) {
    errors.push(`WorldIssue ${issue.id} category=issue-other requires categoryLabel.`);
  }
  if (!isSupportedWorldIssueSeverity(issue.severity)) {
    errors.push(`WorldIssue.severity is unsupported: ${String(issue.severity)}.`);
  }
  if (!isSupportedWorldIssueStatus(issue.status)) {
    errors.push(`WorldIssue.status is unsupported: ${String(issue.status)}.`);
  }
  if (!issue.reporter) errors.push(`WorldIssue ${issue.id}.reporter is required.`);
  if (!issue.summary) errors.push(`WorldIssue ${issue.id}.summary is required.`);
  if (
    issue.raisedAt === undefined ||
    issue.raisedAt === null ||
    issue.raisedAt === ''
  ) {
    errors.push(`WorldIssue ${issue.id}.raisedAt is required.`);
  }
  if (issue.status === 'duplicate' && !issue.duplicateOf) {
    errors.push(`WorldIssue ${issue.id} status=duplicate requires duplicateOf.`);
  }
  if (issue.hash && !issue.hashAlgorithm) {
    errors.push(`WorldIssue ${issue.id}.hashAlgorithm is required when hash is set.`);
  }
  return errors;
}

export function validateRollbackStep(step: RollbackStep): string[] {
  const errors: string[] = [];
  if (!step.id) errors.push('RollbackStep.id is required.');
  if (!isSupportedRollbackStepKind(step.kind)) {
    errors.push(`RollbackStep.kind is unsupported: ${String(step.kind)}.`);
  }
  if (step.kind === 'rollback-other' && !step.label) {
    errors.push(`RollbackStep ${step.id} kind=rollback-other requires label.`);
  }
  if (step.kind === 'state-restore') {
    if (!step.targetStateHash) {
      errors.push(`RollbackStep ${step.id} kind=state-restore requires targetStateHash.`);
    }
    if (step.targetStateHash && !step.targetStateHashAlgorithm) {
      errors.push(
        `RollbackStep ${step.id} kind=state-restore requires targetStateHashAlgorithm when targetStateHash is set.`,
      );
    }
  }
  if (step.kind === 'inverse-action' && !step.invertActionId) {
    errors.push(`RollbackStep ${step.id} kind=inverse-action requires invertActionId.`);
  }
  if (step.kind === 'manual' && !step.instructions) {
    errors.push(`RollbackStep ${step.id} kind=manual requires instructions.`);
  }
  return errors;
}

export function validateRollbackPlan(plan: RollbackPlan): string[] {
  const errors: string[] = [];
  if (!plan.id) errors.push('RollbackPlan.id is required.');
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push(`RollbackPlan ${plan.id}.steps must be a non-empty array.`);
  } else {
    for (const step of plan.steps) {
      for (const e of validateRollbackStep(step)) {
        errors.push(`RollbackPlan ${plan.id}.steps[${step.id || '<unknown>'}]: ${e}`);
      }
    }
  }
  return errors;
}

export function validateProposalImpact(impact: ProposalImpact): string[] {
  const errors: string[] = [];
  if (!isSupportedProposalImpactKind(impact.kind)) {
    errors.push(`ProposalImpact.kind is unsupported: ${String(impact.kind)}.`);
  }
  return errors;
}

export function validateStewardProposal(proposal: StewardProposal): string[] {
  const errors: string[] = [];
  if (!proposal.id) errors.push('StewardProposal.id is required.');
  if (!proposal.stewardId) errors.push(`StewardProposal ${proposal.id || '<unknown>'}.stewardId is required.`);
  if (!isSupportedStewardProposalStatus(proposal.status)) {
    errors.push(`StewardProposal.status is unsupported: ${String(proposal.status)}.`);
  }
  if (
    proposal.authoredAt === undefined ||
    proposal.authoredAt === null ||
    proposal.authoredAt === ''
  ) {
    errors.push(`StewardProposal ${proposal.id}.authoredAt is required.`);
  }
  if (!Array.isArray(proposal.capabilities) || proposal.capabilities.length === 0) {
    errors.push(`StewardProposal ${proposal.id}.capabilities must be a non-empty array.`);
  } else {
    for (let i = 0; i < proposal.capabilities.length; i++) {
      const cap = proposal.capabilities[i];
      if (!isSupportedStewardCapabilityKind(cap)) {
        errors.push(
          `StewardProposal ${proposal.id}.capabilities[${i}] is unsupported: ${String(cap)}.`,
        );
      }
    }
  }
  if (!Array.isArray(proposal.impact) || proposal.impact.length === 0) {
    errors.push(`StewardProposal ${proposal.id}.impact must be a non-empty array.`);
  } else {
    for (let i = 0; i < proposal.impact.length; i++) {
      const imp = proposal.impact[i];
      for (const e of validateProposalImpact(imp)) {
        errors.push(`StewardProposal ${proposal.id}.impact[${i}]: ${e}`);
      }
    }
  }
  // Rollback plan required for any non-cosmetic-only proposal
  const impactKinds = (proposal.impact ?? []).map((i) => i.kind);
  const onlyCosmetic =
    impactKinds.length > 0 && impactKinds.every((k) => k === 'cosmetic');
  if (!onlyCosmetic) {
    if (!proposal.rollback) {
      errors.push(
        `StewardProposal ${proposal.id} requires a rollback plan when impact is not exclusively cosmetic.`,
      );
    } else {
      for (const e of validateRollbackPlan(proposal.rollback)) {
        errors.push(`StewardProposal ${proposal.id}.rollback: ${e}`);
      }
    }
  } else if (proposal.rollback) {
    // Cosmetic-only proposals MAY include a rollback; if present, it must be valid.
    for (const e of validateRollbackPlan(proposal.rollback)) {
      errors.push(`StewardProposal ${proposal.id}.rollback: ${e}`);
    }
  }
  if (
    !Number.isFinite(proposal.requiredApprovals) ||
    proposal.requiredApprovals < 0 ||
    !Number.isInteger(proposal.requiredApprovals)
  ) {
    errors.push(
      `StewardProposal ${proposal.id}.requiredApprovals must be a non-negative integer.`,
    );
  }
  if (
    proposal.status === 'approved' ||
    proposal.status === 'enacted' ||
    proposal.status === 'rolled-back'
  ) {
    const approvalCount = proposal.approvedBy?.length ?? 0;
    if (
      Number.isInteger(proposal.requiredApprovals) &&
      approvalCount < proposal.requiredApprovals
    ) {
      errors.push(
        `StewardProposal ${proposal.id} status=${proposal.status} requires approvedBy.length (${approvalCount}) >= requiredApprovals (${proposal.requiredApprovals}).`,
      );
    }
  }
  if (!proposal.hash) errors.push(`StewardProposal ${proposal.id}.hash is required.`);
  if (!proposal.hashAlgorithm) {
    errors.push(`StewardProposal ${proposal.id}.hashAlgorithm is required.`);
  }
  for (const command of proposal.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(
        `StewardProposal ${proposal.id} has a verification command without command text.`,
      );
    }
  }
  return errors;
}

/**
 * Validate a StewardActionReceipt envelope. Recursively validates any
 * nested AgentActionReceipts and ValidationReceipts via the supplied
 * validators (so this module stays decoupled from the concrete impls
 * in hololand-receipts.ts).
 */
export function validateStewardActionReceipt(
  receipt: StewardActionReceipt,
  validateAction: (a: AgentActionReceipt) => string[],
  validateValidation: (v: ValidationReceipt) => string[],
): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('StewardActionReceipt.id is required.');
  if (!receipt.proposalId) errors.push(`StewardActionReceipt ${receipt.id || '<unknown>'}.proposalId is required.`);
  if (!receipt.stewardId) errors.push(`StewardActionReceipt ${receipt.id}.stewardId is required.`);
  if (!isSupportedStewardActionReceiptStatus(receipt.status)) {
    errors.push(`StewardActionReceipt.status is unsupported: ${String(receipt.status)}.`);
  }
  if (
    receipt.sealedAt === undefined ||
    receipt.sealedAt === null ||
    receipt.sealedAt === ''
  ) {
    errors.push(`StewardActionReceipt ${receipt.id}.sealedAt is required.`);
  }
  if (!receipt.hash) errors.push(`StewardActionReceipt ${receipt.id}.hash is required.`);
  if (!receipt.hashAlgorithm) {
    errors.push(`StewardActionReceipt ${receipt.id}.hashAlgorithm is required.`);
  }
  for (const action of receipt.agentActions ?? []) {
    for (const e of validateAction(action)) {
      errors.push(`agentActions[${action.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const validation of receipt.validationReceipts ?? []) {
    for (const e of validateValidation(validation)) {
      errors.push(`validationReceipts[${validation.id || '<unknown>'}]: ${e}`);
    }
  }
  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(
        `StewardActionReceipt ${receipt.id} has a verification command without command text.`,
      );
    }
  }
  return errors;
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

export function cloneStewardCapability(cap: StewardCapability): StewardCapability {
  return {
    ...cap,
    ...(cap.requiredSkillIds ? { requiredSkillIds: [...cap.requiredSkillIds] } : {}),
    ...(cap.metadata ? { metadata: { ...cap.metadata } } : {}),
  };
}

export function cloneStewardScope(scope: StewardScope): StewardScope {
  return {
    ...(scope.shardIds ? { shardIds: [...scope.shardIds] } : {}),
    ...(scope.zoneIds ? { zoneIds: [...scope.zoneIds] } : {}),
    ...(scope.factionIds ? { factionIds: [...scope.factionIds] } : {}),
    ...(scope.questIds ? { questIds: [...scope.questIds] } : {}),
  };
}

export function cloneAgentSteward(steward: AgentSteward): AgentSteward {
  return {
    ...steward,
    capabilities: steward.capabilities.map(cloneStewardCapability),
    scope: cloneStewardScope(steward.scope),
    ...(steward.provenance ? { provenance: cloneProvenance(steward.provenance) } : {}),
    ...(steward.metadata ? { metadata: { ...steward.metadata } } : {}),
  };
}

export function cloneWorldIssue(issue: WorldIssue): WorldIssue {
  return {
    ...issue,
    ...(issue.provenance ? { provenance: cloneProvenance(issue.provenance) } : {}),
    ...(issue.metadata ? { metadata: { ...issue.metadata } } : {}),
  };
}

export function cloneRollbackStep(step: RollbackStep): RollbackStep {
  return {
    ...step,
    ...(step.metadata ? { metadata: { ...step.metadata } } : {}),
  };
}

export function cloneRollbackPlan(plan: RollbackPlan): RollbackPlan {
  return {
    ...plan,
    steps: plan.steps.map(cloneRollbackStep),
    ...(plan.metadata ? { metadata: { ...plan.metadata } } : {}),
  };
}

export function cloneProposalImpact(impact: ProposalImpact): ProposalImpact {
  return {
    ...impact,
    ...(impact.shardIds ? { shardIds: [...impact.shardIds] } : {}),
    ...(impact.zoneIds ? { zoneIds: [...impact.zoneIds] } : {}),
    ...(impact.questIds ? { questIds: [...impact.questIds] } : {}),
    ...(impact.metadata ? { metadata: { ...impact.metadata } } : {}),
  };
}

export function cloneStewardProposal(proposal: StewardProposal): StewardProposal {
  return {
    ...proposal,
    capabilities: [...proposal.capabilities],
    impact: proposal.impact.map(cloneProposalImpact),
    ...(proposal.rollback ? { rollback: cloneRollbackPlan(proposal.rollback) } : {}),
    ...(proposal.addressesIssueIds
      ? { addressesIssueIds: [...proposal.addressesIssueIds] }
      : {}),
    ...(proposal.approvedBy ? { approvedBy: [...proposal.approvedBy] } : {}),
    ...(proposal.provenance ? { provenance: cloneProvenance(proposal.provenance) } : {}),
    ...(proposal.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(proposal.verificationCommands) }
      : {}),
    ...(proposal.metadata ? { metadata: { ...proposal.metadata } } : {}),
  };
}

export function cloneStewardActionReceipt(
  receipt: StewardActionReceipt,
  cloneAction: (a: AgentActionReceipt) => AgentActionReceipt,
  cloneValidation: (v: ValidationReceipt) => ValidationReceipt,
): StewardActionReceipt {
  return {
    ...receipt,
    ...(receipt.agentActions
      ? { agentActions: receipt.agentActions.map(cloneAction) }
      : {}),
    ...(receipt.validationReceipts
      ? { validationReceipts: receipt.validationReceipts.map(cloneValidation) }
      : {}),
    ...(receipt.resolvedIssueIds
      ? { resolvedIssueIds: [...receipt.resolvedIssueIds] }
      : {}),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
