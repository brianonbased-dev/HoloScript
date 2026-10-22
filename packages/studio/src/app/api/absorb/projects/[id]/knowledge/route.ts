export const maxDuration = 300;

/**
 * POST /api/absorb/projects/:id/knowledge
 *
 * Knowledge extraction for one saved workspace. Calls the
 * absorb_extract_knowledge MCP tool.
 *
 * Guard (matches /api/absorb/projects/[id]/absorb and its stream route):
 *   - A signed-in session is required (401).
 *   - The id is a saved workspace owned by the caller whose localPath resolves
 *     inside that workspace (assertWorkspaceOwner). Unknown, ownerless and
 *     other users' workspaces all get the same 404.
 *   - The call carries the owner's own credential (their session GitHub token,
 *     userOnly) in X-User-Authorization next to Studio's service key. The
 *     service key is never sent alone: no owner credential is 401. The client's
 *     own Authorization header is never read or forwarded, so no other identity
 *     can be charged. There is no key-only REST fallback.
 *   - Only an allowlisted body is used. An optional `url` is fetched here by
 *     fetchPageSafely (http/https only, every resolved address checked, the
 *     checked address pinned, each redirect re-checked, size/time/type capped);
 *     only its text goes upstream, never the URL, so absorb never fetches it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MCP_SERVER_URL, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { findDurableAbsorbProject } from '@/lib/absorb/projectState';
import { assertWorkspaceOwner, callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';
import { fetchPageSafely, UnsafeUrlError } from '@/lib/security/safeFetchPage';

import { corsHeaders } from '../../../../_lib/cors';

type ExtractionArgs = {
  minConfidence: number;
  maxPerType: number;
  includeSpeculative: boolean;
  url?: string;
};

function allowlisted(input: Record<string, unknown>): { args: ExtractionArgs } | { invalid: string } {
  const minConfidence = input.minConfidence ?? 0.5;
  const maxPerType = input.maxPerType ?? 20;
  const includeSpeculative = input.includeSpeculative ?? false;
  if (typeof minConfidence !== 'number' || !(minConfidence >= 0 && minConfidence <= 1)) {
    return { invalid: 'minConfidence must be a number from 0 to 1' };
  }
  if (typeof maxPerType !== 'number' || !Number.isInteger(maxPerType) || maxPerType < 1 || maxPerType > 100) {
    return { invalid: 'maxPerType must be an integer from 1 to 100' };
  }
  if (typeof includeSpeculative !== 'boolean') return { invalid: 'includeSpeculative must be a boolean' };
  const args: ExtractionArgs = { minConfidence, maxPerType, includeSpeculative };
  if (input.url !== undefined) {
    if (typeof input.url !== 'string' || !input.url.trim() || input.url.length > 2048) {
      return { invalid: 'url must be a non-empty string of at most 2048 characters' };
    }
    args.url = input.url.trim();
  }
  return { args };
}

function ownsWorkspace(projectId: string, session: Parameters<typeof assertWorkspaceOwner>[0]): boolean {
  const ownerId = callerUserId(session);
  const project = findDurableAbsorbProject({ projectId });
  if (!project || project.id !== projectId || !ownerId || project.ownerId !== ownerId) return false;
  if (!project.localPath) return false;
  const owned = assertWorkspaceOwner(session, project.localPath);
  return owned.ok && owned.workspaceId === projectId;
}

/** The session owner's own credential; the request's Authorization header is ignored. */
async function userAuthorization(req: NextRequest): Promise<string | null> {
  try {
    // userOnly: a server-wide GitHub token must never stand in for the caller.
    const token = await getGitHubToken(req, { userOnly: true });
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user || !callerUserId(session)) return json(401, { error: 'Not authenticated' });
  if (!ownsWorkspace(projectId, session)) {
    return json(404, { error: 'Workspace not found', reason: 'absorb_no_project' });
  }
  const userAuth = await userAuthorization(req);
  if (!userAuth) {
    return json(401, {
      error: 'Knowledge extraction needs your own credential; sign in again.',
      reason: 'absorb_no_user_credential',
    });
  }

  let input: Record<string, unknown> = {};
  const raw = await req.text();
  if (raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(400, { error: 'Invalid JSON body', reason: 'absorb_invalid_request' });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json(400, { error: 'JSON body must be an object', reason: 'absorb_invalid_request' });
    }
    input = parsed as Record<string, unknown>;
  }
  const checked = allowlisted(input);
  if ('invalid' in checked) return json(400, { error: checked.invalid, reason: 'absorb_invalid_request' });
  const { url, ...options } = checked.args;

  const toolArgs: Record<string, unknown> = { ...options, workspaceId: projectId };
  if (url) {
    try {
      const page = await fetchPageSafely(url);
      if (!page.bodyText.trim()) {
        return json(422, { error: 'The page has no text to extract.', reason: 'url_empty_page' });
      }
      // Only the text goes upstream; absorb never fetches the caller's URL.
      toolArgs.bodyText = page.bodyText;
      if (page.title) toolArgs.title = page.title;
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return json(400, { error: err.message, reason: `url_${err.reason}` });
      }
      console.error('[knowledge] page fetch failed:', err instanceof Error ? err.message : String(err));
      return json(400, { error: 'The page could not be fetched.', reason: 'url_fetch_failed' });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(ABSORB_API_KEY
      ? { Authorization: `Bearer ${ABSORB_API_KEY}`, 'X-User-Authorization': userAuth }
      : { Authorization: userAuth }),
  };

  try {
    const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers,
      redirect: 'error',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'absorb_extract_knowledge', arguments: toolArgs },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[knowledge] MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        return json(res.status, { error: 'Knowledge extraction was refused.', reason: 'absorb_refused' });
      }
      return json(502, { error: 'Knowledge extraction failed.', reason: 'absorb_upstream_failed' });
    }
    const body = await res.json();
    if (body.error) {
      console.error('[knowledge] MCP error:', JSON.stringify(body.error).slice(0, 300));
      return json(502, { error: 'Knowledge extraction failed.', reason: 'absorb_upstream_failed' });
    }
    const textContent = body.result?.content?.[0]?.text;
    if (textContent) {
      try {
        return NextResponse.json(JSON.parse(textContent));
      } catch {
        return NextResponse.json({ text: textContent });
      }
    }
    return NextResponse.json(body.result ?? {});
  } catch (err) {
    console.error('[knowledge] MCP request failed:', err instanceof Error ? err.message : String(err));
    return json(502, { error: 'Knowledge extraction failed.', reason: 'absorb_upstream_failed' });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}