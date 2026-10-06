export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';
import { callMcpTool, ABSORB_BASE } from '@/lib/services/absorb-client';
import { recordAbsorbJob } from '@/lib/absorb/projectState';

import { corsHeaders } from '../../_lib/cors';
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    cached: false,
    hint: 'Absorb API proxy bypassed. POST instead to use MCP tools.',
  });
}

export async function POST(req: NextRequest) {
  // An empty body means "defaults"; a malformed one is refused with the parse
  // error instead of silently running with defaults.
  let body: Record<string, unknown> = {};
  const rawBody = await req.text();
  if (rawBody.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[API daemon/absorb] parsing request body failed:', message);
      return NextResponse.json({ error: `Invalid JSON body: ${message}` }, { status: 400 });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  }

  const mcpResult = await callMcpTool('absorb_run_absorb', {
    projectId: body.projectPath || body.projectId || 'local',
    depth: body.depth ?? 'medium',
    tier: body.tier ?? 'medium',
  });

  if (mcpResult.ok && mcpResult.data) {
    recordAbsorbJob({
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      projectPath: typeof body.projectPath === 'string' ? body.projectPath : undefined,
      source: 'mcp',
      depth: body.depth,
      tier: body.tier,
      request: body,
      result: mcpResult.data,
    });
    return NextResponse.json(mcpResult.data);
  }

  // Fallback to HTTP API. Every failure reason is kept and reported.
  const failures: string[] = [`MCP: ${mcpResult.error ?? 'absorb_run_absorb returned no result'}`];
  try {
    const res = await fetch(`${ABSORB_BASE}/api/absorb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardAuthHeaders(req),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      recordAbsorbJob({
        projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
        projectPath: typeof body.projectPath === 'string' ? body.projectPath : undefined,
        source: 'http',
        depth: body.depth,
        tier: body.tier,
        request: body,
        result: data,
      });
      return NextResponse.json(data);
    }
    const text = await res.text().catch((err: unknown) => `(body unreadable: ${String(err)})`);
    failures.push(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  } catch (err) {
    failures.push(`HTTP fallback threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  const failure = failures.join('; ');
  console.error(`[API daemon/absorb] absorb failed: ${failure}`);

  if (typeof body.projectId === 'string' || typeof body.projectPath === 'string') {
    recordAbsorbJob({
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      projectPath: typeof body.projectPath === 'string' ? body.projectPath : undefined,
      source: 'http',
      depth: body.depth,
      tier: body.tier,
      request: body,
      result: null,
      error: failure,
    });
  }

  return NextResponse.json(
    {
      // The upstream text stays in the server log and the job record; the
      // client gets a short reason, never raw upstream bodies.
      error:
        'Absorb could not run: the absorb service did not answer. Details are in the server log.',
      reason: 'absorb_upstream_failed',
    },
    { status: 502 }
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
