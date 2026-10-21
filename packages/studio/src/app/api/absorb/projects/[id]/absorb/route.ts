export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { findDurableAbsorbProject, recordAbsorbJob } from '@/lib/absorb/projectState';
import { assertWorkspaceOwner, callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';

import { corsHeaders } from '../../../../_lib/cors';

/**
 * Run an absorb scan for one of the CALLER's saved workspaces.
 *
 * BRIDGE (2026-10-20): this route used to call the MCP tool absorb_run_absorb,
 * which proxied back here (a loop). It now calls absorb-service's own
 * POST /api/absorb/scan once, directly.
 *
 * Owner check (2026-10-21, card-absorb-projects-route-owner-check):
 *   - A signed-in session is required (401 otherwise).
 *   - The id is a saved workspace id only. It is looked up by id, never by
 *     path, and the URL id is never treated as a filesystem path.
 *   - The workspace must be owned by the caller and its localPath must resolve
 *     inside that workspace under the workspaces root (assertWorkspaceOwner).
 *     Every refusal is the same 404, so a caller can't tell "not yours" from
 *     "does not exist".
 *   - Studio's service key is sent only together with the user's own identity
 *     in X-User-Authorization; it never stands in for a missing caller.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const session = await getServerSession(authOptions);
  const ownerId = callerUserId(session);
  if (!session?.user || !ownerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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
      console.error('[API absorb/projects/[id]/absorb] parsing request body failed:', message);
      return NextResponse.json({ error: `Invalid JSON body: ${message}` }, { status: 400 });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  }

  const scanPath = resolveOwnedScanPath(projectId, session);
  if (!scanPath) {
    return NextResponse.json(
      { error: 'Workspace not found', reason: 'absorb_no_project_path' },
      { status: 404 }
    );
  }

  const userAuth = await userAuthorization(req);
  if (!userAuth) {
    return NextResponse.json(
      {
        error: 'Absorb needs your own credential; sign in again.',
        reason: 'absorb_no_user_credential',
      },
      { status: 401 }
    );
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ABSORB_API_KEY) {
    headers.Authorization = `Bearer ${ABSORB_API_KEY}`;
    headers['X-User-Authorization'] = userAuth;
  } else {
    headers.Authorization = userAuth;
  }

  // Only the fields /scan reads. projectId is what lets absorb charge the
  // caller (it charges only an authenticated user with a projectId).
  const scanBody: { path: string; shallow: boolean; projectId: string; languages?: string[] } = {
    path: scanPath,
    shallow: (body.depth ?? 'shallow') === 'shallow',
    projectId,
  };
  if (Array.isArray(body.languages) && body.languages.every((l) => typeof l === 'string')) {
    scanBody.languages = body.languages as string[];
  }

  let failure: string;
  let status = 502;
  try {
    const res = await fetch(`${ABSORB_BASE}/api/absorb/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify(scanBody),
    });
    if (res.ok) {
      const data = await res.json();
      recordAbsorbJob({
        projectId,
        projectPath: scanPath,
        source: 'http',
        depth: body.depth,
        tier: body.tier,
        request: body,
        result: data,
      });
      return NextResponse.json(data);
    }
    const text = await res.text().catch((err: unknown) => `(body unreadable: ${String(err)})`);
    failure = `absorb /scan HTTP ${res.status}: ${text.slice(0, 300)}`;
    // Pass absorb's own refusals through (402 not enough credits, 403 path not
    // allowed, 400 bad request). Anything else is an upstream failure.
    if (res.status === 400 || res.status === 402 || res.status === 403) status = res.status;
  } catch (err) {
    failure = `absorb /scan threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  console.error(`[API absorb/projects/[id]/absorb] absorb failed for ${projectId}: ${failure}`);

  recordAbsorbJob({
    projectId,
    projectPath: scanPath,
    source: 'http',
    depth: body.depth,
    tier: body.tier,
    request: body,
    result: null,
    error: failure,
  });

  return NextResponse.json(
    status === 502
      ? {
          error:
            'Absorb could not run: the absorb service did not answer. Details are in the server log.',
          reason: 'absorb_upstream_failed',
        }
      : { error: 'Absorb refused this scan.', reason: 'absorb_refused', status },
    { status }
  );
}

/**
 * The folder to scan: the caller's own saved workspace's localPath, realpathed
 * and proven inside that workspace under the workspaces root. Looked up by
 * workspace id only; null (404) for anything else, including any raw path.
 */
function resolveOwnedScanPath(
  projectId: string,
  session: Parameters<typeof assertWorkspaceOwner>[0]
): string | null {
  const ownerId = callerUserId(session);
  const project = findDurableAbsorbProject({ projectId });
  if (!project || project.id !== projectId || !ownerId || project.ownerId !== ownerId) {
    return null;
  }
  if (!project.localPath) return null;
  const owned = assertWorkspaceOwner(session, project.localPath);
  if (!owned.ok || owned.workspaceId !== projectId) return null;
  return owned.resolved;
}

/** The user's own credential: the header they sent, else their session's GitHub token. */
async function userAuthorization(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization')?.trim();
  if (header) return header;
  try {
    // userOnly: a server-wide GitHub token must never stand in for the caller.
    const token = await getGitHubToken(req, { userOnly: true });
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
