export const maxDuration = 300;

/**
 * POST /api/absorb/projects/:id/knowledge
 *
 * Standalone knowledge extraction endpoint. Calls the absorb_extract_knowledge
 * MCP tool via the MCP server's HTTP API, then falls back to the absorb service
 * catch-all proxy.
 *
 * Gap 3: Knowledge extraction UI wiring -- this route ensures the Absorb page's
 * "Extract W/P/G" button works even when absorb.holoscript.net doesn't serve
 * REST endpoints (it only speaks MCP protocol).
 */

import { NextRequest, NextResponse } from 'next/server';
import { MCP_SERVER_URL, ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';

interface ExtractionRequest {
  minConfidence?: number;
  maxPerType?: number;
  includeSpeculative?: boolean;
}

/**
 * Try calling the MCP tool via the MCP server's /mcp endpoint (JSON-RPC).
 */
async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
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
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return { ok: false, data: null };

    const json = await res.json();
    if (json.error) return { ok: false, data: json.error };

    // MCP tools return { content: [{ type: 'text', text: '...' }] }
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

/**
 * Try calling the absorb service's REST API directly (may not have this route).
 */
async function callAbsorbRest(
  projectId: string,
  body: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${ABSORB_BASE}/api/projects/${projectId}/knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABSORB_API_KEY}`,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: { error: 'Absorb service unreachable' } };
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  let body: ExtractionRequest = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine -- defaults will be used
  }

  // Strategy 1: Call the absorb_extract_knowledge MCP tool directly
  const mcpResult = await callMcpTool('absorb_extract_knowledge', {
    minConfidence: body.minConfidence ?? 0.5,
    maxPerType: body.maxPerType ?? 20,
    includeSpeculative: body.includeSpeculative ?? false,
    workspaceId: projectId,
  });

  if (mcpResult.ok && mcpResult.data) {
    return NextResponse.json(mcpResult.data);
  }

  // Strategy 2: Try the absorb service REST API
  const restResult = await callAbsorbRest(projectId, JSON.stringify(body));

  if (restResult.ok) {
    return NextResponse.json(restResult.data);
  }

  // Strategy 3: Return a helpful fallback with mock data structure
  // This ensures the UI always gets a valid response shape
  return NextResponse.json(
    {
      success: false,
      entries: [],
      summary: {
        wisdom: 0,
        pattern: 0,
        gotcha: 0,
        total: 0,
      },
      error: 'Knowledge extraction service temporarily unavailable',
      hint: 'Ensure a codebase has been absorbed first (run absorb_run_absorb), then retry extraction.',
      tried: ['mcp-tool', 'absorb-rest'],
    },
    { status: 503 }
  );
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
