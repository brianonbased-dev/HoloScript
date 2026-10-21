
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { findDurableAbsorbProject, recordAbsorbJob } from '@/lib/absorb/projectState';
import { callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';

import { corsHeaders } from '../../_lib/cors';

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    cached: false,
    hint: 'POST { workspaceId, importId, depth } to absorb an imported workspace.',
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
export async function POST(req: NextRequest) {
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
  const importId = typeof body.importId === 'string' ? body.importId : '';
  if (!/^[A-Za-z0-9-]{8,100}$/.test(importId)) {
    return NextResponse.json({ error: 'importId is required' }, { status: 400 });
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

  const scanBody = {
    repoUrl: project.sourceUrl,
    ...(branch ? { branch } : {}),
    importId,
    projectId: workspaceId,
    shallow: body.depth === 'shallow',
  };

  // Studio authenticates with its service key; the user is identified to
  // absorb by their own GitHub token, exactly like /api/absorb/credits.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ABSORB_API_KEY) headers.Authorization = `Bearer ${ABSORB_API_KEY}`;
  const userToken = await getGitHubToken(req, { userOnly: true }).catch(() => null);
  if (userToken) headers['X-User-Authorization'] = `Bearer ${userToken}`;

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
        projectId: workspaceId,
        source: 'http',
        depth: body.depth,
        request: { workspaceId, importId, depth: body.depth },
        result: data,
      });
      return NextResponse.json(data);
    }
    const text = await res.text().catch((err: unknown) => `(body unreadable: ${String(err)})`);
    failure = `absorb /scan HTTP ${res.status}: ${text.slice(0, 300)}`;
    if ([400, 402, 403, 413, 504].includes(res.status)) status = res.status;
  } catch (err) {
    failure = `absorb /scan threw: ${err instanceof Error ? err.message : String(err)}`;
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
  return NextResponse.json(
    {
      error:
        message[status] ??
        'Absorb could not run: the absorb service did not answer. Details are in the server log.',
      reason: status === 502 ? 'absorb_upstream_failed' : 'absorb_refused',
    },
    { status }
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, OPTIONS' }),
  });
}
