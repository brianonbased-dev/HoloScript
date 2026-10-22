export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { findDurableAbsorbProject } from '@/lib/absorb/projectState';
import { assertWorkspaceOwner, callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';
import {
  ABSORB_PROGRESS_CONTRACT_VERSION,
  toAbsorbProgressContractEvent,
} from '@/lib/absorbStreamContract';
import { createSSEHeartbeatStream, resolveReconnectCursor } from '@/lib/sseStreamProxy';

import { ENDPOINTS } from '@holoscript/config';

import { corsHeaders } from '../../../../../_lib/cors';
const ABSORB_SERVICE_URL = ENDPOINTS.ABSORB_SERVICE;

/**
 * Owner check (matches POST /api/absorb/projects/[id]/absorb, #618):
 *   - A signed-in session is required (401 otherwise).
 *   - The id is a saved workspace id, looked up by id only. It must be owned by
 *     the caller and its localPath must resolve inside that workspace
 *     (assertWorkspaceOwner). Every refusal is the same 404.
 *   - Studio's service key goes only together with the owner's own credential
 *     in X-User-Authorization. A client Authorization header that is not the
 *     session owner's own credential is 403; the key never stands in alone.
 *   - Only an allowlisted body is forwarded (projectId from the URL, depth,
 *     tier, languages), never the raw POST body.
 */
const DEPTHS = new Set(['shallow', 'deep']);
const TIERS = new Set(['low', 'medium', 'high']);

/** At most this many languages, each a short language tag (Mapping, #621). */
export const MAX_LANGUAGES = 20;
export const MAX_LANGUAGE_LENGTH = 32;
const LANGUAGE_TAG = /^[A-Za-z0-9+#._-]+$/;

type StreamBody = { projectId: string; depth: string; tier: string; languages?: string[] };

/**
 * The only body sent upstream. A missing depth or tier takes its default; a
 * present but invalid one, or an invalid languages list, is a 400.
 */
function allowlistedBody(
  projectId: string,
  input: Record<string, unknown>
): { body: StreamBody } | { invalid: string } {
  const depth = input.depth ?? 'shallow';
  const tier = input.tier ?? 'medium';
  if (typeof depth !== 'string' || !DEPTHS.has(depth)) {
    return { invalid: `depth must be one of: ${[...DEPTHS].join(', ')}` };
  }
  if (typeof tier !== 'string' || !TIERS.has(tier)) {
    return { invalid: `tier must be one of: ${[...TIERS].join(', ')}` };
  }
  const body: StreamBody = { projectId, depth, tier };
  if (input.languages !== undefined) {
    const langs = input.languages;
    if (
      !Array.isArray(langs) ||
      langs.length > MAX_LANGUAGES ||
      !langs.every(
        (l) => typeof l === 'string' && l.length >= 1 && l.length <= MAX_LANGUAGE_LENGTH && LANGUAGE_TAG.test(l)
      )
    ) {
      return {
        invalid: `languages must be at most ${MAX_LANGUAGES} language tags of 1-${MAX_LANGUAGE_LENGTH} characters`,
      };
    }
    body.languages = langs as string[];
  }
  return { body };
}

function invalidBody(message: string): Response {
  return NextResponse.json({ error: message, reason: 'absorb_invalid_request' }, { status: 400 });
}

function ownsWorkspace(projectId: string, session: Parameters<typeof assertWorkspaceOwner>[0]): boolean {
  const ownerId = callerUserId(session);
  const project = findDurableAbsorbProject({ projectId });
  if (!project || project.id !== projectId || !ownerId || project.ownerId !== ownerId) return false;
  if (!project.localPath) return false;
  const owned = assertWorkspaceOwner(session, project.localPath);
  return owned.ok && owned.workspaceId === projectId;
}

const MISMATCH = Symbol('credential-not-session-owner');

async function userAuthorization(req: NextRequest): Promise<string | null | typeof MISMATCH> {
  let sessionAuth: string | null = null;
  try {
    // userOnly: a server-wide GitHub token must never stand in for the caller.
    const token = await getGitHubToken(req, { userOnly: true });
    sessionAuth = token ? `Bearer ${token}` : null;
  } catch {
    sessionAuth = null;
  }
  const header = req.headers.get('authorization')?.trim();
  if (header && header !== sessionAuth) return MISMATCH;
  return sessionAuth;
}

/** The owner's upstream headers, or the refusal to send instead. */
async function guard(
  req: NextRequest,
  projectId: string
): Promise<{ headers: Record<string, string> } | { refusal: Response }> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !callerUserId(session)) {
    return { refusal: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (!ownsWorkspace(projectId, session)) {
    return {
      refusal: NextResponse.json(
        { error: 'Workspace not found', reason: 'absorb_no_project_path' },
        { status: 404 }
      ),
    };
  }
  const userAuth = await userAuthorization(req);
  if (userAuth === MISMATCH) {
    return {
      refusal: NextResponse.json(
        {
          error: "The credential sent is not the signed-in user's own.",
          reason: 'absorb_credential_not_session_owner',
        },
        { status: 403 }
      ),
    };
  }
  if (!userAuth) {
    return {
      refusal: NextResponse.json(
        { error: 'Absorb needs your own credential; sign in again.', reason: 'absorb_no_user_credential' },
        { status: 401 }
      ),
    };
  }
  return {
    headers: ABSORB_API_KEY
      ? { Authorization: `Bearer ${ABSORB_API_KEY}`, 'X-User-Authorization': userAuth }
      : { Authorization: userAuth },
  };
}

async function proxyStream(
  req: NextRequest,
  projectId: string,
  bodyText: string,
  authHeaders: Record<string, string>
): Promise<Response> {
  try {
    const cursor = resolveReconnectCursor(req);

    const res = await fetch(`${ABSORB_SERVICE_URL}/api/absorb/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(cursor ? { 'Last-Event-ID': cursor, 'X-Reconnect-Cursor': cursor } : {}),
        ...authHeaders,
      },
      body: bodyText,
    });

    if (!res.ok) {
      // The upstream text stays in the server log (truncated); the client gets
      // a generic reason, never absorb's raw body (Mapping, #621).
      const errText = await res.text().catch(() => '(body unreadable)');
      console.error(
        `[API absorb/projects/[id]/absorb/stream] upstream HTTP ${res.status} for ${projectId}: ${errText.slice(0, 300)}`
      );
      return new Response(
        JSON.stringify({ error: 'The absorb stream could not start.', reason: 'absorb_upstream_failed', status: res.status }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!res.body) {
      return new Response(
        JSON.stringify({ error: 'Absorb service returned an empty stream body.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(createSSEHeartbeatStream(res.body, { cursor }), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-HoloScript-Stream-Contract': ABSORB_PROGRESS_CONTRACT_VERSION,
        ...(cursor ? { 'X-Reconnect-Cursor': cursor } : {}),
      },
    });
  } catch (error) {
    console.error(
      `[API absorb/projects/[id]/absorb/stream] upstream threw for ${projectId}: ${error instanceof Error ? error.message : String(error)}`
    );
    const event = toAbsorbProgressContractEvent({
      type: 'error',
      status: 'failed',
      jobId: projectId,
      // Generic for the client; the thrown text goes to the server log only.
      error: 'The absorb service is unavailable.',
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-HoloScript-Stream-Contract': ABSORB_PROGRESS_CONTRACT_VERSION,
      },
    });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await params;
  const g = await guard(req, projectId);
  if ('refusal' in g) return g.refusal;
  const q = req.nextUrl.searchParams;
  const checked = allowlistedBody(projectId, {
    depth: q.get('depth') ?? undefined,
    tier: q.get('tier') ?? undefined,
  });
  if ('invalid' in checked) return invalidBody(checked.invalid);
  return proxyStream(req, projectId, JSON.stringify(checked.body), g.headers);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await params;
  const g = await guard(req, projectId);
  if ('refusal' in g) return g.refusal;
  let input: Record<string, unknown> = {};
  const raw = await req.text();
  if (raw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Invalid JSON body: ${message}` }, { status: 400 });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
    }
    input = parsed as Record<string, unknown>;
  }
  // Only the allowlisted fields go upstream; projectId always comes from the URL.
  const checked = allowlistedBody(projectId, input);
  if ('invalid' in checked) return invalidBody(checked.invalid);
  return proxyStream(req, projectId, JSON.stringify(checked.body), g.headers);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
