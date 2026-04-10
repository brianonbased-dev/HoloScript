/**
 * @holoscript/mcp-server — Health Check & Metrics Endpoint
 *
 * Provides /health (enhanced) and /metrics (Prometheus exposition) endpoints.
 * Integrates with PrometheusMetricsRegistry and TelemetryCollector.
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getTelemetryCollector,
  getPrometheusMetrics,
  PrometheusMetricsRegistry,
} from '@holoscript/core';
import { getDefaultRegistry } from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: {
    registry: { status: string; agentCount: number };
    telemetry: { status: string; totalSpans: number; activeSpans: number; totalEvents: number };
    tools: { status: string; toolCount: number };
  };
  version: string;
}

// =============================================================================
// HEALTH CHECK HANDLER
// =============================================================================

/**
 * Build a comprehensive health status response.
 */
export function buildHealthStatus(toolCount: number, version: string): HealthStatus {
  const collector = getTelemetryCollector();
  const stats = collector.getStats();

  let registryAgentCount = 0;
  try {
    const registry = getDefaultRegistry();
    registryAgentCount = registry.getAllManifests().length;
  } catch {
    // Registry not initialized yet
  }

  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      registry: {
        status: registryAgentCount >= 0 ? 'ok' : 'error',
        agentCount: registryAgentCount,
      },
      telemetry: {
        status: 'ok',
        totalSpans: stats.totalSpans,
        activeSpans: stats.activeSpans,
        totalEvents: stats.totalEvents,
      },
      tools: {
        status: toolCount > 0 ? 'ok' : 'warn',
        toolCount,
      },
    },
    version,
  };
}

/**
 * Initialize default Prometheus metrics for the MCP server.
 */
export function initServerMetrics(
  metricsRegistry?: PrometheusMetricsRegistry
): PrometheusMetricsRegistry {
  const registry = metricsRegistry ?? getPrometheusMetrics('holoscript');

  registry.registerCounter('mcp_tool_calls_total', 'Total MCP tool invocations');
  registry.registerCounter('mcp_tool_errors_total', 'Total MCP tool errors');
  registry.registerHistogram(
    'mcp_tool_duration_ms',
    'MCP tool call duration in milliseconds',
    [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000]
  );
  registry.registerGauge('mcp_active_sessions', 'Active MCP sessions');
  registry.registerGauge('mcp_tool_count', 'Total registered MCP tools');
  registry.registerCounter('http_requests_total', 'Total HTTP requests');

  return registry;
}

/**
 * Handle a /metrics request by serializing Prometheus metrics.
 */
export function handleMetricsRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  metricsRegistry?: PrometheusMetricsRegistry
): void {
  const registry = metricsRegistry ?? getPrometheusMetrics('holoscript');
  const text = registry.toPrometheusText();

  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
  res.end(text);
}

/**
 * Handle an enhanced /health request with subsystem checks.
 */
export function handleHealthRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  toolCount: number,
  version: string
): void {
  const health = buildHealthStatus(toolCount, version);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health));
}
