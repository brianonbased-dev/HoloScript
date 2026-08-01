export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  hasNoQuery,
  jsonError,
  parseIdempotencyKey,
  parseSourceText,
  parseTeamId,
  proxyUserComputeRequest,
  readExactJsonObject,
} from '../_lib/computeProxy';

/**
 * Submit one compiler-authored compute job for the authenticated user's HoloMesh identity.
 * Body keys are exact: { teamId, sourceText, idempotencyKey }.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!hasNoQuery(request.url)) return jsonError(400, 'invalid_compute_submit_request');

  const body = await readExactJsonObject(request, ['teamId', 'sourceText', 'idempotencyKey']);
  const teamId = body ? parseTeamId(body.teamId) : null;
  const sourceText = body ? parseSourceText(body.sourceText) : null;
  const idempotencyKey = body ? parseIdempotencyKey(body.idempotencyKey) : null;
  if (!teamId || !sourceText || !idempotencyKey) {
    return jsonError(400, 'invalid_compute_submit_request');
  }

  return proxyUserComputeRequest({
    ownerId: auth.user.id,
    method: 'POST',
    upstreamPath: `/api/holomesh/team/${encodeURIComponent(teamId)}/compute/jobs`,
    body: { source_text: sourceText, idempotency_key: idempotencyKey },
  });
}
