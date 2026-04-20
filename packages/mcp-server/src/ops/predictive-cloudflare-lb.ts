/**
 * P.008.01 — PredictiveLoadBalancer + Cloudflare pool origin weights (30s tick).
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { PredictiveLoadBalancer } from './pipeline.js';
import { cfGetLoadBalancerPool, cfPatchLoadBalancerPool, type CfOrigin } from './cloudflare-lb-api.js';

export interface LbWeightsSnapshot {
  backends: string[];
  /** Normalized weights (sum ~1) from PredictiveLoadBalancer */
  normalizedWeights: Record<string, number>;
  /** Last origin weights sent to Cloudflare (when not dry-run) */
  cloudflareOriginWeights?: Record<string, number>;
  updatedAt: string;
  poolId: string;
  dryRun: boolean;
  lastError?: string;
}

let lastSnapshot: LbWeightsSnapshot | null = null;

export function getLbWeightsSnapshot(): LbWeightsSnapshot | null {
  return lastSnapshot;
}

function parseBackends(): string[] {
  const raw = process.env.MCP_PREDICTIVE_LB_BACKENDS || 'us-west,eu-west,ap-east';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function healthUrlForBackend(backendId: string): string | undefined {
  const slug = backendId.replace(/-/g, '_').toUpperCase();
  return (
    process.env[`MCP_LB_HEALTH_URL_${slug}`] ||
    process.env[`MCP_OPS_REGION_HEALTH_URL_${slug}`] ||
    undefined
  );
}

async function probeBackendHealth(backendId: string): Promise<number> {
  const url = healthUrlForBackend(backendId);
  if (!url) return 0.5;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    return r.ok ? 1 : 0.25;
  } catch {
    return 0.05;
  }
}

function originsWithPredictiveWeights(
  origins: CfOrigin[],
  normalized: ReadonlyMap<string, number>
): CfOrigin[] {
  return origins.map((o) => {
    const p = normalized.get(o.name);
    if (p === undefined) return o;
    const w = Math.max(1, Math.round(p * 100));
    return { ...o, weight: w };
  });
}

export async function runPredictiveCloudflareLbTick(options: {
  accountId: string;
  poolId: string;
  apiToken: string;
  dryRun: boolean;
}): Promise<void> {
  const backends = parseBackends();
  const lb = new PredictiveLoadBalancer(backends);

  const health: Record<string, number> = {};
  for (const b of backends) {
    health[b] = await probeBackendHealth(b);
  }
  lb.updateWeights(health);
  const normalized = lb.getWeights();

  const normObj: Record<string, number> = {};
  for (const [k, v] of normalized) normObj[k] = Math.round(v * 10_000) / 10_000;

  const base: LbWeightsSnapshot = {
    backends,
    normalizedWeights: normObj,
    updatedAt: new Date().toISOString(),
    poolId: options.poolId,
    dryRun: options.dryRun,
  };

  try {
    if (options.dryRun) {
      lastSnapshot = { ...base };
      console.info(
        JSON.stringify({
          type: 'PredictiveLbEvent',
          phase: 'dry_run',
          normalizedWeights: normObj,
          poolId: options.poolId,
        })
      );
      return;
    }

    const pool = await cfGetLoadBalancerPool(options.accountId, options.poolId, options.apiToken);
    const newOrigins = originsWithPredictiveWeights(pool.origins, normalized);
    const cfWeights: Record<string, number> = {};
    for (const o of newOrigins) {
      if (typeof o.weight === 'number') cfWeights[o.name] = o.weight;
    }

    await cfPatchLoadBalancerPool(options.accountId, options.poolId, options.apiToken, {
      origins: newOrigins,
    });

    lastSnapshot = {
      ...base,
      cloudflareOriginWeights: cfWeights,
    };

    console.info(
      JSON.stringify({
        type: 'PredictiveLbEvent',
        phase: 'applied',
        normalizedWeights: normObj,
        cloudflareOriginWeights: cfWeights,
        poolId: options.poolId,
      })
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    lastSnapshot = { ...base, lastError: message };
    console.warn(
      JSON.stringify({
        type: 'PredictiveLbEvent',
        phase: 'error',
        message,
        poolId: options.poolId,
      })
    );
  }
}

export function maybeStartPredictiveCloudflareLbLoop(): void {
  const enabled =
    process.env.MCP_PREDICTIVE_LB_ENABLED === '1' || process.env.MCP_PREDICTIVE_LB_ENABLED === 'true';
  if (!enabled) return;

  const apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const poolId = process.env.CLOUDFLARE_LB_POOL_ID || '';

  if (!apiToken || !accountId || !poolId) {
    console.warn(
      '[predictive-lb] MCP_PREDICTIVE_LB_ENABLED but missing CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, or CLOUDFLARE_LB_POOL_ID — not starting'
    );
    return;
  }

  const dryRun =
    process.env.MCP_PREDICTIVE_LB_DRY_RUN === '1' || process.env.MCP_PREDICTIVE_LB_DRY_RUN === 'true';
  const intervalMs = Math.max(10_000, parseInt(process.env.MCP_PREDICTIVE_LB_INTERVAL_MS || '30000', 10));

  console.info(
    `[predictive-lb] Cloudflare pool ${poolId} every ${intervalMs}ms (dryRun=${dryRun}); origin names must match MCP_PREDICTIVE_LB_BACKENDS`
  );

  const tick = (): void => {
    void runPredictiveCloudflareLbTick({ accountId, poolId, apiToken, dryRun });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
}

export function handleLbWeightsRequest(_req: IncomingMessage, res: ServerResponse): void {
  const snap = getLbWeightsSnapshot();
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify(
      snap ?? {
        backends: parseBackends(),
        normalizedWeights: {},
        updatedAt: null,
        poolId: process.env.CLOUDFLARE_LB_POOL_ID || null,
        dryRun: false,
        note: 'No tick yet — enable MCP_PREDICTIVE_LB_ENABLED and configure Cloudflare env',
      },
      null,
      2
    )
  );
}
