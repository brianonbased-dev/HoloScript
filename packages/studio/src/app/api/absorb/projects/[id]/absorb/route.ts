import { NextRequest, NextResponse } from 'next/server';

const ABSORB_BASE = process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net';
const ABSORB_API_KEY = process.env.ABSORB_API_KEY || process.env.MCP_API_KEY || '';

async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(`${ABSORB_BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(60000), // Absorb can take a while
    });

    if (!res.ok) return { ok: false, data: null };

    const json = await res.json();
    if (json.error) return { ok: false, data: json.error };

    const textContent = json.result?.content?.[0]?.text;
    if (textContent) {
      try {
        return { ok: true, data: JSON.parse(textContent) };
      } catch {
        return { ok: true, data: { text: textContent } };
      }
    }

    return { ok: true, data: json.result };
  } catch {
    return { ok: false, data: null };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  let body: any = {};
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
