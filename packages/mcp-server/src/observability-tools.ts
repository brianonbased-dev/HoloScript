/**
 * @holoscript/mcp-server — Observability MCP Tools
 *
 * 4 tools for querying traces, exporting OTLP, agent health, and Prometheus metrics.
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDefaultRegistry } from '@holoscript/framework/agents';
import { getTelemetryCollector, getPrometheusMetrics, OTLPExporter } from '@holoscript/core';
import type { OTLPExporterConfig } from '@holoscript/core';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const observabilityTools: Tool[] = [
  {
    name: 'query_traces',
    description: 'Query distributed trace spans by traceId, agent, or time range. Returns OTel-format spans for debugging agent orchestration.',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: 'Filter by trace ID',
        },
        agentId: {
          type: 'string',
          description: 'Filter by agent ID',
        },
        limit: {
          type: 'number',
          description: 'Max spans to return (default 50)',
        },
      },
    },
  },
  {
    name: 'export_traces_otlp',
    description: 'Export collected trace spans to an OTLP/HTTP endpoint. Requires an endpoint URL. Returns export result with span count and status.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description: 'OTLP/HTTP endpoint URL (e.g. http://localhost:4318/v1/traces)',
        },
        serviceName: {
          type: 'string',
          description: 'Service name for resource attributes (default: holoscript)',
        },
      },
      required: ['endpoint'],
    },
  },
  {
    name: 'get_agent_health',
    description: 'Get health status of registered agents including count, status breakdown, and telemetry stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_metrics_prometheus',
    description: 'Get all collected metrics in Prometheus exposition text format. Use for monitoring dashboards and alerting.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: {
          type: 'string',
          description: 'Metric prefix filter (default: holoscript)',
        },
      },
    },
  },
  {
    name: 'holo_service_scaffold',
    description: 'Generate service observability SQL, StartupHealthCheck wiring, alert seeds, cleanup job, and @serviceObservability snippet from a .hsplus service composition or structured service config.',
    inputSchema: {
      type: 'object',
      properties: {
        composition: {
          type: 'string',
          description: 'Optional .hsplus service composition containing @serviceObservability fields.',
        },
        serviceName: {
          type: 'string',
          description: 'Service name. Overrides service_name parsed from composition.',
        },
        requiredTables: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required runtime tables for startup schema validation.',
        },
        healthChecks: {
          type: 'array',
          description: 'Startup health probes, e.g. [{service:"CostGovernor",check:"method-exists",method:"enforceBudget"}].',
          items: { type: 'object' },
        },
        alertRules: {
          type: 'array',
          description: 'Alert rules to seed into the alerts table.',
          items: { type: 'object' },
        },
        retentionDays: {
          type: 'number',
          description: 'Retention window for scheduled operation_metrics cleanup. Default 90.',
        },
        npcCostCeilingUsdPerDay: {
          type: 'number',
          description: 'Default api_quota ceiling for NPC runtime cost. Default 0.50.',
        },
        headlessAgentCostCeilingUsdPerDay: {
          type: 'number',
          description: 'Default api_quota ceiling for headless agents. Default 5.00.',
        },
        attributionAccuracyFloor: {
          type: 'number',
          description: 'CI attribution accuracy floor. Default 0.80.',
        },
      },
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleObservabilityTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'query_traces':
      return handleQueryTraces(args);
    case 'export_traces_otlp':
      return handleExportTracesOtlp(args);
    case 'get_agent_health':
      return handleGetAgentHealth();
    case 'get_metrics_prometheus':
      return handleGetMetricsPrometheus(args);
    case 'holo_service_scaffold':
      return handleHoloServiceScaffold(args);
    default:
      throw new Error(`Unknown observability tool: ${name}`);
  }
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

function handleQueryTraces(args: Record<string, unknown>) {
  const collector = getTelemetryCollector();
  const traceId = args.traceId as string | undefined;
  const agentId = args.agentId as string | undefined;
  const limit = (args.limit as number) ?? 50;

  if (traceId) {
    const spans = collector.getTraceSpans(traceId);
    const otelSpans = collector.exportToOTel().filter((s: any) => s.traceId === traceId);
    return {
      traceId,
      spans: otelSpans.slice(0, limit),
      totalSpans: spans.length,
    };
  }

  // Export all completed spans
  let otelSpans = collector.exportToOTel();

  // Filter by agent if specified
  if (agentId) {
    otelSpans = otelSpans.filter((s: any) =>
      s.attributes.some((a: any) => a.key === 'agent.id' && a.value.stringValue === agentId)
    );
  }

  return {
    spans: otelSpans.slice(0, limit),
    totalSpans: otelSpans.length,
    stats: collector.getStats(),
  };
}

async function handleExportTracesOtlp(args: Record<string, unknown>) {
  const endpoint = args.endpoint as string;
  const serviceName = (args.serviceName as string) ?? 'holoscript';

  if (!endpoint) {
    throw new Error('endpoint is required for OTLP export');
  }

  const collector = getTelemetryCollector();
  const spans = collector.exportToOTel();

  if (spans.length === 0) {
    return {
      success: true,
      spanCount: 0,
      message: 'No completed spans to export',
    };
  }

  const exporterConfig: OTLPExporterConfig = {
    endpoint,
    serviceName,
    compression: false, // Avoid gzip dependency issues in MCP context
    maxRetries: 2,
    retryDelayMs: 500,
  };

  const exporter = new (OTLPExporter as any)(exporterConfig);
  const result = await exporter.exportBatch(spans);

  return {
    success: result.success,
    spanCount: result.spanCount,
    retries: result.retries,
    durationMs: result.durationMs,
    error: result.error,
  };
}

function handleGetAgentHealth() {
  const collector = getTelemetryCollector();
  const stats = collector.getStats();

  let agents: Array<{ id: string; name: string; status: string }> = [];
  let registrySize = 0;

  try {
    const registry = getDefaultRegistry();
    const allAgents = registry.getAllManifests();
    registrySize = allAgents.length;
    agents = allAgents.map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
    }));
  } catch {
    // Registry not initialized
  }

  const statusBreakdown: Record<string, number> = {};
  for (const agent of agents) {
    statusBreakdown[agent.status] = (statusBreakdown[agent.status] ?? 0) + 1;
  }

  return {
    registrySize,
    agents,
    statusBreakdown,
    telemetry: {
      totalEvents: stats.totalEvents,
      totalSpans: stats.totalSpans,
      activeSpans: stats.activeSpans,
      droppedEvents: stats.droppedEvents,
      avgLatency: stats.avgLatency,
      uptime: Date.now() - stats.startTime,
    },
  };
}

function handleGetMetricsPrometheus(args: Record<string, unknown>) {
  const prefix = (args.prefix as string) ?? 'holoscript';
  const registry = getPrometheusMetrics(prefix);
  const text = registry.toPrometheusText();
  const names = registry.getMetricNames();

  return {
    format: 'prometheus',
    metricCount: names.length,
    metricNames: names,
    text,
  };
}

type ScaffoldAlertRule = {
  name: string;
  rule_type: string;
  severity: 'info' | 'warning' | 'critical';
  threshold: number;
  rule_config: Record<string, unknown>;
};

type ScaffoldHealthCheck = {
  service: string;
  check: string;
  method?: string;
};

const DEFAULT_REQUIRED_TABLES = ['system_metrics', 'operation_metrics', 'alerts', 'alert_triggers', 'error_logs'];
const DEFAULT_NPC_COST_CEILING = 0.5;
const DEFAULT_HEADLESS_AGENT_COST_CEILING = 5;
const DEFAULT_ATTRIBUTION_FLOOR = 0.8;
const DEFAULT_RETENTION_DAYS = 90;
const SCAFFOLD_ALERT_RULE_TYPES = [
  'error_rate',
  'response_time',
  'agent_count',
  'memory_usage',
  'cpu_usage',
  'api_quota',
  'data_retention',
  'custom',
];

function handleHoloServiceScaffold(args: Record<string, unknown>) {
  const composition = typeof args.composition === 'string' ? args.composition : '';
  const parsed = parseServiceComposition(composition);
  const serviceName = stringArg(args.serviceName) || parsed.serviceName || 'holoscript_service';
  const requiredTables = stringArrayArg(args.requiredTables) ?? parsed.requiredTables ?? DEFAULT_REQUIRED_TABLES;
  const healthChecks = objectArrayArg<ScaffoldHealthCheck>(args.healthChecks) ?? parsed.healthChecks ?? [];
  const retentionDays = numberArg(args.retentionDays) ?? DEFAULT_RETENTION_DAYS;
  const npcCostCeiling = numberArg(args.npcCostCeilingUsdPerDay) ?? DEFAULT_NPC_COST_CEILING;
  const headlessAgentCostCeiling =
    numberArg(args.headlessAgentCostCeilingUsdPerDay) ?? DEFAULT_HEADLESS_AGENT_COST_CEILING;
  const attributionFloor = numberArg(args.attributionAccuracyFloor) ?? DEFAULT_ATTRIBUTION_FLOOR;
  const alertRules = [
    createApiQuotaSeed('npc_daily_cost_ceiling', 'npc', npcCostCeiling),
    createApiQuotaSeed('headless_agent_daily_cost_ceiling', 'headless_agent', headlessAgentCostCeiling),
    ...(objectArrayArg<ScaffoldAlertRule>(args.alertRules) ?? parsed.alertRules ?? []),
  ];
  const operationMetric = {
    name: 'attribution_ci_accuracy',
    minimum: attributionFloor,
    fail_ci_below: attributionFloor,
    metadata: { unit: 'ratio', ci_gate: true },
  };
  const cleanupJob = {
    name: `operation_metrics_cleanup_${retentionDays}d`,
    table: 'operation_metrics',
    timestamp_column: 'created_at',
    retention_days: retentionDays,
    schedule: 'daily',
    sql: `DELETE FROM operation_metrics WHERE created_at < NOW() - INTERVAL '${retentionDays} days';`,
  };

  return {
    serviceName,
    requiredTables,
    healthChecks,
    alertRules,
    scheduledJobs: [cleanupJob],
    operationMetrics: [operationMetric],
    sql: renderServiceSql(requiredTables, alertRules, cleanupJob.sql),
    startupHealthCheck: renderStartupHealthCheck(serviceName, requiredTables, healthChecks),
    hsplusTraitSnippet: renderHsplusTrait(serviceName, requiredTables, healthChecks, alertRules, cleanupJob, operationMetric),
  };
}

function parseServiceComposition(composition: string): {
  serviceName?: string;
  requiredTables?: string[];
  healthChecks?: ScaffoldHealthCheck[];
  alertRules?: ScaffoldAlertRule[];
} {
  if (!composition.trim()) return {};
  return {
    serviceName:
      matchQuotedValue(composition, 'service_name') ??
      matchQuotedValue(composition, 'serviceName') ??
      matchServiceDeclaration(composition),
    requiredTables: matchStringArray(composition, 'required_tables') ?? matchStringArray(composition, 'requiredTables'),
    healthChecks: matchHealthChecks(composition),
    alertRules: matchAlertRules(composition),
  };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberArg(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArrayArg(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}

function objectArrayArg<T extends object>(value: unknown): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records = value.filter((v): v is T => Boolean(v) && typeof v === 'object' && !Array.isArray(v));
  return records.length > 0 ? records : undefined;
}

function matchQuotedValue(source: string, key: string): string | undefined {
  const match = new RegExp(`${key}\\s*[:=]\\s*['"]([^'"]+)['"]`).exec(source);
  return match?.[1];
}

function matchServiceDeclaration(source: string): string | undefined {
  const match = /\bservice\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(source);
  return match?.[1];
}

function matchStringArray(source: string, key: string): string[] | undefined {
  const match = new RegExp(`${key}\\s*[:=]\\s*\\[([^\\]]*)\\]`, 's').exec(source);
  if (!match) return undefined;
  const values = Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g)).map((m) => m[1]);
  return values.length > 0 ? values : undefined;
}

function matchHealthChecks(source: string): ScaffoldHealthCheck[] | undefined {
  const services = matchStringArray(source, 'health_checks') ?? matchStringArray(source, 'health_probes');
  if (!services) return undefined;
  return services.map((service) => ({ service, check: 'health-check' }));
}

function matchAlertRules(source: string): ScaffoldAlertRule[] | undefined {
  const names = matchStringArray(source, 'alert_rules');
  if (!names) return undefined;
  return names.map((name) => ({
    name,
    rule_type: name.includes('quota') || name.includes('cost') ? 'api_quota' : 'custom',
    severity: name.includes('critical') || name.includes('cost') ? 'critical' : 'warning',
    threshold: name.includes('headless') ? DEFAULT_HEADLESS_AGENT_COST_CEILING : DEFAULT_NPC_COST_CEILING,
    rule_config: {},
  }));
}

function createApiQuotaSeed(name: string, subject: string, ceiling: number): ScaffoldAlertRule {
  return {
    name,
    rule_type: 'api_quota',
    severity: 'critical',
    threshold: ceiling,
    rule_config: {
      subject,
      unit: 'usd_per_day',
      ceiling_usd_per_day: ceiling,
    },
  };
}

function renderServiceSql(requiredTables: string[], alertRules: ScaffoldAlertRule[], cleanupSql: string): string {
  const tableSql = requiredTables.map(renderTableSql).join('\n\n');
  const alertSql = alertRules.map(renderAlertSeedSql).join('\n\n');
  return [tableSql, alertSql, '-- Scheduled metrics cleanup job', cleanupSql].filter(Boolean).join('\n\n');
}

function renderTableSql(table: string): string {
  switch (table) {
    case 'system_metrics':
      return `CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform JSONB NOT NULL DEFAULT '{}',
  performance JSONB NOT NULL DEFAULT '{}',
  resources JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
    case 'operation_metrics':
      return `CREATE TABLE IF NOT EXISTS operation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operation VARCHAR(100) NOT NULL DEFAULT 'unknown',
  duration INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  agent_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
    case 'alerts':
      return `CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN (${renderSqlEnum(SCAFFOLD_ALERT_RULE_TYPES)})),
  rule_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
    case 'alert_triggers':
      return `CREATE TABLE IF NOT EXISTS alert_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value NUMERIC(12,4) NOT NULL,
  threshold NUMERIC(12,4) NOT NULL,
  details JSONB DEFAULT '{}',
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
    case 'error_logs':
      return `CREATE TABLE IF NOT EXISTS error_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(20) NOT NULL DEFAULT 'error',
  source VARCHAR(100),
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  agent_id VARCHAR(100)
);`;
    default:
      return `CREATE TABLE IF NOT EXISTS ${sanitizeIdentifier(table)} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);`;
  }
}

function renderAlertSeedSql(rule: ScaffoldAlertRule): string {
  const config = JSON.stringify(rule.rule_config ?? {}).replace(/'/g, "''");
  return `INSERT INTO alerts (name, severity, rule_type, rule_config, enabled)
SELECT '${escapeSql(rule.name)}', '${escapeSql(rule.severity)}', '${escapeSql(rule.rule_type)}', '${config}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE name = '${escapeSql(rule.name)}');`;
}

function renderStartupHealthCheck(
  serviceName: string,
  requiredTables: string[],
  healthChecks: ScaffoldHealthCheck[]
): string {
  const tableList = requiredTables.map((t) => `'${escapeTs(t)}'`).join(', ');
  const checks = JSON.stringify(healthChecks, null, 2);
  return `export class StartupHealthCheck {
  static readonly SERVICE_NAME = '${escapeTs(serviceName)}';
  static readonly REQUIRED_TABLES = [${tableList}];
  static readonly HEALTH_CHECKS = ${checks};

  static async validateSchema(supabase) {
    const missing = [];
    for (const table of this.REQUIRED_TABLES) {
      const { error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      if (error) missing.push(table);
    }
    return { ok: missing.length === 0, missing };
  }
}`;
}

function renderHsplusTrait(
  serviceName: string,
  requiredTables: string[],
  healthChecks: ScaffoldHealthCheck[],
  alertRules: ScaffoldAlertRule[],
  cleanupJob: Record<string, unknown>,
  operationMetric: Record<string, unknown>
): string {
  return `@serviceObservability({
  service_name: '${escapeTs(serviceName)}',
  required_tables: ${JSON.stringify(requiredTables)},
  health_probes: ${JSON.stringify(healthChecks)},
  alert_rules: ${JSON.stringify(alertRules)},
  scheduled_jobs: ${JSON.stringify([cleanupJob])},
  operation_metrics: ${JSON.stringify([operationMetric])}
})`;
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `t_${sanitized}`;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function renderSqlEnum(values: string[]): string {
  return values.map((value) => `'${escapeSql(value)}'`).join(', ');
}

function escapeTs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
