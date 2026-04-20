/**
 * P.008.02 — GET /ops/status: aggregate regions, anomaly flags, circuit breakers, replica count.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getExportManager, type ExportTarget } from '@holoscript/core';
import {
  getActiveAnomaliesSnapshot,
  getReplicaCountForOps,
  getSecuredToolStats,
} from './tool-ops-metrics.js';

const REGION_IDS = ['us-west', 'eu-west', 'ap-east'] as const;
const CIRCUIT_BREAKER_SAMPLE: ExportTarget[] = ['r3f', 'unity', 'webgpu'];

export type OpsOverallStatus = 'healthy' | 'degraded' | 'critical';

export interface OpsStatusPayload {
  status: OpsOverallStatus;
  timestamp: string;
  uptimeSeconds: number;
  replicaCount: number;
  regions: Array<{ id: string; status: string; detail?: string }>;
  anomaly: { activeAnomalies: number };
  securedTools: { requests: number; errors: number; errorRate: number };
  circuitBreakers: Array<{
    target: ExportTarget;
    state: string;
    failureRate: number;
    totalRequests: number;
  }>;
}

function envRegionHealthUrl(regionId: string): string | undefined {
  const key = `MCP_OPS_REGION_HEALTH_URL_${regionId.replace(/-/g, '_').toUpperCase()}`;
  const v = process.env[key];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

async function probeRegionHealth(
  regionId: string
): Promise<{ id: string; status: string; detail?: string }> {
  const url = envRegionHealthUrl(regionId);
  if (!url) {
    return { id: regionId, status: 'unknown', detail: 'no_health_url_configured' };
  }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return { id: regionId, status: 'degraded', detail: `http_${r.status}` };
    return { id: regionId, status: 'healthy' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch_failed';
    return { id: regionId, status: 'critical', detail: msg };
  }
}

function deriveOverallStatus(input: {
  regions: OpsStatusPayload['regions'];
  errorRate: number;
  activeAnomalies: number;
  circuitBreakers: OpsStatusPayload['circuitBreakers'];
}): OpsOverallStatus {
  const { regions, errorRate, activeAnomalies, circuitBreakers } = input;

  if (regions.some((r) => r.status === 'critical')) return 'critical';
  if (errorRate >= 0.5) return 'critical';

  if (activeAnomalies >= 1 || errorRate >= 0.25) return 'degraded';
  if (regions.some((r) => r.status === 'degraded')) return 'degraded';
  for (const cb of circuitBreakers) {
    if (cb.state === 'open') return 'degraded';
  }

  return 'healthy';
}

export async function buildOpsStatusPayload(): Promise<OpsStatusPayload> {
  const regions = await Promise.all([...REGION_IDS].map(probeRegionHealth));
  const em = getExportManager();
  const circuitBreakers = CIRCUIT_BREAKER_SAMPLE.map((target) => {
    const m = em.getMetrics(target);
    return {
      target,
      state: String(m.state),
      failureRate: m.failureRate,
      totalRequests: m.totalRequests,
    };
  });

  const { requests, errors } = getSecuredToolStats();
  const errorRate = requests > 0 ? errors / requests : 0;
  const activeAnomalies = getActiveAnomaliesSnapshot();
  const replicaCount = getReplicaCountForOps();

  const status = deriveOverallStatus({
    regions,
    errorRate,
    activeAnomalies,
    circuitBreakers,
  });

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    replicaCount,
    regions,
    anomaly: { activeAnomalies },
    securedTools: { requests, errors, errorRate },
    circuitBreakers,
  };
}

export async function handleOpsStatusRequest(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = JSON.stringify(await buildOpsStatusPayload());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'critical' as const, error: message }));
  }
}
