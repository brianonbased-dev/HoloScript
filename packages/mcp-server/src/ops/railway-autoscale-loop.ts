/**
 * P.008.01 — Optional Railway autoscale: poll local /health, drive AutoScalingLoop.
 */

import { AutoScalingLoop, type ScalingPolicy } from './pipeline.js';
import { RailwayReplicaScaler } from './railway-replica-scaler.js';

export type ScalingEvent =
  | {
      type: 'ScalingEvent';
      phase: 'tick' | 'apply' | 'skip' | 'error';
      utilization?: number;
      currentReplicas?: number;
      desiredReplicas?: number;
      sessions?: number;
      message?: string;
      ts: string;
    };

function logScalingEvent(ev: ScalingEvent): void {
  console.info(JSON.stringify(ev));
}

let getMcpSessionCount: () => number = () => 0;

/** Register live MCP SSE session count (maps to /health.sessions). */
export function registerMcpAutoscaleSessions(fn: () => number): void {
  getMcpSessionCount = fn;
}

function parseEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseEnvFloat(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchLocalHealthSessions(port: number): Promise<number> {
  const url = process.env.MCP_AUTOSCALE_HEALTH_URL || `http://127.0.0.1:${port}/health`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return 0;
    const j = (await r.json()) as { sessions?: number };
    return typeof j.sessions === 'number' && j.sessions >= 0 ? j.sessions : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Start interval when MCP_AUTOSCALE_ENABLED=1 and Railway IDs + token are set.
 */
export function maybeStartRailwayAutoscaleLoop(options: { port: number }): void {
  const enabled =
    process.env.MCP_AUTOSCALE_ENABLED === '1' || process.env.MCP_AUTOSCALE_ENABLED === 'true';
  if (!enabled) return;

  const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN;
  const projectToken = process.env.RAILWAY_PROJECT_TOKEN;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;

  if ((!token && !projectToken) || !serviceId || !environmentId) {
    console.warn(
      '[autoscale] MCP_AUTOSCALE_ENABLED but missing RAILWAY_API_TOKEN/RAILWAY_TOKEN or RAILWAY_PROJECT_TOKEN, or RAILWAY_SERVICE_ID / RAILWAY_ENVIRONMENT_ID — not starting'
    );
    return;
  }

  const region = (process.env.RAILWAY_AUTOSCALE_REGION || 'us-west1').trim();
  const sessionCeil = Math.max(1, parseEnvInt('MCP_AUTOSCALE_SESSION_CEIL', 50));

  const policy: ScalingPolicy = {
    minReplicas: Math.max(1, parseEnvInt('MCP_AUTOSCALE_MIN_REPLICAS', 1)),
    maxReplicas: Math.max(1, parseEnvInt('MCP_AUTOSCALE_MAX_REPLICAS', 4)),
    scaleUpUtilThreshold: parseEnvFloat('MCP_AUTOSCALE_SCALE_UP_AT', 0.72),
    scaleDownUtilThreshold: parseEnvFloat('MCP_AUTOSCALE_SCALE_DOWN_AT', 0.22),
  };

  const scaler = new RailwayReplicaScaler({
    token: token || undefined,
    projectToken: projectToken || undefined,
    serviceId,
    environmentId,
    region,
  });

  const loop = new AutoScalingLoop(scaler, policy);
  const intervalMs = Math.max(15_000, parseEnvInt('MCP_AUTOSCALE_INTERVAL_MS', 60_000));

  const tick = async (): Promise<void> => {
    const ts = new Date().toISOString();
    try {
      const healthSessions = await fetchLocalHealthSessions(options.port);
      const liveSessions = getMcpSessionCount();
      const sessions = Math.max(healthSessions, liveSessions);
      const utilization = Math.min(1, sessions / sessionCeil);
      const currentReplicas = Math.max(
        policy.minReplicas,
        parseEnvInt('RAILWAY_REPLICA_COUNT', parseEnvInt('REPLICA_COUNT', 1))
      );

      logScalingEvent({
        type: 'ScalingEvent',
        phase: 'tick',
        utilization,
        currentReplicas,
        sessions,
        ts,
      });

      const { desiredReplicas } = await loop.evaluate({ utilization, currentReplicas });

      logScalingEvent({
        type: 'ScalingEvent',
        phase: desiredReplicas === currentReplicas ? 'skip' : 'apply',
        utilization,
        currentReplicas,
        desiredReplicas,
        sessions,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      logScalingEvent({
        type: 'ScalingEvent',
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  };

  console.info(
    `[autoscale] Railway loop every ${intervalMs}ms (region=${region}, sessionCeil=${sessionCeil})`
  );
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();
}
