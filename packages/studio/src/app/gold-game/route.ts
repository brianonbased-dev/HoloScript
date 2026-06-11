/**
 * GET /gold-game — stable Studio URL for the GOLD Quest game (44 GATE
 * receipts, examples/gold-game; unfrozen 2026-06-10 per the /capabilities
 * scan + D.081). Redirects to the synced self-contained artifact. MUST be a
 * redirect, not a rewrite: the game fetches RELATIVE './api/vault' and
 * './api/vault-entry', which only resolve to /gold-game/api/* when the
 * document URL is /gold-game/index.html. A route handler (not a page.tsx)
 * keeps the render surface HS-native per the render-surface freeze gate.
 */
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return Response.redirect(new URL('/gold-game/index.html', request.nextUrl.origin), 307);
}
