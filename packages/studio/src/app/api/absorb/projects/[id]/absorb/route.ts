import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool, ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (err) { console.error('[API absorb/projects/[id]/absorb] parsing request body failed:', err); }

  // POST directly to MCP tool
  const mcpResult = await callMcpTool('absorb_run_absorb', {
    projectId: projectId,
    depth: body.depth ?? 'shallow',
    tier: body.tier ?? 'medium'
  });

  if (mcpResult.ok && mcpResult.data) {
    return NextResponse.json(mcpResult.data);
  }

  // Fallback to HTTP API
  try {
    const res = await fetch(`${ABSORB_BASE}/api/projects/${projectId}/absorb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch (err) { console.error('[API absorb/projects/[id]/absorb] HTTP fallback failed:', err); }

  return NextResponse.json(
    { error: 'Failed to run absorb_run_absorb. Ensure the orchestrator is running.' },
    { status: 502 }
  );
}
