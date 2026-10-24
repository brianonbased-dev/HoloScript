
export const maxDuration = 300;

import * as path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/app/api/github/_shared';
import { ABSORB_BASE } from '@/lib/services/absorb-client';
import { findDurableAbsorbProject, recordAbsorbJob } from '@/lib/absorb/projectState';

import { corsHeaders } from '../../../../_lib/cors';

/**
 * Run an absorb scan for one project.
 *
 * BRIDGE (2026-10-20): this route used to call the MCP tool absorb_run_absorb.
 * That tool's handler (packages/absorb-service/src/mcp/absorb-tools.ts,
 * handleRunAbsorb) proxies straight back to THIS route, so Studio -> MCP ->
 * Studio -> MCP looped until something timed out, and its HTTP fallback
 * targeted /api/absorb/projects/:id/absorb, which absorb-service does not
 * have (404). It now calls absorb-service's own POST /api/absorb/scan once,
 * directly. One request, one possible charge, no retry on another path.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const scanPath = resolveScanPath(projectId);
  if (!scanPath) {
    return NextResponse.json(
      {
        error: `No local path is known for project "${projectId}", so there is nothing to scan.`,
        reason: 'absorb_no_project_path',
      },
      { status: 404 }
    );
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

  // A scan is paid: absorb must charge the caller's own credential. Without it
  // there is no payer, so refuse here (no service-key fallback, #616 / #654).
  // It is the signed-in user's own credential, resolved server-side from the session
  // (cookie or JWT), never from a client header and never the service key.
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

  let failure: string;
  let status = 502;
  try {
    const res = await fetch(`${ABSORB_BASE}/api/absorb/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...scanAuth(userToken) },
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
 * The folder to scan: the saved project's localPath, or the id itself when it
 * is already an absolute path (absorb_run_absorb sends the workspace path as
 * its projectId).
 */
function resolveScanPath(projectId: string): string | null {
  const project = findDurableAbsorbProject({ projectId, projectPath: projectId });
  if (project?.localPath) return project.localPath;
  return path.isAbsolute(projectId) ? projectId : null;
}

/**
 * A scan is paid: only the caller's own credential is sent, never the service
 * key, so the key alone never reaches /scan (closes #616's fallback, as #654).
 */
function scanAuth(userToken: string): Record<string, string> {
  return { Authorization: `Bearer ${userToken}` };
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
