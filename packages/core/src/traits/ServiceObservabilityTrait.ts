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

export type AlertRuleType =
  | 'error_rate'
  | 'response_time'
  | 'agent_count'
  | 'memory_usage'
  | 'cpu_usage'
  | 'api_quota'
  | 'data_retention'
  | 'custom';

export type ServiceAlertSeverity = 'info' | 'warning' | 'critical';
export type HealthCheckKind = 'isInitialized' | 'method-exists' | 'health-check';

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

export interface ServiceObservabilityConfig {
  service_name: string;
  required_tables: string[];
  health_probes: HealthProbe[];
  alert_rules: AlertRule[];
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

interface ServiceObservabilityState {
  schemaValidated: boolean;
  missingTables: string[];
  lastProbeAt: number;
  probeResults: Map<string, ProbeResult>;
  triggers: AlertTriggerRecord[];
  rulesByName: Map<string, AlertRule>;
}

function evaluateRule(rule: AlertRule, value: number): boolean {
  // For numeric rule types: trigger when observed value exceeds the configured
  // threshold. `api_quota` is consumed-fraction (0..1) and uses the same shape.
  // `custom` defers — only triggers when caller asserts via alert_assert event.
  if (rule.rule_type === 'custom') return false;
  return value >= rule.threshold;
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
      });
      return;
    }
  },
};

export default serviceObservabilityHandler;
