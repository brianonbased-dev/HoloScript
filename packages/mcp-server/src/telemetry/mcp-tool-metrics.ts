/**
 * Per-tool Prometheus metrics and structured JSON logging for MCP tool calls.
 *
 * Implements [Observability] P2 requirements:
 *  – mcp_tool_requests_total{tool_name}
 *  – mcp_tool_errors_total{tool_name}
 *  – mcp_tool_latency_ms_sum{tool_name}  (sum component for derived average)
 *  – mcp_tool_latency_ms_count{tool_name}
 *  – mcp_tool_cache_hits_total{tool_name}
 *  – Structured JSON log lines written to stdout with correlation_id per call
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Per-tool metric buckets
// ---------------------------------------------------------------------------

interface ToolMetricBucket {
  requests: number;
  errors: number;
  latencyMsSum: number;
  latencyMsCount: number;
  cacheHits: number;
}

const perToolMetrics = new Map<string, ToolMetricBucket>();

function bucketFor(toolName: string): ToolMetricBucket {
  let b = perToolMetrics.get(toolName);
  if (!b) {
    b = { requests: 0, errors: 0, latencyMsSum: 0, latencyMsCount: 0, cacheHits: 0 };
    perToolMetrics.set(toolName, b);
  }
  return b;
}

/**
 * Record one tool execution outcome (called from withMcpToolExecutionSpan).
 */
export function recordToolRequest(toolName: string, latencyMs: number, error: boolean): void {
  const b = bucketFor(toolName);
  b.requests += 1;
  if (error) b.errors += 1;
  b.latencyMsSum += latencyMs;
  b.latencyMsCount += 1;
}

/**
 * Record a cache hit for the given tool (call from individual tool handlers that
 * return a cached result before hitting the full computation path).
 */
export function recordToolCacheHit(toolName: string): void {
  bucketFor(toolName).cacheHits += 1;
}

/**
 * Prometheus exposition text for per-tool counters.
 * Returns empty string when no tools have been called yet.
 */
export function getPerToolPrometheusText(): string {
  if (perToolMetrics.size === 0) return '';

  const lines: string[] = [
    '# HELP mcp_tool_requests_total Total MCP tool invocations per tool_name',
    '# TYPE mcp_tool_requests_total counter',
  ];
  for (const [tool, b] of perToolMetrics) {
    lines.push(`mcp_tool_requests_total{tool_name="${escapeLabel(tool)}"} ${b.requests}`);
  }

  lines.push(
    '',
    '# HELP mcp_tool_errors_total MCP tool invocations that returned an error per tool_name',
    '# TYPE mcp_tool_errors_total counter',
  );
  for (const [tool, b] of perToolMetrics) {
    lines.push(`mcp_tool_errors_total{tool_name="${escapeLabel(tool)}"} ${b.errors}`);
  }

  lines.push(
    '',
    '# HELP mcp_tool_latency_ms_sum Sum of tool execution latency in ms per tool_name',
    '# TYPE mcp_tool_latency_ms_sum counter',
  );
  for (const [tool, b] of perToolMetrics) {
    lines.push(`mcp_tool_latency_ms_sum{tool_name="${escapeLabel(tool)}"} ${b.latencyMsSum}`);
  }

  lines.push(
    '',
    '# HELP mcp_tool_latency_ms_count Number of latency samples per tool_name',
    '# TYPE mcp_tool_latency_ms_count counter',
  );
  for (const [tool, b] of perToolMetrics) {
    lines.push(`mcp_tool_latency_ms_count{tool_name="${escapeLabel(tool)}"} ${b.latencyMsCount}`);
  }

  lines.push(
    '',
    '# HELP mcp_tool_cache_hits_total MCP tool calls served from cache per tool_name',
    '# TYPE mcp_tool_cache_hits_total counter',
  );
  for (const [tool, b] of perToolMetrics) {
    lines.push(`mcp_tool_cache_hits_total{tool_name="${escapeLabel(tool)}"} ${b.cacheHits}`);
  }

  return lines.join('\n') + '\n';
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ---------------------------------------------------------------------------
// Structured JSON logging
// ---------------------------------------------------------------------------

export type McpLogEvent = 'tool_start' | 'tool_end';

export interface McpStructuredLog {
  timestamp: string;
  correlation_id: string;
  event: McpLogEvent;
  tool_name: string;
  tier?: string;
  agent_id?: string;
  latency_ms?: number;
  error?: boolean;
}

/** Override for tests so tests can capture log output without touching stdout. */
let logSink: ((entry: McpStructuredLog) => void) | undefined;

export function setMcpLogSink(fn: ((entry: McpStructuredLog) => void) | undefined): void {
  logSink = fn;
}

export function emitMcpStructuredLog(entry: McpStructuredLog): void {
  const sink = logSink;
  if (sink) {
    sink(entry);
    return;
  }
  // Default: newline-delimited JSON to stdout.
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function generateCorrelationId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// @internal vitest
// ---------------------------------------------------------------------------

export function __testOnly_resetPerToolMetrics(): void {
  perToolMetrics.clear();
  logSink = undefined;
}
