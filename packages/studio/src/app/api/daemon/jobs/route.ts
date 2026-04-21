export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { readJsonBody } from '../../_lib/body-size';
import {
  createDaemonJob,
  listDaemonJobs,
  getTelemetrySummary,
  type CreateDaemonJobInput,
} from './store';

// SEC-T02: Daemon jobs formerly accepted `projectPath` from any unauthenticated
// caller and piped it into shell-invoked rsync/robocopy. This route now requires
// an authenticated session, validates the payload with Zod, and constrains
// projectPath to the workspaces root used by the rest of the git tooling.
const WORKSPACE_ROOT = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(),
  '.holoscript',
  'workspaces'
);

const CreateJobSchema = z.object({
  projectId: z.string().min(1).max(256),
  profile: z.enum(['quick', 'balanced', 'deep']),
  projectDna: z.object({}).passthrough(),
  projectPath: z.string().min(1).max(512).optional(),
  customLimits: z.object({}).passthrough().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  // GET /api/daemon/jobs?view=telemetry — return telemetry summary
  if (view === 'telemetry') {
    return NextResponse.json({ telemetry: getTelemetrySummary() });
  }

  return NextResponse.json({ jobs: listDaemonJobs() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // SEC-T17: cap body bytes. Daemon job payloads are small — projectId +
  // profile enum + projectDna metadata. 16KB leaves headroom for projectDna
  // blobs while keeping this well under the 300s maxDuration abuse lane.
  const readResult = await readJsonBody<unknown>(request, { maxBytes: 16_384 });
  if (!readResult.ok) {
    const msg = readResult.error === 'payload_too_large' ? 'Body exceeds 16KB limit' : 'Invalid JSON body';
    return NextResponse.json({ error: msg }, { status: readResult.status });
  }
  const raw: unknown = readResult.body;

  const parsed = CreateJobSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // SEC-T02: projectPath must resolve inside WORKSPACE_ROOT. This is the same
  // containment pattern used by /api/git/commit and /api/git/push.
  if (body.projectPath !== undefined) {
    const resolved = path.resolve(body.projectPath);
    if (!resolved.startsWith(WORKSPACE_ROOT + path.sep) && resolved !== WORKSPACE_ROOT) {
      return NextResponse.json(
        { error: 'projectPath must be inside ~/.holoscript/workspaces' },
        { status: 400 }
      );
    }
  }

  const created = createDaemonJob({
    projectId: body.projectId,
    profile: body.profile,
    projectDna: body.projectDna as unknown as CreateDaemonJobInput['projectDna'],
    projectPath: body.projectPath,
    customLimits: body.customLimits as CreateDaemonJobInput['customLimits'],
  });

  return NextResponse.json({ job: created }, { status: 201 });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
