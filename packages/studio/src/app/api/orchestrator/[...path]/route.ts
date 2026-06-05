export const maxDuration = 60;

/**
 * /api/orchestrator/[...path] — read-only proxy to the MCP orchestrator.
 *
 * D.081 (Studio = operate surface): the Operations console needs the
 * orchestrator's fleet/CI/Lotus telemetry, which lives on a different host
 * (ENDPOINTS.MCP_ORCHESTRATOR) than the HoloMesh board (mcp.holoscript.net) and
 * is gated by `x-mcp-api-key` (agent role). Browsers can't hold that key, so
 * this route injects it server-side — exactly like holomesh-proxy does for the
 * board.
 *
 * SAFETY: GET-only, and restricted to an explicit allow-list of read-only
 * telemetry paths. This is deliberately NOT an open orchestrator proxy — it
 * must never expose the admin job dump (/gpu/jobs), seat mutation (/gpu/seats),
 * or any write endpoint. Add a path here only after confirming it is a safe,
 * read-only, agent-role GET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ENDPOINTS } from '@holoscript/config';
import { corsHeaders } from '../../_lib/cors';

const ORCH = process.env.MCP_ORCHESTRATOR_URL || ENDPOINTS.MCP_ORCHESTRATOR;
// Agent-role orchestrator key (config/auth.ts: HOLOSCRIPT_API_KEY is the
// orchestrator/knowledge-sync key). Falls back to the HoloMesh key name in
// case a deploy only set that one.
const KEY = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';

// Read-only telemetry endpoints safe to surface in the Operations console.
const ALLOWED_PATHS = new Set<string>([
  'gpu/lotus-status', // Lotus gate + per-lane queue (agent role)
  'serve/status', // serving autoscaler endpoints + demand (agent role)
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const joined = (path || []).join('/');

  if (!ALLOWED_PATHS.has(joined)) {
    return NextResponse.json(
      { error: `orchestrator path not allowed: ${joined}` },
      { status: 403 }
    );
  }

  if (!KEY) {
    return NextResponse.json(
      { error: 'orchestrator key not configured (HOLOSCRIPT_API_KEY)' },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(`${ORCH}/${joined}${req.nextUrl.search}`, {
      method: 'GET',
      headers: { 'x-mcp-api-key': KEY, Accept: 'application/json' },
      cache: 'no-store',
    });

    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data ?? { error: 'orchestrator returned no JSON' }, {
      status: upstream.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'orchestrator unreachable', details: String(error) },
      { status: 503 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
