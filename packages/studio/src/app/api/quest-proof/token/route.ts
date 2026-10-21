import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import {
  QUEST_PROOF_TOKEN_DEFAULT_TTL_S,
  mintQuestProofToken,
  questProofTokenExp,
  safeRunId,
} from '@/lib/questProofCapture';

export const runtime = 'nodejs';

/**
 * GET /api/quest-proof/token?runId=<id>: founder-only. Mints the capture token
 * for one proof run. Open the headset link with `?runId=<id>&proofToken=<token>`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const runId = safeRunId(req.nextUrl.searchParams.get('runId'));
  const ttlParam = Number(req.nextUrl.searchParams.get('ttl') ?? QUEST_PROOF_TOKEN_DEFAULT_TTL_S);
  const proofToken = mintQuestProofToken(runId, {
    ttlSeconds: Number.isFinite(ttlParam) ? ttlParam : QUEST_PROOF_TOKEN_DEFAULT_TTL_S,
  });
  if (!proofToken) {
    return NextResponse.json({ error: 'Capture tokens are not configured' }, { status: 503 });
  }
  const captureQuery = new URLSearchParams({ runId, proofToken }).toString();
  return NextResponse.json(
    {
      runId,
      proofToken,
      exp: questProofTokenExp(proofToken),
      expiresAt: new Date((questProofTokenExp(proofToken) ?? 0) * 1000).toISOString(),
      captureQuery,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
