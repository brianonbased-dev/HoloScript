export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { assertWorkspaceOwner, callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';
import {
  callMcpTool,
  mcpClearlyDidNotRun,
  ABSORB_BASE,
  ABSORB_API_KEY,
} from '@/lib/services/absorb-client';
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

  const failures: string[] = [`MCP: ${mcpResult.error ?? 'absorb_run_absorb returned no result'}`];
  // Fall back to absorb's own /scan ONLY when the MCP tool clearly did not run
  // (connection refused, or a 4xx before the tool ran). After a timeout, a 5xx
  // or a JSON-RPC error the tool may have run and charged; a second paid path
  // could bill the same import twice, so report the failure instead.
  const scanBody = mcpClearlyDidNotRun(mcpResult) ? scanRequestFrom(body) : null;
  if (!scanBody) {
    failures.push(
      mcpClearlyDidNotRun(mcpResult)
        ? 'HTTP fallback skipped: no projectPath to scan'
        : `HTTP fallback skipped: MCP may have run (${mcpResult.failure ?? 'unknown'})`
    );
  }
  if (scanBody) {
    // The fallback bills the SESSION OWNER, and only them (CoS, #620). A caller
    // bearer that is not the owner's own credential is refused (403), as #618
    // does, instead of being billed through this second path.
    const payer = await fallbackPayer(req);
    if ('refusal' in payer) return payer.refusal;
    // The folder must be a workspace the session owner OWNS (as #618 does):
    // realpathed, inside the caller's own workspace under the workspaces root.
    // Anything else, including another user's workspace, is refused before
    // any paid /scan call; the realpath is what gets scanned.
    const owned = assertWorkspaceOwner(payer.session, scanBody.path);
    if (!owned.ok) {
      return NextResponse.json(
        { error: owned.error, reason: 'absorb_workspace_not_owned' },
        { status: owned.status }
      );
    }
    scanBody.path = owned.resolved;
    try {
      const res = await fetch(`${ABSORB_BASE}/api/absorb/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...payer.headers,
        },
        // Only the fields /scan reads, never the raw client body.
        body: JSON.stringify(scanBody),
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

  // The upstream text stays in the server log and the job record; the
  // client gets a short reason, never raw upstream bodies.
  const toolRanAndFailed = mcpResult.failure === 'tool_error' && !scanBody;
  return NextResponse.json(
    toolRanAndFailed
      ? {
          error: 'Absorb ran but reported an error. Details are in the server log.',
          reason: 'absorb_tool_error',
        }
      : {
          error:
            'Absorb could not run: the absorb service did not answer. Details are in the server log.',
          reason: 'absorb_upstream_failed',
        },
    { status: 502 }
  );
}

/**
 * The absorb /scan request built from what the MCP path sends
 * (projectPath -> path, depth -> shallow), plus optional languages and
 * projectId. Nothing else from the client body is forwarded. Null when there
 * is no path to scan.
 */
function scanRequestFrom(body: Record<string, unknown>): {
  path: string;
  shallow: boolean;
  languages?: string[];
  projectId?: string;
} | null {
  const path = typeof body.projectPath === 'string' ? body.projectPath.trim() : '';
  if (!path) return null;
  const scan: { path: string; shallow: boolean; languages?: string[]; projectId?: string } = {
    path,
    shallow: body.depth === 'shallow',
  };
  if (Array.isArray(body.languages) && body.languages.every((l) => typeof l === 'string')) {
    scan.languages = body.languages as string[];
  }
  if (typeof body.projectId === 'string' && body.projectId !== '') scan.projectId = body.projectId;
  return scan;
}

/**
 * Who the /scan fallback bills: the signed-in session owner, by their own
 * credential (the session's GitHub token, userOnly). Studio's service key goes
 * only together with it in X-User-Authorization, never alone.
 *   - no session: 401
 *   - a caller Authorization that is not the owner's own credential: 403
 *   - a session with no user credential: 401
 */
async function fallbackPayer(
  req: NextRequest
): Promise<{ headers: Record<string, string>; session: { user?: { id?: string | null } | null } } | { refusal: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !callerUserId(session)) {
    return { refusal: NextResponse.json({ error: 'Not authenticated', reason: 'absorb_not_authenticated' }, { status: 401 }) };
  }
  let ownerAuth: string | null = null;
  try {
    const token = await getGitHubToken(req, { userOnly: true });
    ownerAuth = token ? `Bearer ${token}` : null;
  } catch {
    ownerAuth = null;
  }
  const header = req.headers.get('authorization')?.trim();
  if (header && header !== ownerAuth) {
    return {
      refusal: NextResponse.json(
        { error: "The credential sent is not the signed-in user's own.", reason: 'absorb_credential_not_session_owner' },
        { status: 403 }
      ),
    };
  }
  if (!ownerAuth) {
    return {
      refusal: NextResponse.json(
        { error: 'Absorb needs your own credential; sign in again.', reason: 'absorb_no_user_credential' },
        { status: 401 }
      ),
    };
  }
  return {
    session,
    headers: ABSORB_API_KEY
      ? { Authorization: `Bearer ${ABSORB_API_KEY}`, 'X-User-Authorization': ownerAuth }
      : { Authorization: ownerAuth },
  };
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
