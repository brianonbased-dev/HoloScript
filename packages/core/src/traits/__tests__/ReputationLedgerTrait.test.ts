import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildBehaviorFactDisclosure,
  createBehaviorFactTtlAlertRule,
  DEFAULT_REPUTATION_LEDGER_TTL_DAYS,
  reputationLedgerHandler,
} from '../ReputationLedgerTrait';
import { serviceObservabilityHandler } from '../ServiceObservabilityTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getEventCount,
  getLastEvent,
  sendEvent,
  updateTrait,
} from './traitTestHelpers';

describe('ReputationLedgerTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const config = {
    world_id: 'world_oasis',
    subject_id: 'npc_bilac',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00.000Z'));
    node = createMockNode('npc_bilac');
    ctx = createMockContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the required world-entry disclosure on attach', () => {
    attachTrait(reputationLedgerHandler, node, config, ctx);

    const disclosure = getLastEvent(ctx, 'world_entry_privacy_disclosure') as {
      disclosure: string;
      maxBehaviorFacts: number;
      ttlDays: number;
      deletionModes: string[];
    };
    expect(disclosure.disclosure).toContain(
      'This NPC will remember your last 20 actions in their vicinity for up to 90 days.'
    );
    expect(disclosure.maxBehaviorFacts).toBe(20);
    expect(disclosure.ttlDays).toBe(DEFAULT_REPUTATION_LEDGER_TTL_DAYS);
    expect(disclosure.deletionModes).toEqual(['npc', 'global']);
  });

  it('stores only the latest behavior facts and updates trust continuously', () => {
    attachTrait(reputationLedgerHandler, node, { ...config, max_behavior_facts: 2 }, ctx);

    for (let i = 0; i < 3; i++) {
      sendEvent(reputationLedgerHandler, node, { ...config, max_behavior_facts: 2 }, ctx, {
        type: 'reputation_observe_action',
        observerId: 'player_sunraku',
        action: `helped-blacksmith-${i}`,
        vicinity: 'forge',
        trustDelta: 5,
        occurredAt: Date.now() + i,
      });
    }
    sendEvent(reputationLedgerHandler, node, { ...config, max_behavior_facts: 2 }, ctx, {
      type: 'reputation_query',
      observerId: 'player_sunraku',
      queryId: 'q1',
    });

    const snapshot = getLastEvent(ctx, 'reputation_ledger_snapshot') as {
      observers: Array<{ trust: number; behaviorFacts: Array<{ action: string }> }>;
    };
    expect(snapshot.observers[0].trust).toBe(65);
    expect(snapshot.observers[0].behaviorFacts.map((fact) => fact.action)).toEqual([
      'helped-blacksmith-1',
      'helped-blacksmith-2',
    ]);
  });

  it('supports self-serve per-NPC deletion', () => {
    attachTrait(reputationLedgerHandler, node, config, ctx);
    sendEvent(reputationLedgerHandler, node, config, ctx, {
      type: 'reputation_observe_action',
      observerId: 'player_sunraku',
      action: 'traded-rare-ingot',
      trustDelta: 7,
    });
    sendEvent(reputationLedgerHandler, node, config, ctx, {
      type: 'reputation_delete_behavior_log',
      observerId: 'player_sunraku',
      scope: 'npc',
      requestedBy: 'player_sunraku',
    });
    sendEvent(reputationLedgerHandler, node, config, ctx, {
      type: 'reputation_query',
      observerId: 'player_sunraku',
    });

    const deletion = getLastEvent(ctx, 'behavior_log_deleted') as { scope: string; deletedCount: number };
    const snapshot = getLastEvent(ctx, 'reputation_ledger_snapshot') as {
      observers: Array<{ trust: number; behaviorFacts: unknown[] }>;
    };
    expect(deletion.scope).toBe('npc');
    expect(deletion.deletedCount).toBe(1);
    expect(snapshot.observers[0].trust).toBe(50);
    expect(snapshot.observers[0].behaviorFacts).toEqual([]);
  });

  it('supports global deletion across observers', () => {
    attachTrait(reputationLedgerHandler, node, config, ctx);
    for (const observerId of ['player_a', 'player_b']) {
      sendEvent(reputationLedgerHandler, node, config, ctx, {
        type: 'reputation_observe_action',
        observerId,
        action: 'entered-forge',
      });
    }
    sendEvent(reputationLedgerHandler, node, config, ctx, {
      type: 'reputation_delete_behavior_log',
      scope: 'global',
      requestedBy: 'player_a',
    });

    const deletion = getLastEvent(ctx, 'behavior_log_deleted') as { scope: string; deletedCount: number };
    expect(deletion.scope).toBe('global');
    expect(deletion.deletedCount).toBe(2);
  });

  it('rejects already-expired facts and emits a retention alert signal', () => {
    attachTrait(reputationLedgerHandler, node, config, ctx);
    sendEvent(reputationLedgerHandler, node, config, ctx, {
      type: 'reputation_observe_action',
      observerId: 'player_sunraku',
      action: 'old-action',
      occurredAt: Date.now() - 91 * 24 * 60 * 60 * 1000,
    });

    expect(getEventCount(ctx, 'behavior_fact_rejected')).toBe(1);
    expect(getEventCount(ctx, 'behavior_fact_ttl_breach')).toBe(1);
    expect(getEventCount(ctx, 'metric_observed')).toBe(1);
  });

  it('prunes expired rows and emits the observability metric on update', () => {
    attachTrait(reputationLedgerHandler, node, config, ctx);
    sendEvent(reputationLedgerHandler, node, config, ctx, {
      type: 'reputation_observe_action',
      observerId: 'player_sunraku',
      action: 'met-npc',
      occurredAt: Date.now(),
    });

    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'));
    updateTrait(reputationLedgerHandler, node, config, ctx, 1);

    expect(getEventCount(ctx, 'behavior_fact_pruned')).toBe(1);
    const metric = getLastEvent(ctx, 'metric_observed') as { rule: string; value: number };
    expect(metric.rule).toBe('behavior_fact_ttl_breach');
    expect(metric.value).toBeGreaterThan(90);
  });

  it('provides a ServiceObservability retention rule helper', () => {
    const rule = createBehaviorFactTtlAlertRule();
    expect(rule.rule_type).toBe('data_retention');
    expect(rule.threshold).toBe(90);
    expect(rule.rule_config.table).toBe('behavior_facts');
  });

  it('uses a disclosure builder with per-world TTL values', () => {
    expect(buildBehaviorFactDisclosure(12, 30)).toContain('last 12 actions');
    expect(buildBehaviorFactDisclosure(12, 30)).toContain('up to 30 days');
  });
});

describe('ServiceObservabilityTrait data_retention alerts', () => {
  it('triggers when a behavior-fact row age crosses the TTL threshold', () => {
    const node = createMockNode('svc-reputation');
    const ctx = createMockContext();
    const config = {
      service_name: 'reputation_ledger',
      alert_rules: [createBehaviorFactTtlAlertRule()],
    };

    attachTrait(serviceObservabilityHandler, node, config, ctx);
    sendEvent(serviceObservabilityHandler, node, config, ctx, {
      type: 'metric_observed',
      rule: 'behavior_fact_ttl_breach',
      value: 91,
    });

    const alert = getLastEvent(ctx, 'alert_rule_triggered') as { rule_name: string; severity: string };
    expect(alert.rule_name).toBe('behavior_fact_ttl_breach');
    expect(alert.severity).toBe('critical');
  });
});
