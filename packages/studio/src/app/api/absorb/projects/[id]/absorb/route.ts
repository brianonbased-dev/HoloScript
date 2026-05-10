export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool, ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { recordAbsorbJob } from '@/lib/absorb/projectState';

import { corsHeaders } from '../../../../_lib/cors';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (err) {
    console.error('[API absorb/projects/[id]/absorb] parsing request body failed:', err);
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

  // Fallback to HTTP API
  let httpError: unknown = null;
  try {
    const res = await fetch(`${ABSORB_BASE}/api/projects/${projectId}/absorb`, {
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
  } catch (err) {
    httpError = err;
    console.error('[API absorb/projects/[id]/absorb] HTTP fallback failed:', err);
  }

  recordAbsorbJob({
    projectId,
    source: 'http',
    depth: body.depth,
    tier: body.tier,
    request: body,
    result: null,
    error: httpError ?? 'MCP and HTTP absorb calls failed',
  });

  return NextResponse.json(
    { error: 'Failed to run absorb_run_absorb. Ensure the orchestrator is running.' },
    { status: 502 }
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
