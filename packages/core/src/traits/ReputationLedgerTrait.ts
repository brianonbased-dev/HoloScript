/**
 * ReputationLedgerTrait
 *
 * Continuous trust plus a privacy-bounded behavior-fact log for HoloLand NPCs,
 * HoloMesh teammates, and service agents that share the same social substrate.
 *
 * Privacy is part of the trait contract:
 * - emit world-entry disclosure before behavior facts are stored
 * - retain only the last N behavior facts, default 20
 * - enforce per-world TTL, default 90 days
 * - expose self-serve deletion per NPC or globally
 * - emit service-observability events when expired rows are detected
 */

import type { AlertRule } from './ServiceObservabilityTrait';
import type { HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';
import { extractPayload } from './TraitTypes';

export const DEFAULT_REPUTATION_LEDGER_MAX_FACTS = 20;
export const DEFAULT_REPUTATION_LEDGER_TTL_DAYS = 90;
export const DEFAULT_BEHAVIOR_FACT_TTL_ALERT_RULE = 'behavior_fact_ttl_breach';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BehaviorLogDeletionScope = 'npc' | 'global';

export interface BehaviorFact {
  id: string;
  observerId: string;
  subjectId: string;
  action: string;
  vicinity: string;
  evidenceId?: string;
  occurredAt: number;
  recordedAt: number;
  expiresAt: number;
  trustDelta: number;
  metadata: Record<string, unknown>;
}

export interface BehaviorLogDeletionRecord {
  scope: BehaviorLogDeletionScope;
  observerId?: string;
  deletedCount: number;
  requestedBy?: string;
  at: number;
}

export interface ReputationLedgerConfig {
  /** World or room id that owns this ledger instance. */
  world_id: string;
  /** NPC, teammate, item, or service id whose reputation is being observed. */
  subject_id: string;
  /** Baseline trust score for a new observer, 0 to 100. */
  initial_trust: number;
  /** Sliding-window behavior-fact cap. Default: last 20 facts. */
  max_behavior_facts: number;
  /** Per-world retention TTL. Default: 90 days. */
  world_ttl_days: number;
  /** Emit disclosure on attach so the world-entry UI can show it. */
  emit_world_entry_disclosure: boolean;
  /** Override disclosure text. Empty string uses the generated default. */
  disclosure_text: string;
  /** Deletion scopes exposed to users. */
  deletion_modes: BehaviorLogDeletionScope[];
  /** ServiceObservability alert rule name for expired rows. */
  ttl_breach_alert_rule: string;
}

export interface ReputationLedgerState {
  trustByObserver: Map<string, number>;
  factsByObserver: Map<string, BehaviorFact[]>;
  deletions: BehaviorLogDeletionRecord[];
  disclosureText: string;
}

export interface ReputationLedgerSnapshot {
  subjectId: string;
  worldId: string;
  ttlDays: number;
  maxBehaviorFacts: number;
  observers: Array<{
    observerId: string;
    trust: number;
    behaviorFacts: BehaviorFact[];
  }>;
}

export function buildBehaviorFactDisclosure(
  maxActions = DEFAULT_REPUTATION_LEDGER_MAX_FACTS,
  ttlDays = DEFAULT_REPUTATION_LEDGER_TTL_DAYS
): string {
  return [
    `This NPC will remember your last ${maxActions} actions in their vicinity for up to ${ttlDays} days.`,
    'You can wipe this behavior log for this NPC or globally from privacy settings.',
  ].join(' ');
}

export function createBehaviorFactTtlAlertRule(
  ttlDays = DEFAULT_REPUTATION_LEDGER_TTL_DAYS,
  name = DEFAULT_BEHAVIOR_FACT_TTL_ALERT_RULE
): AlertRule {
  return {
    name,
    rule_type: 'data_retention',
    severity: 'critical',
    threshold: ttlDays,
    rule_config: {
      table: 'behavior_facts',
      condition: 'oldest_row_age_days >= world_ttl_days',
      ttl_days: ttlDays,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function createFactId(subjectId: string, observerId: string, occurredAt: number): string {
  return `bf_${subjectId}_${observerId}_${occurredAt}_${Math.random().toString(36).slice(2, 8)}`;
}

function effectiveMaxFacts(config: ReputationLedgerConfig): number {
  return Math.max(1, Math.floor(finiteNumber(config.max_behavior_facts, DEFAULT_REPUTATION_LEDGER_MAX_FACTS)));
}

function effectiveTtlDays(config: ReputationLedgerConfig): number {
  return Math.max(1, finiteNumber(config.world_ttl_days, DEFAULT_REPUTATION_LEDGER_TTL_DAYS));
}

function ttlMs(config: ReputationLedgerConfig): number {
  return effectiveTtlDays(config) * MS_PER_DAY;
}

function getState(node: HSPlusNode): ReputationLedgerState | undefined {
  return node.__reputationLedgerState as ReputationLedgerState | undefined;
}

function snapshotFor(
  state: ReputationLedgerState,
  config: ReputationLedgerConfig,
  observerId?: string
): ReputationLedgerSnapshot {
  const observerIds = observerId
    ? [observerId]
    : Array.from(new Set([...state.trustByObserver.keys(), ...state.factsByObserver.keys()]));

  return {
    subjectId: config.subject_id,
    worldId: config.world_id,
    ttlDays: effectiveTtlDays(config),
    maxBehaviorFacts: effectiveMaxFacts(config),
    observers: observerIds.map((id) => ({
      observerId: id,
      trust: state.trustByObserver.get(id) ?? clamp(config.initial_trust, 0, 100),
      behaviorFacts: [...(state.factsByObserver.get(id) ?? [])],
    })),
  };
}

function emitTtlBreach(
  context: TraitContext,
  node: HSPlusNode,
  config: ReputationLedgerConfig,
  expired: BehaviorFact[],
  now: number
): void {
  if (expired.length === 0) return;
  const oldestAgeDays = Math.max(...expired.map((fact) => (now - fact.occurredAt) / MS_PER_DAY));
  const payload = {
    node,
    service_name: 'reputation_ledger',
    rule: config.ttl_breach_alert_rule,
    rule_name: config.ttl_breach_alert_rule,
    subjectId: config.subject_id,
    worldId: config.world_id,
    expiredCount: expired.length,
    oldestAgeDays,
    ttlDays: effectiveTtlDays(config),
  };
  context.emit?.('behavior_fact_ttl_breach', payload);
  context.emit?.('metric_observed', {
    ...payload,
    value: oldestAgeDays,
  });
}

function pruneExpiredFacts(
  state: ReputationLedgerState,
  node: HSPlusNode,
  config: ReputationLedgerConfig,
  context: TraitContext,
  now = Date.now()
): number {
  const expired: BehaviorFact[] = [];
  let pruned = 0;

  for (const [observerId, facts] of state.factsByObserver) {
    const retained = facts.filter((fact) => {
      const keep = fact.expiresAt > now;
      if (!keep) expired.push(fact);
      return keep;
    });
    pruned += facts.length - retained.length;
    if (retained.length > 0) {
      state.factsByObserver.set(observerId, retained);
    } else {
      state.factsByObserver.delete(observerId);
    }
  }

  emitTtlBreach(context, node, config, expired, now);
  if (pruned > 0) {
    context.emit?.('behavior_fact_pruned', {
      node,
      subjectId: config.subject_id,
      worldId: config.world_id,
      pruned,
    });
  }
  return pruned;
}

function recordBehaviorFact(
  state: ReputationLedgerState,
  node: HSPlusNode,
  config: ReputationLedgerConfig,
  context: TraitContext,
  event: TraitEvent
): void {
  const payload = extractPayload(event);
  const now = Date.now();
  const observerId = String(payload.observerId ?? payload.playerId ?? payload.actorId ?? '');
  const action = String(payload.action ?? '');

  if (!observerId || !action) {
    context.emit?.('reputation_ledger_error', {
      node,
      code: 'behavior_fact_requires_observer_and_action',
    });
    return;
  }

  pruneExpiredFacts(state, node, config, context, now);

  const occurredAt = parseTimestamp(payload.occurredAt ?? payload.timestamp, now);
  const expiresAt = occurredAt + ttlMs(config);
  if (expiresAt <= now) {
    const rejected: BehaviorFact = {
      id: createFactId(config.subject_id, observerId, occurredAt),
      observerId,
      subjectId: config.subject_id,
      action,
      vicinity: String(payload.vicinity ?? 'unknown'),
      evidenceId: typeof payload.evidenceId === 'string' ? payload.evidenceId : undefined,
      occurredAt,
      recordedAt: now,
      expiresAt,
      trustDelta: finiteNumber(payload.trustDelta, 0),
      metadata: (payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {}) as Record<string, unknown>,
    };
    emitTtlBreach(context, node, config, [rejected], now);
    context.emit?.('behavior_fact_rejected', {
      node,
      reason: 'expired_before_record',
      fact: rejected,
    });
    return;
  }

  const trustDelta = finiteNumber(payload.trustDelta, 0);
  const currentTrust = state.trustByObserver.get(observerId) ?? clamp(config.initial_trust, 0, 100);
  const trust = clamp(currentTrust + trustDelta, 0, 100);
  state.trustByObserver.set(observerId, trust);

  const fact: BehaviorFact = {
    id: typeof payload.id === 'string' ? payload.id : createFactId(config.subject_id, observerId, occurredAt),
    observerId,
    subjectId: config.subject_id,
    action,
    vicinity: String(payload.vicinity ?? 'unknown'),
    evidenceId: typeof payload.evidenceId === 'string' ? payload.evidenceId : undefined,
    occurredAt,
    recordedAt: now,
    expiresAt,
    trustDelta,
    metadata: (payload.metadata && typeof payload.metadata === 'object'
      ? payload.metadata
      : {}) as Record<string, unknown>,
  };

  const facts = [...(state.factsByObserver.get(observerId) ?? []), fact]
    .filter((entry) => entry.expiresAt > now)
    .sort((a, b) => a.occurredAt - b.occurredAt)
    .slice(-effectiveMaxFacts(config));
  state.factsByObserver.set(observerId, facts);

  context.emit?.('reputation_behavior_fact_recorded', {
    node,
    fact,
    trust,
    retainedCount: facts.length,
  });
}

function deleteBehaviorLog(
  state: ReputationLedgerState,
  node: HSPlusNode,
  config: ReputationLedgerConfig,
  context: TraitContext,
  event: TraitEvent
): void {
  const payload = extractPayload(event);
  const requestedScope = payload.global === true ? 'global' : payload.scope;
  const scope = requestedScope === 'global' ? 'global' : 'npc';
  const observerId = String(payload.observerId ?? payload.playerId ?? '');

  if (!config.deletion_modes.includes(scope)) {
    context.emit?.('behavior_log_delete_failed', {
      node,
      reason: 'scope_not_allowed',
      scope,
    });
    return;
  }
  if (scope === 'npc' && !observerId) {
    context.emit?.('behavior_log_delete_failed', {
      node,
      reason: 'observer_required_for_npc_scope',
      scope,
    });
    return;
  }

  let deletedCount = 0;
  if (scope === 'global') {
    for (const facts of state.factsByObserver.values()) deletedCount += facts.length;
    state.factsByObserver.clear();
    state.trustByObserver.clear();
  } else {
    deletedCount = state.factsByObserver.get(observerId)?.length ?? 0;
    state.factsByObserver.delete(observerId);
    state.trustByObserver.delete(observerId);
  }

  const record: BehaviorLogDeletionRecord = {
    scope,
    ...(scope === 'npc' ? { observerId } : {}),
    deletedCount,
    requestedBy: typeof payload.requestedBy === 'string' ? payload.requestedBy : observerId || undefined,
    at: Date.now(),
  };
  state.deletions.push(record);

  context.emit?.('behavior_log_deleted', {
    node,
    subjectId: config.subject_id,
    worldId: config.world_id,
    ...record,
  });
}

export const reputationLedgerHandler: TraitHandler<ReputationLedgerConfig> = {
  name: 'reputation_ledger',

  defaultConfig: {
    world_id: '',
    subject_id: '',
    initial_trust: 50,
    max_behavior_facts: DEFAULT_REPUTATION_LEDGER_MAX_FACTS,
    world_ttl_days: DEFAULT_REPUTATION_LEDGER_TTL_DAYS,
    emit_world_entry_disclosure: true,
    disclosure_text: '',
    deletion_modes: ['npc', 'global'],
    ttl_breach_alert_rule: DEFAULT_BEHAVIOR_FACT_TTL_ALERT_RULE,
  },

  onAttach(node, config, context) {
    const disclosureText =
      config.disclosure_text ||
      buildBehaviorFactDisclosure(effectiveMaxFacts(config), effectiveTtlDays(config));
    const state: ReputationLedgerState = {
      trustByObserver: new Map(),
      factsByObserver: new Map(),
      deletions: [],
      disclosureText,
    };
    node.__reputationLedgerState = state;

    if (config.emit_world_entry_disclosure) {
      context.emit?.('world_entry_privacy_disclosure', {
        node,
        worldId: config.world_id,
        subjectId: config.subject_id,
        disclosure: disclosureText,
        maxBehaviorFacts: effectiveMaxFacts(config),
        ttlDays: effectiveTtlDays(config),
        deletionModes: [...config.deletion_modes],
      });
    }

    context.emit?.('reputation_ledger_ready', {
      node,
      worldId: config.world_id,
      subjectId: config.subject_id,
      alertRule: createBehaviorFactTtlAlertRule(
        effectiveTtlDays(config),
        config.ttl_breach_alert_rule
      ),
    });
  },

  onDetach(node) {
    delete node.__reputationLedgerState;
  },

  onUpdate(node, config, context) {
    const state = getState(node);
    if (!state) return;
    pruneExpiredFacts(state, node, config, context);
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    switch (event.type) {
      case 'reputation_observe_action':
      case 'reputation_behavior_fact':
        recordBehaviorFact(state, node, config, context, event);
        break;
      case 'reputation_delete_behavior_log':
      case 'behavior_log_delete':
        deleteBehaviorLog(state, node, config, context, event);
        break;
      case 'reputation_prune_expired':
        pruneExpiredFacts(state, node, config, context);
        break;
      case 'reputation_query': {
        const payload = extractPayload(event);
        const observerId = typeof payload.observerId === 'string' ? payload.observerId : undefined;
        context.emit?.('reputation_ledger_snapshot', {
          queryId: payload.queryId,
          node,
          ...snapshotFor(state, config, observerId),
        });
        break;
      }
      case 'reputation_disclosure_query':
        context.emit?.('world_entry_privacy_disclosure', {
          queryId: extractPayload(event).queryId,
          node,
          worldId: config.world_id,
          subjectId: config.subject_id,
          disclosure: state.disclosureText,
          maxBehaviorFacts: effectiveMaxFacts(config),
          ttlDays: effectiveTtlDays(config),
          deletionModes: [...config.deletion_modes],
        });
        break;
    }
  },
};

export default reputationLedgerHandler;
