export const maxDuration = 30;

/**
 * GET /api/connectors/status — Live health of shared infrastructure connectors.
 *
 * Server-side health probe for the infrastructure the whole ecosystem depends on
 * but which has no UI visibility today: the MCP servers. Service connectors
 * (GitHub, Railway, …) carry their own per-browser status in connectorStore;
 * THIS route covers the shared backends a single user can't see from the store.
 *
 * Surfaced by <ConnectorStatusOverview /> on /integrations (D.081: every infra
 * capability gets a perceivable Studio surface; F.099 show-don't-reference).
 *
 * To add a service to the Status overview's Infrastructure group, append to
 * TARGETS below — this list is the single source for that group.
 *
 * @module api/connectors/status
 */

import { NextResponse } from 'next/server';

interface InfraTarget {
  id: string;
  name: string;
  /** Health/liveness URL to probe (GET). Public endpoints only — no secrets. */
  url: string;
  kind: 'mcp' | 'service';
  /** Human-facing note about what this backend is. */
  description: string;
}

const TARGETS: InfraTarget[] = [
  {
    id: 'holoscript-mcp',
    name: 'HoloScript MCP',
    url: 'https://mcp.holoscript.net/health',
    kind: 'mcp',
    description: 'Compile / validate / generate / codebase tools (mcp.holoscript.net)',
  },
  {
    id: 'mcp-orchestrator',
    name: 'MCP Orchestrator',
    url: 'https://mcp-orchestrator-production-45f9.up.railway.app/health',
    kind: 'mcp',
    description: 'Tool discovery, knowledge federation, coordination',
  },
];

type InfraStatus = 'up' | 'degraded' | 'down';

interface InfraResult {
  id: string;
  name: string;
  url: string;
  kind: InfraTarget['kind'];
  description: string;
  status: InfraStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  error?: string;
  checkedAt: string;
}

const PROBE_TIMEOUT_MS = 6000;

async function probe(target: InfraTarget): Promise<InfraResult> {
  const started = Date.now();
  const checkedAt = new Date(started).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(target.url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'user-agent': 'holoscript-studio-status-probe' },
      cache: 'no-store',
    });
    const latencyMs = Date.now() - started;
    // 2xx → up; reachable-but-not-2xx (e.g. 404 no /health route, 401, 5xx<…) →
    // degraded for 3xx/4xx, down for 5xx. The server answered, so it's not "down".
    const status: InfraStatus = res.ok ? 'up' : res.status >= 500 ? 'down' : 'degraded';
    return {
      id: target.id,
      name: target.name,
      url: target.url,
      kind: target.kind,
      description: target.description,
      status,
      httpStatus: res.status,
      latencyMs,
      checkedAt,
    };
  } catch (err) {
    return {
      id: target.id,
      name: target.name,
      url: target.url,
      kind: target.kind,
      description: target.description,
      status: 'down',
      httpStatus: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const infra = await Promise.all(TARGETS.map(probe));
  const summary = {
    total: infra.length,
    up: infra.filter((i) => i.status === 'up').length,
    degraded: infra.filter((i) => i.status === 'degraded').length,
    down: infra.filter((i) => i.status === 'down').length,
  };
  return NextResponse.json(
    { checkedAt: new Date().toISOString(), summary, infra },
    { headers: { 'cache-control': 'no-store' } }
  );
}
