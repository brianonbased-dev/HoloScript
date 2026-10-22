export const maxDuration = 300;

/**
 * The absorb call is cut before maxDuration, so Studio answers instead of the
 * platform killing the request. A cut call has an UNKNOWN outcome: 502
 * absorb_outcome_unknown with the importId kept, so a retry replays.
 */
export const ABSORB_FETCH_TIMEOUT_MS = 280_000;

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import {
  claimPendingAbsorbImportIdDetailed,
  clearPendingAbsorbImportId,
  findDurableAbsorbProject,
  isAbsorbStateLockTimeout,
  recordAbsorbJob,
} from '@/lib/absorb/projectState';
import { withAbsorbStateLock503 } from '@/lib/absorb/stateLockResponse';

import { corsHeaders } from '../../../../_lib/cors';

const IMPORT_ID_RE = /^[A-Za-z0-9-]{8,100}$/;

/**
 * Same rules as /api/daemon/absorb (#617): statuses after which absorb has
 * definitely not charged clear the pending importId. 413 and 504 count only
 * with absorb's own JSON code; a proxy 404/413/504 is an unknown outcome and
 * keeps it.
 */
const DEFINITIVE_REFUSALS = new Set([400, 401, 402, 403]);
const ABSORB_OWN_CODE: Record<number, string> = { 413: 'clone_too_large', 504: 'clone_timeout' };

/**
 * Run an absorb scan for one project.
 *
 * BRIDGE (2026-10-20): this route used to call the MCP tool absorb_run_absorb.
 * That tool's handler (packages/absorb-service/src/mcp/absorb-tools.ts,
 * handleRunAbsorb) proxies straight back to THIS route, so Studio -> MCP ->
 * Studio -> MCP looped until something timed out, and its HTTP fallback
 * targeted /api/absorb/projects/:id/absorb, which absorb-service does not
 * have (404). It now calls absorb-service's own POST /api/absorb/scan once,
 * directly.
 *
 * importId (#617 follow-up): every scan carries one, so absorb's durable claim
 * and the ledger charge it at most once; a retry (dropped connection, double
 * click, reload) replays at cost 0. For a saved project with an owner the id
 * is stored server-side as the row's pending importId (first writer wins),
 * so a retry that sends no id still reuses it.
 */
