/**
 * P.008.02 — Secured tool execution stats for GET /ops/metrics (Prometheus text).
 */

import type { IncomingMessage, ServerResponse } from 'http';

let requestTotal = 0;
let errorTotal = 0;
const latencyRing: number[] = [];
const LATENCY_RING_CAP = 2000;
let lastAnomalyAlertAt = 0;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[idx]!;
}

/**
 * Called once per securedToolExecution (success or error paths).
 */
export function recordSecuredToolOutcome(latencyMs: number, error: boolean): void {
  requestTotal += 1;
  if (error) errorTotal += 1;
  latencyRing.push(latencyMs);
  if (latencyRing.length > LATENCY_RING_CAP) {
    latencyRing.splice(0, latencyRing.length - LATENCY_RING_CAP);
  }
}

/** Invoked when AnomalyDetector fires (Sliding-window error rate). */
export function notifyOpsAnomalyFired(): void {
  lastAnomalyAlertAt = Date.now();
}

export function getReplicaCountForOps(): number {
  const raw = process.env.REPLICA_COUNT || process.env.RAILWAY_REPLICA_COUNT || '1';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function activeAnomaliesGauge(): number {
  const windowMs = parseInt(process.env.MCP_OPS_ANOMALY_ACTIVE_MS || '300000', 10);
  const w = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 300_000;
  return Date.now() - lastAnomalyAlertAt < w ? 1 : 0;
}

/**
 * Prometheus exposition for Grafana scrape (exact metric names per P.008.02).
 */
export function buildOpsMetricsPrometheusText(): string {
  const sorted = [...latencyRing].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const replica = getReplicaCountForOps();
  const active = activeAnomaliesGauge();

  return [
    '# HELP request_total Total secured MCP tool executions',
    '# TYPE request_total counter',
    `request_total ${requestTotal}`,
    '',
    '# HELP error_total Total secured MCP tool executions that ended in error',
    '# TYPE error_total counter',
    `error_total ${errorTotal}`,
    '',
    '# HELP p50_latency_ms Recent p50 tool latency in ms (rolling sample)',
    '# TYPE p50_latency_ms gauge',
    `p50_latency_ms ${p50}`,
    '',
    '# HELP p95_latency_ms Recent p95 tool latency in ms (rolling sample)',
    '# TYPE p95_latency_ms gauge',
    `p95_latency_ms ${p95}`,
    '',
    '# HELP replica_count Replica count from REPLICA_COUNT or RAILWAY_REPLICA_COUNT',
    '# TYPE replica_count gauge',
    `replica_count ${replica}`,
    '',
    '# HELP active_anomalies 1 if a tool error-rate anomaly alert fired within MCP_OPS_ANOMALY_ACTIVE_MS',
    '# TYPE active_anomalies gauge',
    `active_anomalies ${active}`,
    '',
  ].join('\n');
}

export function handleOpsMetricsRequest(_req: IncomingMessage, res: ServerResponse): void {
  const text = buildOpsMetricsPrometheusText();
  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
  res.end(text);
}

/** @internal Vitest */
export function __testOnly_resetToolOpsMetrics(): void {
  requestTotal = 0;
  errorTotal = 0;
  latencyRing.length = 0;
  lastAnomalyAlertAt = 0;
}
