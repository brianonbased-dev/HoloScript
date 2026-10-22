export const maxDuration = 300;

/**
 * The absorb call is cut before maxDuration, so Studio answers instead of the
 * platform killing the request. A cut call has an UNKNOWN outcome (absorb may
 * still finish and charge): it answers 502 absorb_outcome_unknown, and the
 * client keeps the workspace and retries with the SAME importId, which
 * replays a finished import at cost 0 (Treasurer, #617).
 */
export const ABSORB_FETCH_TIMEOUT_MS = 280_000;

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import {
  findDurableAbsorbProject,
  recordAbsorbJob,
  claimPendingAbsorbImportId,
  clearPendingAbsorbImportId,
  isAbsorbStateLockTimeout,
  type DurableAbsorbProject,
} from '@/lib/absorb/projectState';
import { withAbsorbStateLock503 } from '@/lib/absorb/stateLockResponse';
import { callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';

import { corsHeaders } from '../../_lib/cors';

/**
 * The pending importId lives on the SERVER, in the workspace's own row
 * (metadata.pendingImportId in Studio's absorb project state file, on the
 * workspaces volume), so it survives a reload, a new tab and a new device
 * (Mapping N1, #617). Written before the absorb call, cleared on success or
 * a definitive refusal. No database table or column.
 */
export function pendingImportIdOf(project: DurableAbsorbProject): string | null {
  const v = project.metadata.pendingImportId;
  return typeof v === 'string' && IMPORT_ID_RE.test(v) ? v : null;
}

const IMPORT_ID_RE = /^[A-Za-z0-9-]{8,100}$/;

/**
 * Statuses after which absorb has definitely not charged: the pending id is
 * cleared. 413 and 504 count only with absorb's OWN code in the body
 * (clone_too_large, clone_timeout); a gateway or proxy 413/504 (HTML or empty
 * body) is an unknown outcome and keeps the id (Mapping H1, #617). absorb's
 * /scan never answers 404 for a URL import, so a 404 always keeps it.
 */
const DEFINITIVE_REFUSALS = new Set([400, 401, 402, 403]);
const ABSORB_OWN_CODE: Record<number, string> = { 413: 'clone_too_large', 504: 'clone_timeout' };

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl?.searchParams.get('workspaceId');
  if (workspaceId) {
    const session = await getServerSession(authOptions);
    const ownerId = callerUserId(session);
    if (!session?.user || !ownerId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const project = findDurableAbsorbProject({ projectId: workspaceId });
    if (!project || project.ownerId !== ownerId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    return NextResponse.json({ workspaceId, pendingImportId: pendingImportIdOf(project) });
  }
  return NextResponse.json({
    cached: false,
    hint: 'POST { workspaceId, importId?, depth } to absorb an imported workspace. GET ?workspaceId= returns its pending importId.',
  });
}

/**
 * Absorb an imported workspace.
 *
 * absorb-service cannot see Studio's clone (separate Railway volumes), so
 * Studio no longer sends a local path. After checking that the caller owns
 * the workspace, it sends the workspace's GitHub URL and branch, and absorb
 * clones the repo itself under its own guards (clone-from-url.ts). One POST,
 * no MCP hop and no fallback: the importId makes a retry free, not a second
 * charge.
 */
async function postAbsorb(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown> = {};
  const rawBody = await req.text();
  if (rawBody.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Invalid JSON body: ${message}` }, { status: 400 });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  }

  const session = await getServerSession(authOptions);
  const ownerId = callerUserId(session);
  if (!session?.user || !ownerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
  if (!/^ws-[0-9a-f-]{36}$/.test(workspaceId)) {
    return NextResponse.json({ error: 'workspaceId must be a workspace id' }, { status: 400 });
  }
  const clientImportId = typeof body.importId === 'string' ? body.importId : null;
  if (clientImportId !== null && !IMPORT_ID_RE.test(clientImportId)) {
    return NextResponse.json(
      { error: 'importId must be 8-100 letters, digits or dashes' },
      { status: 400 }
    );
  }

  // Owner check: the same rule as DELETE /api/workspace/import.
  const project = findDurableAbsorbProject({ projectId: workspaceId });
  if (!project || project.ownerId !== ownerId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  if (!project.sourceUrl) {
    return NextResponse.json({ error: 'Workspace has no repository URL' }, { status: 409 });
  }
  const branch = typeof project.metadata.branch === 'string' ? project.metadata.branch : undefined;
  // The server's pending importId wins over whatever this client sends: a
  // reloaded page, another tab or another device retries the SAME import, so
  // absorb replays it instead of charging again (Mapping N1).
  // Saved BEFORE any await, first writer wins under the state file's lock
  // (Mapping N1): two first attempts from two devices get ONE importId.
  const importId = claimPendingAbsorbImportId(
    workspaceId,
    ownerId,
    clientImportId ?? `imp-${randomUUID()}`
  );
  if (!importId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const scanBody = {
    repoUrl: project.sourceUrl,
    ...(branch ? { branch } : {}),
    importId,
    projectId: workspaceId,
    shallow: body.depth === 'shallow',
  };

  // Studio authenticates with its service key; the user is identified to
  // absorb by their own GitHub token, exactly like /api/absorb/credits. The
  // key never goes alone (#618's rule): without the user's own credential
  // absorb has no payer, skips the claim and charges nothing (Treasurer, #617).
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ABSORB_API_KEY) {
    headers.Authorization = `Bearer ${ABSORB_API_KEY}`;
    headers['X-User-Authorization'] = `Bearer ${userToken}`;
  } else {
    headers.Authorization = `Bearer ${userToken}`;
  }

  let failure: string;
  let status = 502;
  let reason = 'absorb_upstream_failed';
  try {
    const res = await fetch(`${ABSORB_BASE}/api/absorb/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify(scanBody),
      signal: AbortSignal.timeout(ABSORB_FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      // H2 (#617): absorb has charged. Record the job and compare-and-clear
      // the pending id in ONE locked write. If the lock times out, nothing was
      // written: the id stays pending, so a retry replays at cost 0, and the
      // caller still gets the result (200), never a 503 that invites a
      // re-charge.
      try {
        recordAbsorbJob({
          projectId: workspaceId,
          source: 'http',
          depth: body.depth,
          request: { workspaceId, importId, depth: body.depth },
          result: data,
          clearPendingImportId: { ownerId, importId },
        });
      } catch (err) {
        if (!isAbsorbStateLockTimeout(err)) throw err;
        console.error(
          `[API daemon/absorb] absorb succeeded for ${workspaceId} (importId ${importId}) but the job record failed: state lock timeout; pending importId kept`
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
      // A proxy's 404/413/504: absorb may still have run. Unknown, not a refusal.
      reason = 'absorb_outcome_unknown';
    }
    if (res.status === 409) {
      // Pass absorb's own 409 code through (import_in_progress,
      // import_already_charged, import_claim_lost, import_id_reused).
      let code: unknown;
      try {
        code = (JSON.parse(text) as { error?: unknown }).error;
      } catch {
        code = undefined;
      }
      reason = typeof code === 'string' && /^import_[a-z_]+$/.test(code) ? code : 'import_conflict';
    }
    // Definitive: nothing was charged under this id (or it names another
    // repo), so the next attempt starts a new import. Anything else keeps it.
    if (
      DEFINITIVE_REFUSALS.has(res.status) ||
      (res.status in ABSORB_OWN_CODE && fromAbsorb) ||
      reason === 'import_id_reused'
    ) {
      clearPendingAbsorbImportId(workspaceId, ownerId, importId);
    }
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
        projectId: workspaceId,
        source: 'http',
        depth: body.depth,
        request: { workspaceId, importId, depth: body.depth },
        result: { status: 'complete', importId, alreadyCharged: true },
        clearPendingImportId: { ownerId, importId },
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
  console.error(`[API daemon/absorb] absorb failed for ${workspaceId}: ${failure}`);
  recordAbsorbJob({
    projectId: workspaceId,
    source: 'http',
    depth: body.depth,
    request: { workspaceId, importId, depth: body.depth },
    result: null,
    error: failure,
  });

  const message: Record<number, string> = {
    400: 'Absorb refused this repository URL or branch.',
    402: 'Not enough credits to absorb this repository.',
    403: 'Absorb refused this request.',
    413: 'This repository is too large to absorb.',
    504: 'Cloning this repository took too long.',
  };
  const conflict: Record<string, string> = {
    import_in_progress:
      'This import is still running. Retry shortly to get its result; you will not be charged twice.',
    import_already_charged:
      'This import was already charged but its result was not recorded. You will not be charged again.',
    import_claim_lost: 'Another request took over this import. This one was not charged.',
    import_id_reused: 'This import id belongs to a different repository or branch.',
    import_conflict: 'This import conflicts with another one. You were not charged twice.',
  };
  const error =
    status === 409
      ? (conflict[reason] ?? conflict.import_conflict)
      : reason === 'absorb_outcome_unknown'
        ? 'Absorb is taking longer than expected. Retry to get the result; you will not be charged twice.'
        : (message[status] ??
          'Absorb could not run: the absorb service did not answer. Details are in the server log.');
  return NextResponse.json({ error, reason, importId }, { status });
}

/** A state-file lock timeout answers 503 + Retry-After (Mapping N5, #617). */
export const POST = withAbsorbStateLock503(postAbsorb);

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, OPTIONS' }),
  });
}
