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
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (err) {
    console.error('[API daemon/absorb] parsing request body failed:', err);
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

  // Fallback to HTTP API
  let httpError: unknown = null;
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
  } catch (err) {
    httpError = err;
    console.error('[API daemon/absorb] HTTP fallback failed:', err);
  }

  if (typeof body.projectId === 'string' || typeof body.projectPath === 'string') {
    recordAbsorbJob({
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      projectPath: typeof body.projectPath === 'string' ? body.projectPath : undefined,
      source: 'http',
      depth: body.depth,
      tier: body.tier,
      request: body,
      result: null,
      error: httpError ?? 'MCP and HTTP absorb calls failed',
    });
  }

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
