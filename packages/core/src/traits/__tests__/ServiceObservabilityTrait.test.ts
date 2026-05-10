import { describe, it, expect, beforeEach } from 'vitest';
import { serviceObservabilityHandler } from '../ServiceObservabilityTrait';
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
});
