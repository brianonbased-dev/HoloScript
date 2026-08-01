export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  jsonError,
  parseJobId,
  parseStatusQuery,
  proxyUserComputeRequest,
} from '../../_lib/computeProxy';

/** GET one compute job. Query keys are exact: ?teamId=...&attempt=... */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { jobId: rawJobId } = await params;
  const jobId = parseJobId(rawJobId);
  const query = parseStatusQuery(request.url);
  if (!jobId || !query) return jsonError(400, 'invalid_compute_job_reference');

  return proxyUserComputeRequest({
    ownerId: auth.user.id,
    method: 'GET',
    upstreamPath:
      `/api/holomesh/team/${encodeURIComponent(query.teamId)}/compute/jobs/` +
      `${encodeURIComponent(jobId)}?attempt=${query.attempt}`,
  });
}
