import { NextRequest, NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
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

export async function GET(req: NextRequest) {
  return NextResponse.json({
    cached: false,
    hint: 'Absorb API proxy bypassed. POST instead to use MCP tools.',
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch (err) { console.error('[API daemon/absorb] parsing request body failed:', err); }

  const mcpResult = await callMcpTool('absorb_run_absorb', {
    projectId: body.projectPath || body.projectId || 'local',
    depth: body.depth ?? 'medium',
    tier: body.tier ?? 'medium'
  });

  if (mcpResult.ok && mcpResult.data) {
    return NextResponse.json(mcpResult.data);
  }

  // Fallback to HTTP API
  try {
    const res = await fetch(`${ABSORB_BASE}/api/absorb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardAuthHeaders(req)
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch (err) { console.error('[API daemon/absorb] HTTP fallback failed:', err); }

  return NextResponse.json(
    { error: 'Failed to run absorb_run_absorb. Ensure the orchestrator is running.' },
    { status: 502 }
  );
}
