import { describe, expect, it } from 'vitest';

import { handleObservabilityTool, observabilityTools } from '../observability-tools';
import { handleTool } from '../handlers';

describe('holo_service_scaffold', () => {
  it('is registered in the public observability tool list', () => {
    expect(observabilityTools.some((tool) => tool.name === 'holo_service_scaffold')).toBe(true);
  });

  it('emits SQL, StartupHealthCheck wiring, cleanup, quota alerts, and attribution metric scaffolding', async () => {
    const result = (await handleObservabilityTool('holo_service_scaffold', {
      serviceName: 'slf_npc_runtime',
      requiredTables: ['system_metrics', 'operation_metrics', 'alerts', 'alert_triggers', 'behavior_facts'],
      healthChecks: [{ service: 'CostGovernor', check: 'method-exists', method: 'enforceBudget' }],
      alertRules: [{ name: 'runtime_error_rate', rule_type: 'error_rate', severity: 'warning', threshold: 0.05, rule_config: {} }],
    })) as {
      sql: string;
      startupHealthCheck: string;
      hsplusTraitSnippet: string;
      alertRules: Array<{ name: string; threshold: number; rule_type: string }>;
      scheduledJobs: Array<{ retention_days: number; sql: string }>;
      operationMetrics: Array<{ name: string; fail_ci_below: number }>;
    };

    expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS operation_metrics');
    expect(result.sql).toContain("INTERVAL '90 days'");
    expect(result.sql).toContain("rule_type IN ('error_rate', 'response_time'");
    expect(result.sql).toContain("'api_quota'");
    expect(result.startupHealthCheck).toContain('StartupHealthCheck');
    expect(result.startupHealthCheck).toContain('CostGovernor');
    expect(result.hsplusTraitSnippet).toContain('@serviceObservability');
    expect(result.alertRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'npc_daily_cost_ceiling', rule_type: 'api_quota', threshold: 0.5 }),
        expect.objectContaining({ name: 'headless_agent_daily_cost_ceiling', rule_type: 'api_quota', threshold: 5 }),
      ])
    );
    expect(result.scheduledJobs[0].retention_days).toBe(90);
    expect(result.operationMetrics[0]).toMatchObject({
      name: 'attribution_ci_accuracy',
      fail_ci_below: 0.8,
    });
  });

  it('routes through the central handler dispatch', async () => {
    const result = (await handleTool('holo_service_scaffold', {
      composition: `
        service RuntimeObservability {
          @serviceObservability({
            service_name: 'runtime_observability',
            required_tables: ['system_metrics', 'operation_metrics']
          })
        }
      `,
    })) as { serviceName: string; requiredTables: string[] };

    expect(result.serviceName).toBe('runtime_observability');
    expect(result.requiredTables).toEqual(['system_metrics', 'operation_metrics']);
  });
});
