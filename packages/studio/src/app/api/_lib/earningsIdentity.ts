/**
 * Server-side identity resolution for the Marketplace / Earnings surfaces.
 *
 * SECURITY (task_1780469216849_hpxp): the earnings views were keyed on a
 * client-supplied `?wallet=` query param rather than the authenticated session.
 * Two failure modes followed from that:
 *
 *  1. No auth gate — an unauthenticated caller (or any authenticated user)
 *     could pass `?wallet=0xSOMEONE_ELSE` and read another user's earnings
 *     (cross-user data leakage). This was a first-production-login canary
 *     finding.
 *  2. Earnings showed $0 — the studio clients never actually send a `wallet`
 *     param (see useAbsorbService.getKnowledgeEarnings / the agents/me page),
 *     so the server read an empty wallet and fell through to its zero-earnings
 *     default. The caller's real wallet was never resolved.
 *
 * The fix mirrors the requireAuth + owner-scoping template established for
 * /api/projects (commit c3851dcce) and /api/versions + /api/snapshots
 * (commit efb467dce): every earnings read requires auth and is keyed on the
 * authenticated identity, NEVER on a client-supplied param.
 *
 * Architecture decision (the task asked: local per-user queries vs an
 * authenticated proxy):
 *  - Marketplace / creator earnings (Stripe `payouts` + `creatorProfiles`) are
 *    owned locally by studio and FK to `users.id` — answered with a LOCAL
 *    per-user query keyed on `session.user.id`.
 *  - HoloMesh agent / knowledge earnings are wallet-keyed and live on
 *    mcp.holoscript.net — answered with an AUTHENTICATED PROXY that strips any
 *    client-supplied identity param and forwards only the authenticated session
 *    identity, so the backend resolves the caller's OWN wallet.
 */

/**
 * Query-param keys a client must NOT be allowed to use to select whose earnings
 * are returned. Stripped before forwarding to any backend so a caller can only
 * ever see their own data.
 */
export const CLIENT_IDENTITY_PARAMS = [
  'wallet',
  'wallet_address',
  'walletAddress',
  'agentId',
  'agent_id',
  'userId',
  'user_id',
] as const;

/**
 * Strip every client-supplied identity selector from a URL's query string.
 * Returns the sanitized query string (including the leading `?`, or '' when
 * empty) so it can be appended to a backend URL. The authenticated identity is
 * forwarded out-of-band (header / server-resolved value), never via these
 * client params.
 */
export function stripClientIdentityParams(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const key of CLIENT_IDENTITY_PARAMS) {
    params.delete(key);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Header used to forward the authenticated user id to a trusted backend so the
 * backend resolves the caller's own wallet server-side. The backend treats this
 * as authoritative ONLY because studio strips the client-facing equivalents
 * (see stripClientIdentityParams) before forwarding.
 */
export const AUTHENTICATED_USER_HEADER = 'x-holo-user-id';

/** Convert integer cents to a `$X.XX` USD display string. */
export function centsToUsd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
