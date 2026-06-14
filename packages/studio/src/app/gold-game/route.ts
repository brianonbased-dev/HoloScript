/**
 * GET /gold-game — stable Studio URL for the GOLD Quest game (44 GATE
 * receipts, examples/gold-game; unfrozen 2026-06-10 per the /capabilities
 * scan + D.081). Redirects to the synced self-contained artifact. MUST be a
 * redirect, not a rewrite: the game fetches RELATIVE './api/vault' and
 * './api/vault-entry', which only resolve to /gold-game/api/* when the
 * document URL is /gold-game/index.html. A route handler (not a page.tsx)
 * keeps the render surface HS-native per the render-surface freeze gate.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  // Relative Location resolves against the PUBLIC request URL (holoscript.studio /
  // railway / localhost). `request.nextUrl.origin` returned the container's internal
  // bind origin (https://0.0.0.0:8080), producing a dead redirect for real users.
  return new Response(null, { status: 307, headers: { Location: '/gold-game/index.html' } });
}