async function postProjectAbsorb(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: projectId } = await params;

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
  const clientImportId = typeof body.importId === 'string' ? body.importId : null;
  if (
    body.importId !== undefined &&
    (clientImportId === null || !IMPORT_ID_RE.test(clientImportId))
  ) {
    return NextResponse.json(
      { error: 'importId must be 8-100 letters, digits or dashes' },
      { status: 400 }
    );
  }

  // H4 (#623): only the project's owner may scan it, or read, claim, clear
  // or record its pending importId. Same rule as /api/daemon/absorb: no
  // session is 401, another user's (or an ownerless or unknown) project is 404.
  const session = await getServerSession(authOptions);
  const ownerId = callerUserId(session);
  if (!session?.user || !ownerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const project = findDurableAbsorbProject({ projectId, projectPath: projectId });
  if (!project || project.ownerId !== ownerId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const scanPath = project.localPath;
  if (!scanPath) {
    return NextResponse.json(
      {
        error: `No local path is known for project "${projectId}", so there is nothing to scan.`,
        reason: 'absorb_no_project_path',
      },
      { status: 404 }
    );
  }

  // The server's pending importId wins over the client's, before any await.
  // H3 (#623): the folder scan has its OWN pending slot, separate from the
  // URL import's (/api/daemon/absorb), so neither route touches the other's id.
  const PENDING_KEY = 'pendingFolderImportId' as const;
  const candidate = clientImportId ?? `imp-${randomUUID()}`;
  // N19 (#623): remember whether THIS request stored the client's own id.
  const claim = claimPendingAbsorbImportIdDetailed(project.id, ownerId, candidate, PENDING_KEY);
  if (!claim) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const importId = claim.importId;
  const ownCandidateStoredNow = claim.storedNow && clientImportId !== null;
  const clearPending = () => {
    clearPendingAbsorbImportId(project.id, ownerId, importId, PENDING_KEY);
  };

  // N20 (#623): the charge is bound to the signed-in user's OWN token. There
  // is no service-key-only fallback: no user token is a 401 and nothing is
  // sent. The claim above stays first (before any await, Mapping N1).
  // N21 (#623): the pending id is NOT cleared here. Between the claim and
  // this await a concurrent same-owner request may have been handed the id
  // and sent it to absorb; clearing it would lose that request's unknown
  // outcome and let a retry charge twice. The next request's replay or
  // import_already_charged resolves it.
  const userToken = await getGitHubToken(req, { userOnly: true }).catch(() => null);
  if (!userToken) {
    return NextResponse.json(
      {
        error: 'Absorb needs your own credential; sign in again.',
        reason: 'absorb_no_user_credential',
      },
      { status: 401 }
    );
  }
  // Never the request's own Authorization header, never the service key alone
  // (that was a free, unclaimed scan): the key plus the user's own token.
  const scanHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ABSORB_API_KEY) {
    scanHeaders.Authorization = `Bearer ${ABSORB_API_KEY}`;
    scanHeaders['X-User-Authorization'] = `Bearer ${userToken}`;
  } else {
    scanHeaders.Authorization = `Bearer ${userToken}`;
  }

  // Only the fields /scan reads. projectId is what lets absorb charge the
  // caller; importId is what lets it charge once.
  const scanBody: {
    path: string;
    shallow: boolean;
    projectId: string;
    importId: string;
    languages?: string[];
  } = {
    path: scanPath,
    shallow: (body.depth ?? 'shallow') === 'shallow',
    projectId,
    importId,
  };
  if (Array.isArray(body.languages) && body.languages.every((l) => typeof l === 'string')) {
    scanBody.languages = body.languages as string[];
  }
  const recordRequest = { ...body, importId };

  let failure: string;
  let status = 502;
  let reason = 'absorb_upstream_failed';
  try {
    const res = await fetch(`${ABSORB_BASE}/api/absorb/scan`, {
      method: 'POST',
      headers: scanHeaders,
      body: JSON.stringify(scanBody),
      signal: AbortSignal.timeout(ABSORB_FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      // Record the job and compare-and-clear the pending id in ONE locked
      // write. On a lock timeout nothing is written: the id stays pending (a
      // retry replays at cost 0) and the caller still gets the result.
      try {
        recordAbsorbJob({
          projectId,
          projectPath: scanPath,
          source: 'http',
          depth: body.depth,
          tier: body.tier,
          request: recordRequest,
          result: data,
          clearPendingImportId: { ownerId, importId, key: PENDING_KEY },
        });
      } catch (err) {
        if (!isAbsorbStateLockTimeout(err)) throw err;
        console.error(
          `[API absorb/projects/[id]/absorb] scan succeeded for ${projectId} (importId ${importId}) but the job record failed: state lock timeout; pending importId kept`
        );
        return NextResponse.json({ ...data, importId, recordPending: true });
      }
      return NextResponse.json({ ...data, importId });
    }
    const text = await res.text().catch((err: unknown) => `(body unreadable: ${String(err)})`);
    failure = `absorb /scan HTTP ${res.status}: ${text.slice(0, 300)}`;
    let ownCode: unknown;
    try {
      ownCode = (JSON.parse(text) as { error?: unknown }).error;
    } catch {
      ownCode = undefined;
    }
    const fromAbsorb = !(res.status in ABSORB_OWN_CODE) || ownCode === ABSORB_OWN_CODE[res.status];
    if ([400, 402, 403, 409, 413, 504].includes(res.status) && fromAbsorb) {
      status = res.status;
      reason = 'absorb_refused';
    } else if (res.status in ABSORB_OWN_CODE || res.status === 404) {
      reason = 'absorb_outcome_unknown';
    }
    if (res.status === 409) {
      reason =
        typeof ownCode === 'string' && /^import_[a-z_]+$/.test(ownCode)
          ? ownCode
          : 'import_conflict';
    }
    if (DEFINITIVE_REFUSALS.has(res.status) || (res.status in ABSORB_OWN_CODE && fromAbsorb)) {
      clearPending();
    }
    // N19 (#623): see /api/daemon/absorb. Clear only our own just-stored id.
    if (reason === 'import_id_reused' && ownCandidateStoredNow) clearPending();
  } catch (err) {
    // A state-lock timeout is not an absorb failure: the route answers 503.
    if (isAbsorbStateLockTimeout(err)) throw err;
    failure = `absorb /scan threw: ${err instanceof Error ? err.message : String(err)}`;
    const name = (err as { name?: unknown } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') reason = 'absorb_outcome_unknown';
  }
  // N13 (#617 follow-up): absorb says this import was already charged but its
  // result was never recorded. It will never charge it again, so record the
  // job (the workspace is absorbed) and clear the pending id in one write.
  // import_in_progress keeps the id: absorb's own stale cutoff (15 min, then
  // a takeover that checks the ledger) resolves it to a result or to this.
  if (reason === 'import_already_charged') {
    try {
      recordAbsorbJob({
        projectId,
        projectPath: scanPath,
        source: 'http',
        depth: body.depth,
        request: recordRequest,
        result: { status: 'complete', importId, alreadyCharged: true },
        clearPendingImportId: { ownerId, importId, key: PENDING_KEY },
      });
    } catch (err) {
      if (!isAbsorbStateLockTimeout(err)) throw err;
      console.error(
        `[API] import ${importId} already charged; job record failed: state lock timeout`
      );
    }
    return NextResponse.json(
      {
        error: 'This import was already charged. You will not be charged again.',
        reason,
        importId,
        alreadyCharged: true,
      },
      { status: 409 }
    );
  }
  console.error(`[API absorb/projects/[id]/absorb] absorb failed for ${projectId}: ${failure}`);

  recordAbsorbJob({
    projectId,
    projectPath: scanPath,
    source: 'http',
    depth: body.depth,
    tier: body.tier,
    request: recordRequest,
    result: null,
    error: failure,
  });

  const error =
    reason === 'import_id_reused'
      ? ownCandidateStoredNow
        ? 'This import id belongs to a different folder or repository. It was not used; retry without it.'
        : "This workspace's pending import id is tied to a different repository or folder. It was kept so a possible earlier charge is not repeated; retry later or contact support to resolve it."
      : status === 409
        ? 'This import conflicts with another one, or is still running. Retry with the same importId; you will not be charged twice.'
        : reason === 'absorb_outcome_unknown'
          ? 'Absorb is taking longer than expected. Retry to get the result; you will not be charged twice.'
          : status === 502
            ? 'Absorb could not run: the absorb service did not answer. Details are in the server log.'
            : 'Absorb refused this scan.';
  return NextResponse.json({ error, reason, status, importId }, { status });
}

/** A state-file lock timeout answers 503 + Retry-After (Mapping N5, #617). */
export const POST = withAbsorbStateLock503(postProjectAbsorb);

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
