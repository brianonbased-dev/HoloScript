/**
 * GET /api/absorb/credits/history — Paginated credit transaction history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getUsageHistory } from '@/lib/absorb/creditService';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

  const transactions = await getUsageHistory(auth.user.id, limit, offset);

  return NextResponse.json({ transactions, limit, offset });
}
