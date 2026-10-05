export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool, ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { recordAbsorbJob } from '@/lib/absorb/projectState';

import { corsHeaders } from '../../../../_lib/cors';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  // An empty body means "defaults"; a malformed one is refused with the parse
  // error instead of silently running with defaults.
  let body: Record<string, unknown> = {};
  const rawBody = await req.text();
  if (rawBody.trim() !== '') {
    try {
      body = JSON.parse(rawBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[API absorb/projects/[id]/absorb] parsing request body failed:', message);
      return NextResponse.json({ error: `Invalid JSON body: ${message}` }, { status: 400 });
    }
  }

  // POST directly to MCP tool
  const mcpResult = await callMcpTool('absorb_run_absorb', {
    projectId: projectId,
    depth: body.depth ?? 'shallow',
    tier: body.tier ?? 'medium',
  });

  if (mcpResult.ok && mcpResult.data) {
    recordAbsorbJob({
      projectId,
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
    const res = await fetch(`${ABSORB_BASE}/api/absorb/projects/${projectId}/absorb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      recordAbsorbJob({
        projectId,
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
  console.error(`[API absorb/projects/[id]/absorb] absorb failed for ${projectId}: ${failure}`);

  recordAbsorbJob({
    projectId,
    source: 'http',
    depth: body.depth,
    tier: body.tier,
    request: body,
    result: null,
    error: failure,
  });

  return NextResponse.json(
    {
      error: 'Failed to run absorb_run_absorb. Ensure the orchestrator is running.',
      detail: failure,
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
