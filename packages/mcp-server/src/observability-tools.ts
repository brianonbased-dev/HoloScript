/**
 * @holoscript/mcp-server — Observability MCP Tools
 *
 * 4 tools for querying traces, exporting OTLP, agent health, and Prometheus metrics.
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getTelemetryCollector,
  getPrometheusMetrics,
  getDefaultRegistry,
  OTLPExporter,
} from '@holoscript/core';
import type { OTLPExporterConfig } from '@holoscript/core';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const observabilityTools: Tool[] = [
  {
    name: 'query_traces',
    description:
      'Query distributed trace spans by traceId, agent, or time range. Returns OTel-format spans for debugging agent orchestration.',
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
    description:
      'Export collected trace spans to an OTLP/HTTP endpoint. Requires an endpoint URL. Returns export result with span count and status.',
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
    description:
      'Get health status of registered agents including count, status breakdown, and telemetry stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_metrics_prometheus',
    description:
      'Get all collected metrics in Prometheus exposition text format. Use for monitoring dashboards and alerting.',
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

  const exporter = new (OTLPExporter as unknown as new (config: OTLPExporterConfig) => { exportBatch(spans: unknown[]): Promise<{ success: boolean; spanCount: number; retries: number; durationMs: number; error?: string }> })(exporterConfig);
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
