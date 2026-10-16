import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { mintQuestProofToken, safeRunId } from '@/lib/questProofCapture';

export const runtime = 'nodejs';

/**
 * GET /api/quest-proof/token?runId=<id>: founder-only. Mints the capture token
 * for one proof run. Open the headset link with `?runId=<id>&proofToken=<token>`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  const runId = safeRunId(req.nextUrl.searchParams.get('runId'));
  const proofToken = mintQuestProofToken(runId);
  if (!proofToken) {
    return NextResponse.json({ error: 'Capture tokens are not configured' }, { status: 503 });
  }
  const captureQuery = new URLSearchParams({ runId, proofToken }).toString();
  return NextResponse.json(
    { runId, proofToken, captureQuery },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
