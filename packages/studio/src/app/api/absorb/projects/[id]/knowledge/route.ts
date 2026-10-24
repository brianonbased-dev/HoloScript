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
 *
 * Owner-only (#617 set): the caller must be signed in (401) and must own the
 * project (404, so ids of other users' projects are not confirmed). Upstream
 * calls carry only the signed-in user's own credential, resolved server-side
 * from the session; Studio's service key is never sent, on either path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/api-auth';
import { getGitHubToken } from '@/app/api/github/_shared';
import { findDurableAbsorbProject } from '@/lib/absorb/projectState';
import { MCP_SERVER_URL, ABSORB_BASE } from '@/lib/services/absorb-client';

import { corsHeaders } from '../../../../_lib/cors';
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
  args: Record<string, unknown>,
  userToken: string
): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
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
  body: string,
  userToken: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(
      `${ABSORB_BASE}/api/absorb/projects/${encodeURIComponent(projectId)}/knowledge`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body,
        signal: AbortSignal.timeout(15000),
      }
    );

    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: { error: 'Absorb service unreachable' } };
  }
}

/** Studio's signed-in user id, or null. Same reader the projects list uses. */
async function signedInUserId(): Promise<string | null> {
  const session = await getSession().catch(() => null);
  const id = session?.user?.id;
  return typeof id === 'string' && id.trim() ? id : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const userId = await signedInUserId();
  const userToken = userId ? await getGitHubToken(req, { userOnly: true }).catch(() => null) : null;
  if (!userId || !userToken) {
    return NextResponse.json(
      { error: 'Sign in to extract knowledge.', reason: 'absorb_no_user_credential' },
      { status: 401 }
    );
  }

  // Only the project's recorded owner may read its knowledge. Unowned or
  // unknown ids get the same 404, so other users' project ids are not confirmed.
  const project = findDurableAbsorbProject({ projectId });
  if (!project || project.ownerId !== userId) {
    return NextResponse.json(
      { error: 'Project not found.', reason: 'absorb_project_not_found' },
      { status: 404 }
    );
  }

  let body: ExtractionRequest = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine -- defaults will be used
  }

  // Strategy 1: Call the absorb_extract_knowledge MCP tool directly
  const mcpResult = await callMcpTool(
    'absorb_extract_knowledge',
    {
      minConfidence: body.minConfidence ?? 0.5,
      maxPerType: body.maxPerType ?? 20,
      includeSpeculative: body.includeSpeculative ?? false,
      workspaceId: projectId,
    },
    userToken
  );

  if (mcpResult.ok && mcpResult.data) {
    return NextResponse.json(mcpResult.data);
  }

  // Strategy 2: Try the absorb service REST API
  const restResult = await callAbsorbRest(projectId, JSON.stringify(body), userToken);

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

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
