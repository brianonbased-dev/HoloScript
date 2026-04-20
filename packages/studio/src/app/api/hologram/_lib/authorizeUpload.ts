import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/api-auth';

/**
 * HoloGram uploads accept either a trusted worker bearer token
 * (`HOLOGRAM_WORKER_TOKEN`) or an authenticated Studio session.
 */
export async function authorizeHologramUpload(
  request: NextRequest
): Promise<NextResponse | null> {
  const token = process.env.HOLOGRAM_WORKER_TOKEN;
  if (typeof token === 'string' && token.length > 0) {
    const raw = request.headers.get('authorization')?.trim() ?? '';
    const m = /^Bearer\s+(\S+)$/i.exec(raw);
    if (m && m[1] === token) {
      return null;
    }
  }

  const session = await requireAuth();
  if (session instanceof NextResponse) {
    return session;
  }
  return null;
}
