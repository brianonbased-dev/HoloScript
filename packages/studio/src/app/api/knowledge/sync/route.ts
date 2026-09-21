import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { resolveWorkspaceIdForIdentity } from '@/lib/workspace/workspaceIdentity';

const KNOWLEDGE_SYNC_ENDPOINT =
  'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync';

/** Studio's own callers file one entry at a time; this is headroom, not a target. */
const MAX_ENTRIES = 50;
const MAX_CONTENT_CHARS = 20_000;

type StudioSession = Exclude<Awaited<ReturnType<typeof requireAuth>>, NextResponse>;

/**
 * The caller's OWN upstream credential, if they sent one.
 *
 * The upstream reads the key from `x-mcp-api-key` and never consults
 * `Authorization` (mcp-orchestrator, src/middleware/coreMiddleware.ts), so a
 * caller who presents a bearer key has it forwarded in the header the upstream
 * actually reads. Accepting a header and then sending it somewhere it is never
 * looked at is a promise that fails silently.
 *
 * A `bk_` bearer is deliberately NOT treated as a mesh key: those are Studio's
 * own API keys. Presenting one upstream would hand a Studio credential to a
 * different service, which records the presented key when validation fails.
 */
function callerMeshKey(request: Request): string | null {
  const meshKey = request.headers.get('x-mcp-api-key')?.trim();
  if (meshKey) return meshKey;

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (bearer && !bearer.startsWith('bk_')) return bearer;

  return null;
}

/**
 * POST /api/knowledge/sync — the WRITE side of the knowledge store. The W/P/G
 * filing form and the in-development annotation overlay file entries here.
 *
 * Doors audit 2026-09-15. Its read sibling, POST /api/knowledge/query, was
 * closed in 886264d9f. This file had not been touched since 33f2b3e49 and had
 * no guard of any kind: it attached Studio's own server key to whatever body
 * arrived and posted it to a real upstream endpoint that accepts writes, so
 * anyone on the internet could write into the knowledge store as us.
 * `src/proxy.ts` cannot help — its matcher skips `/api` entirely.
 *
 * Now:
 *  - a caller who sends their own mesh key runs as themselves: exactly that key
 *    is forwarded and nothing of ours is attached;
 *  - a caller who sends no key must be signed in to Studio, and the write is
 *    scoped to that user's own workspace — otherwise any signed-in stranger
 *    could file into the founder's workspace;
 *  - only the fields Studio's own callers send are forwarded, so a caller can
 *    no longer choose arbitrary upstream write fields.
 */
export async function POST(req: Request) {
  const meshKey = callerMeshKey(req);

  let session: StudioSession | null = null;
  if (!meshKey) {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) {
      return NextResponse.json(
        {
          error:
            'Sign in to HoloScript Studio to file knowledge, or send your own mesh API key as "x-mcp-api-key: <your key>" to file it as yourself.',
          signInRequired: true,
        },
        { status: 401 }
      );
    }
    session = auth;
  }

  let raw: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    raw = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const submitted = Array.isArray(raw.entries) ? raw.entries : null;
  if (!submitted || submitted.length === 0) {
    return NextResponse.json(
      { error: 'Nothing to file: "entries" must be a non-empty array.' },
      { status: 400 }
    );
  }
  if (submitted.length > MAX_ENTRIES) {
    return NextResponse.json(
      { error: `Too many entries in one call: at most ${MAX_ENTRIES}.` },
      { status: 400 }
    );
  }

  const requestedWorkspaceId = typeof raw.workspace_id === 'string' ? raw.workspace_id : null;
  // A caller running under their own mesh key is scoped by the mesh itself, so
  // the workspace they name is theirs to choose. A Studio session is not: the
  // same helper the filing form uses resolves the session's own workspace, and
  // it refuses the founder workspace to everyone but the founder.
  const workspaceId = session
    ? resolveWorkspaceIdForIdentity(session.user, { requestedWorkspaceId })
    : requestedWorkspaceId;

  const entries: Array<Record<string, unknown>> = [];
  for (const candidate of submitted) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return NextResponse.json({ error: 'Each entry must be an object.' }, { status: 400 });
    }
    const source = candidate as Record<string, unknown>;
    const content = typeof source.content === 'string' ? source.content.trim() : '';
    if (!content) {
      return NextResponse.json(
        { error: 'Each entry needs "content" — nothing was filed.' },
        { status: 400 }
      );
    }

    const entry: Record<string, unknown> = { content: content.slice(0, MAX_CONTENT_CHARS) };
    if (typeof source.id === 'string') entry.id = source.id;
    if (typeof source.type === 'string') entry.type = source.type;
    if (typeof source.domain === 'string') entry.domain = source.domain;
    if (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) {
      entry.metadata = source.metadata;
    }
    if (workspaceId) entry.workspace_id = workspaceId;
    entries.push(entry);
  }

  const payload: Record<string, unknown> = { entries };
  if (workspaceId) payload.workspace_id = workspaceId;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (meshKey) {
    headers['x-mcp-api-key'] = meshKey;
  } else {
    // Server-only key. NEXT_PUBLIC_* is deliberately not a fallback: Next
    // inlines those into the browser bundle, so one would be readable by every
    // visitor and could never be a server credential.
    const serverKey = process.env.HOLOSCRIPT_API_KEY;
    if (!serverKey) {
      return NextResponse.json(
        { error: 'Studio is not configured to file knowledge for a signed-in caller.' },
        { status: 503 }
      );
    }
    headers['x-mcp-api-key'] = serverKey;
  }

  try {
    const response = await fetch(KNOWLEDGE_SYNC_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // The upstream body is not echoed back: it is written for the holder of
      // the key, not for whoever managed to reach this route.
      return NextResponse.json(
        { error: `Knowledge sync was refused upstream (${response.status}).` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Knowledge sync failed', details: message }, { status: 502 });
  }
}
