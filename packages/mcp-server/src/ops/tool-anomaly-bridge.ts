/**
 * Bridges MCP tool outcomes into AnomalyDetector + optional Slack alert (P.008.01).
 */

import { AnomalyDetector, type AnomalyAlertHandler } from './pipeline.js';
import {
  notifyOpsAnomalyFired,
  recordSecuredToolOutcome,
  __testOnly_resetToolOpsMetrics,
} from './tool-ops-metrics.js';

let detector: AnomalyDetector | undefined;
let lastSlackSentAt = 0;

const SLACK_COOLDOWN_MS = 60_000;

function parseEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseEnvFloat(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

async function postSlackAlert(reason: string, detail: Record<string, unknown>): Promise<void> {
  const url = process.env.MCP_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!url) return;

  const now = Date.now();
  if (now - lastSlackSentAt < SLACK_COOLDOWN_MS) return;
  lastSlackSentAt = now;

  const text = [
    `*[HoloScript MCP]* tool anomaly: ${reason}`,
    '```',
    JSON.stringify(detail, null, 2),
    '```',
  ].join('\n');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn('[MCP Anomaly] Slack webhook returned', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[MCP Anomaly] Slack webhook failed:', e);
  }
}

const defaultOnAlert: AnomalyAlertHandler = (detail) => {
  notifyOpsAnomalyFired();
  console.warn('[MCP Anomaly]', detail.reason, detail);
  void postSlackAlert(detail.reason, {
    windowSize: detail.windowSize,
    errorRate: detail.errorRate,
    p95_latency_ms: detail.p95LatencyMs,
    request_rate_per_min: detail.requestRatePerMin,
  });
};

function getDetector(): AnomalyDetector {
  if (!detector) {
    detector = new AnomalyDetector({
      windowMs: parseEnvInt('MCP_ANOMALY_WINDOW_MS', 120_000),
      minSamples: parseEnvInt('MCP_ANOMALY_MIN_SAMPLES', 40),
      maxErrorRate: parseEnvFloat('MCP_ANOMALY_MAX_ERROR_RATE', 0.5),
      onAlert: defaultOnAlert,
    });
  }
  return detector;
}

/**
 * Record one secured tool execution for anomaly monitoring (error rate in sliding window).
 */
export function recordMcpToolCallMetric(toolName: string, latencyMs: number, error: boolean): void {
  recordSecuredToolOutcome(latencyMs, error);
  try {
    getDetector().ingest({
      toolName,
      latencyMs,
      error,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.warn('[MCP Anomaly] ingest failed:', e);
  }
}

/** @internal Vitest */
export function __testOnly_resetToolAnomalyBridge(): void {
  detector = undefined;
  lastSlackSentAt = 0;
  __testOnly_resetToolOpsMetrics();
}
