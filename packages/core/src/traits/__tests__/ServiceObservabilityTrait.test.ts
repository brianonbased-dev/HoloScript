import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_ATTRIBUTION_CI_ACCURACY_FLOOR,
  DEFAULT_HEADLESS_AGENT_DAILY_COST_CEILING_USD,
  DEFAULT_METRICS_RETENTION_DAYS,
  DEFAULT_NPC_DAILY_COST_CEILING_USD,
  SERVICE_ALERT_RULE_TYPES,
  createApiQuotaAlertRule,
  createAttributionCiOperationMetric,
  createMetricsCleanupJob,
  serviceObservabilityHandler,
} from '../ServiceObservabilityTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('ServiceObservabilityTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('svc-1');
    ctx = createMockContext();
  });

  it('emits service_ready when schema validation reports no missing tables', () => {
    attachTrait(serviceObservabilityHandler, node, { service_name: 'svc-a' }, ctx);
    sendEvent(serviceObservabilityHandler, node, { service_name: 'svc-a' }, ctx, {
      type: 'service_schema_validate_result',
      missing: [],
    });
    expect(getEventCount(ctx, 'service_ready')).toBe(1);
    expect(getEventCount(ctx, 'service_schema_failed')).toBe(0);
  });

  it('emits service_schema_failed when tables are missing (false-case)', () => {
    attachTrait(serviceObservabilityHandler, node, { service_name: 'svc-b' }, ctx);
    sendEvent(serviceObservabilityHandler, node, { service_name: 'svc-b' }, ctx, {
      type: 'service_schema_validate_result',
      missing: ['alerts', 'operation_metrics'],
    });
    expect(getEventCount(ctx, 'service_ready')).toBe(0);
    expect(getEventCount(ctx, 'service_schema_failed')).toBe(1);
    const e = getLastEvent(ctx, 'service_schema_failed') as { missing: string[] };
    expect(e.missing).toEqual(['alerts', 'operation_metrics']);
  });

  it('does NOT trigger alert when observed value stays below threshold (false-case)', () => {
    const config = {
      service_name: 'svc-c',
      alert_rules: [
        { name: 'high_error_rate', rule_type: 'error_rate' as const, severity: 'warning' as const, threshold: 0.1, rule_config: {} },
      ],
    };
    attachTrait(serviceObservabilityHandler, node, config, ctx);
    sendEvent(serviceObservabilityHandler, node, config, ctx, {
      type: 'metric_observed',
      rule: 'high_error_rate',
      value: 0.05,
    });
    expect(getEventCount(ctx, 'alert_rule_triggered')).toBe(0);
  });

  it('triggers alert when observed value crosses threshold', () => {
    const config = {
      service_name: 'svc-d',
      alert_rules: [
        { name: 'cpu_hot', rule_type: 'cpu_usage' as const, severity: 'critical' as const, threshold: 0.8, rule_config: {} },
      ],
    };
    attachTrait(serviceObservabilityHandler, node, config, ctx);
    sendEvent(serviceObservabilityHandler, node, config, ctx, {
      type: 'metric_observed',
      rule: 'cpu_hot',
      value: 0.92,
    });
    expect(getEventCount(ctx, 'alert_rule_triggered')).toBe(1);
    const t = getLastEvent(ctx, 'alert_rule_triggered') as { rule_name: string; severity: string };
    expect(t.rule_name).toBe('cpu_hot');
    expect(t.severity).toBe('critical');
  });

  it('provides api_quota cost-ceiling rules for NPCs and headless agents', () => {
    const npcRule = createApiQuotaAlertRule('npc');
    const agentRule = createApiQuotaAlertRule('headless_agent');

    expect(SERVICE_ALERT_RULE_TYPES).toContain('api_quota');
    expect(SERVICE_ALERT_RULE_TYPES).toContain('custom');
    expect(npcRule.rule_type).toBe('api_quota');
    expect(npcRule.threshold).toBe(DEFAULT_NPC_DAILY_COST_CEILING_USD);
    expect(agentRule.threshold).toBe(DEFAULT_HEADLESS_AGENT_DAILY_COST_CEILING_USD);
  });

  it('triggers the default NPC api_quota alert when cost exceeds $0.50/day', () => {
    const config = {
      service_name: 'svc-cost',
      alert_rules: [createApiQuotaAlertRule('npc')],
    };
    attachTrait(serviceObservabilityHandler, node, config, ctx);
    sendEvent(serviceObservabilityHandler, node, config, ctx, {
      type: 'metric_observed',
      rule: 'npc_daily_cost_ceiling',
      value: 0.51,
    });
    const alert = getLastEvent(ctx, 'alert_rule_triggered') as { rule_name: string; threshold: number };
    expect(alert.rule_name).toBe('npc_daily_cost_ceiling');
    expect(alert.threshold).toBe(DEFAULT_NPC_DAILY_COST_CEILING_USD);
  });

  it('declares the 90-day scheduled operation-metrics cleanup job', () => {
    const job = createMetricsCleanupJob();

    expect(job.retention_days).toBe(DEFAULT_METRICS_RETENTION_DAYS);
    expect(job.sql).toContain("INTERVAL '90 days'");
    expect(job.sql).toContain('operation_metrics');
  });

  it('emits an operation_metric CI floor failure below 80 percent attribution accuracy', () => {
    const config = {
      service_name: 'svc-ci',
      operation_metrics: [createAttributionCiOperationMetric()],
    };
    attachTrait(serviceObservabilityHandler, node, config, ctx);
    sendEvent(serviceObservabilityHandler, node, config, ctx, {
      type: 'operation_metric',
      metric: 'attribution_ci_accuracy',
      value: 0.79,
    });

    expect(getEventCount(ctx, 'operation_metric_recorded')).toBe(1);
    expect(getEventCount(ctx, 'operation_metric_floor_failed')).toBe(1);
    const failure = getLastEvent(ctx, 'operation_metric_floor_failed') as { floor: number };
    expect(failure.floor).toBe(DEFAULT_ATTRIBUTION_CI_ACCURACY_FLOOR);
  });
});
