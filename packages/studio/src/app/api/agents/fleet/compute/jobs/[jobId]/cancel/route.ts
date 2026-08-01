export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  hasNoQuery,
  jsonError,
  parseAttempt,
  parseIdempotencyKey,
  parseJobId,
  parseTeamId,
  proxyUserComputeRequest,
  readExactJsonObject,
} from '../../../_lib/computeProxy';

/**
 * Cancel one compute job. Body keys are exact:
 * { teamId, attempt, expectedJobReceiptId, idempotencyKey }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!hasNoQuery(request.url)) return jsonError(400, 'invalid_compute_cancel_request');

  const { jobId: rawJobId } = await params;
  const jobId = parseJobId(rawJobId);
  const body = await readExactJsonObject(request, [
    'teamId',
    'attempt',
    'expectedJobReceiptId',
    'idempotencyKey',
  ]);
  const teamId = body ? parseTeamId(body.teamId) : null;
  const attempt = body ? parseAttempt(body.attempt) : null;
  const expectedJobReceiptId = body ? parseJobId(body.expectedJobReceiptId) : null;
  const idempotencyKey = body ? parseIdempotencyKey(body.idempotencyKey) : null;
  if (!jobId || !teamId || !attempt || !expectedJobReceiptId || !idempotencyKey) {
    return jsonError(400, 'invalid_compute_cancel_request');
  }

  return proxyUserComputeRequest({
    ownerId: auth.user.id,
    method: 'POST',
    upstreamPath:
      `/api/holomesh/team/${encodeURIComponent(teamId)}/compute/jobs/` +
      `${encodeURIComponent(jobId)}/cancel`,
    body: {
      attempt,
      expected_job_receipt_id: expectedJobReceiptId,
      reason_code: 'user_cancelled',
      idempotency_key: idempotencyKey,
    },
  });
}
