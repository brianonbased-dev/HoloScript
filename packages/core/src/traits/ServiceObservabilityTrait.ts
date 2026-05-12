/**
 * Service Observability Trait
 *
 * Service-level observability contract: required-table schema validation at startup,
 * health-probe protocol against named dependencies, and alert-rule taxonomy.
 *
 * Lifted from uaa2-service runtime-observability stack
 * (migrations/006_runtime_observability.sql + StartupHealthCheck.validateSchema).
 *
 * Distinct from per-scene `alert` / `healthcheck` traits: this is the meta-trait a
 * service composition uses to declare "I need these tables, I probe these
 * dependencies, I publish these alert rules."
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export const SERVICE_ALERT_RULE_TYPES = [
  'error_rate',
  'response_time',
  'agent_count',
  'memory_usage',
  'cpu_usage',
  'api_quota',
  'data_retention',
  'custom',
] as const;

export type AlertRuleType = (typeof SERVICE_ALERT_RULE_TYPES)[number];

export type ServiceAlertSeverity = 'info' | 'warning' | 'critical';
export type HealthCheckKind = 'isInitialized' | 'method-exists' | 'health-check';
export type ServiceSubjectKind = 'npc' | 'headless_agent' | 'service' | 'custom';

export const DEFAULT_NPC_DAILY_COST_CEILING_USD = 0.5;
export const DEFAULT_HEADLESS_AGENT_DAILY_COST_CEILING_USD = 5;
export const DEFAULT_METRICS_RETENTION_DAYS = 90;
export const DEFAULT_ATTRIBUTION_CI_ACCURACY_FLOOR = 0.8;

export interface AlertRule {
  name: string;
  rule_type: AlertRuleType;
  severity: ServiceAlertSeverity;
  threshold: number;
  rule_config: Record<string, unknown>;
}

export interface HealthProbe {
  service: string;
  check: HealthCheckKind;
  method?: string;
}

export interface ScheduledMetricsCleanupJob {
  name: string;
  table: string;
  timestamp_column: string;
  retention_days: number;
  schedule: string;
  sql: string;
}

export interface OperationMetricRequirement {
  name: string;
  description: string;
  minimum: number;
  fail_ci_below: number;
  metadata: Record<string, unknown>;
}

export interface ServiceObservabilityConfig {
  service_name: string;
  required_tables: string[];
  health_probes: HealthProbe[];
  alert_rules: AlertRule[];
  scheduled_jobs: ScheduledMetricsCleanupJob[];
  operation_metrics: OperationMetricRequirement[];
  startup_validation: boolean;
  probe_interval_ms: number;
}

interface AlertTriggerRecord {
  rule_name: string;
  observed_value: number;
  threshold: number;
  severity: ServiceAlertSeverity;
  at: number;
  acknowledged: boolean;
}

interface ProbeResult {
  service: string;
  ok: boolean;
  reason?: string;
  at: number;
}

interface OperationMetricRecord {
  name: string;
  value: number;
  floor?: number;
  ciFailed: boolean;
  at: number;
}

interface ServiceObservabilityState {
  schemaValidated: boolean;
  missingTables: string[];
  lastProbeAt: number;
  probeResults: Map<string, ProbeResult>;
  triggers: AlertTriggerRecord[];
  rulesByName: Map<string, AlertRule>;
  operationMetrics: Map<string, OperationMetricRecord>;
  operationMetricRequirements: Map<string, OperationMetricRequirement>;
}

function evaluateRule(rule: AlertRule, value: number): boolean {
  // For numeric rule types: trigger when observed value exceeds the configured
  // threshold. `api_quota` is consumed-fraction (0..1) and uses the same shape.
  // `custom` defers — only triggers when caller asserts via alert_assert event.
  if (rule.rule_type === 'custom') return false;
  return value >= rule.threshold;
}

export function createApiQuotaAlertRule(
  subject: ServiceSubjectKind = 'npc',
  dailyCeilingUsd = subject === 'headless_agent'
    ? DEFAULT_HEADLESS_AGENT_DAILY_COST_CEILING_USD
    : DEFAULT_NPC_DAILY_COST_CEILING_USD,
  name = subject === 'headless_agent' ? 'headless_agent_daily_cost_ceiling' : 'npc_daily_cost_ceiling'
): AlertRule {
  return {
    name,
    rule_type: 'api_quota',
    severity: 'critical',
    threshold: dailyCeilingUsd,
    rule_config: {
      subject,
      unit: 'usd_per_day',
      ceiling_usd_per_day: dailyCeilingUsd,
    },
  };
}

export function createMetricsCleanupJob(
  retentionDays = DEFAULT_METRICS_RETENTION_DAYS,
  table = 'operation_metrics',
  timestampColumn = 'created_at'
): ScheduledMetricsCleanupJob {
  return {
    name: `${table}_cleanup_${retentionDays}d`,
    table,
    timestamp_column: timestampColumn,
    retention_days: retentionDays,
    schedule: 'daily',
    sql: `DELETE FROM ${table} WHERE ${timestampColumn} < NOW() - INTERVAL '${retentionDays} days';`,
  };
}

export function createAttributionCiOperationMetric(
  floor = DEFAULT_ATTRIBUTION_CI_ACCURACY_FLOOR
): OperationMetricRequirement {
  return {
    name: 'attribution_ci_accuracy',
    description: 'CI attribution accuracy gate; build fails when the observed metric is below this floor.',
    minimum: floor,
    fail_ci_below: floor,
    metadata: {
      unit: 'ratio',
      ci_gate: true,
    },
  };
}

function finiteMetric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// =============================================================================
// HANDLER
// =============================================================================

export const serviceObservabilityHandler: TraitHandler<ServiceObservabilityConfig> = {
  name: 'service_observability',

  defaultConfig: {
    service_name: '',
    required_tables: ['system_metrics', 'operation_metrics', 'alerts', 'alert_triggers', 'error_logs'],
    health_probes: [],
    alert_rules: [],
    scheduled_jobs: [createMetricsCleanupJob()],
    operation_metrics: [createAttributionCiOperationMetric()],
    startup_validation: true,
    probe_interval_ms: 30000,
  },

  onAttach(node, config, context) {
    const state: ServiceObservabilityState = {
      schemaValidated: false,
      missingTables: [],
      lastProbeAt: 0,
      probeResults: new Map(),
      triggers: [],
      rulesByName: new Map(config.alert_rules.map((r) => [r.name, r])),
      operationMetrics: new Map(),
      operationMetricRequirements: new Map(config.operation_metrics.map((m) => [m.name, m])),
    };
    node.__serviceObservabilityState = state;

    if (config.startup_validation) {
      context.emit?.('service_schema_validate_request', {
        node,
        service_name: config.service_name,
        required_tables: config.required_tables,
      });
    }
  },

  onDetach(node, _config, context) {
    const state = node.__serviceObservabilityState as ServiceObservabilityState | undefined;
    if (state && state.triggers.length > 0) {
      context.emit?.('service_observability_drained', {
        node,
        outstanding_triggers: state.triggers.length,
      });
    }
    delete node.__serviceObservabilityState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__serviceObservabilityState as ServiceObservabilityState | undefined;
    if (!state) return;

    const now = Date.now();
    if (now - state.lastProbeAt < config.probe_interval_ms) return;
    state.lastProbeAt = now;

    if (config.health_probes.length === 0) return;

    context.emit?.('service_health_probe_request', {
      node,
      service_name: config.service_name,
      probes: config.health_probes,
      at: now,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__serviceObservabilityState as ServiceObservabilityState | undefined;
    if (!state) return;

    if (event.type === 'service_schema_validate_result') {
      const missing = (event.missing as string[]) ?? [];
      state.schemaValidated = missing.length === 0;
      state.missingTables = missing;

      if (state.schemaValidated) {
        context.emit?.('service_ready', { node, service_name: config.service_name });
      } else {
        context.emit?.('service_schema_failed', {
          node,
          service_name: config.service_name,
          missing,
        });
      }
      return;
    }

    if (event.type === 'service_health_probe_result') {
      const results = (event.results as ProbeResult[]) ?? [];
      for (const r of results) state.probeResults.set(r.service, r);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        context.emit?.('service_health_degraded', {
          node,
          service_name: config.service_name,
          failed,
        });
      } else {
        context.emit?.('service_health_ok', { node, service_name: config.service_name });
      }
      return;
    }

    if (event.type === 'metric_observed') {
      const ruleName = event.rule as string;
      const value = event.value as number;
      const rule = state.rulesByName.get(ruleName);
      if (!rule) return;

      if (evaluateRule(rule, value)) {
        const trigger: AlertTriggerRecord = {
          rule_name: rule.name,
          observed_value: value,
          threshold: rule.threshold,
          severity: rule.severity,
          at: Date.now(),
          acknowledged: false,
        };
        state.triggers.push(trigger);
        context.emit?.('alert_rule_triggered', {
          node,
          service_name: config.service_name,
          ...trigger,
        });
      }
      return;
    }

    if (event.type === 'operation_metric') {
      const metricName = String(event.metric ?? event.name ?? event.operation ?? '');
      const value = finiteMetric(event.value);
      if (!metricName || value === null) return;

      const requirement = state.operationMetricRequirements.get(metricName);
      const explicitFloor = finiteMetric(event.minimum ?? event.floor ?? event.fail_ci_below);
      const floor = explicitFloor ?? requirement?.fail_ci_below;
      const ciFailed = typeof floor === 'number' && value < floor;
      const record: OperationMetricRecord = {
        name: metricName,
        value,
        ...(typeof floor === 'number' ? { floor } : {}),
        ciFailed,
        at: Date.now(),
      };
      state.operationMetrics.set(metricName, record);

      context.emit?.('operation_metric_recorded', {
        node,
        service_name: config.service_name,
        ...record,
      });

      if (ciFailed) {
        context.emit?.('operation_metric_floor_failed', {
          node,
          service_name: config.service_name,
          ...record,
        });
      }
      return;
    }

    if (event.type === 'alert_assert') {
      const ruleName = event.rule as string;
      const rule = state.rulesByName.get(ruleName);
      if (!rule) return;
      const trigger: AlertTriggerRecord = {
        rule_name: rule.name,
        observed_value: (event.value as number) ?? 1,
        threshold: rule.threshold,
        severity: rule.severity,
        at: Date.now(),
        acknowledged: false,
      };
      state.triggers.push(trigger);
      context.emit?.('alert_rule_triggered', {
        node,
        service_name: config.service_name,
        ...trigger,
      });
      return;
    }

    if (event.type === 'alert_acknowledge') {
      const ruleName = event.rule as string;
      const trigger = state.triggers.find((t) => t.rule_name === ruleName && !t.acknowledged);
      if (trigger) {
        trigger.acknowledged = true;
        context.emit?.('alert_acknowledged', {
          node,
          service_name: config.service_name,
          rule_name: ruleName,
        });
      }
      return;
    }

    if (event.type === 'service_observability_query') {
      context.emit?.('service_observability_status', {
        queryId: event.queryId,
        node,
        service_name: config.service_name,
        schemaValidated: state.schemaValidated,
        missingTables: state.missingTables,
        probeResults: Array.from(state.probeResults.values()),
        activeTriggers: state.triggers.filter((t) => !t.acknowledged),
        scheduledJobs: config.scheduled_jobs,
        operationMetrics: Array.from(state.operationMetrics.values()),
      });
      return;
    }
  },
};

export default serviceObservabilityHandler;
