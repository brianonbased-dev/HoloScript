/**
 * Whose balance POST /api/credits/check reads (Muse Gap 9).
 *
 * The user comes from the token: a token minted after a human consented in a
 * signed-in Studio session carries that human's userId. A body userId is only
 * a cross-check: if present it must match the token's user.
 *
 * One exception, kept so Studio's own server keeps working: an operator
 * credential with no user of its own (admin:* / tools:admin, e.g. Studio's
 * server-side key, the same scope /api/credits/deduct already requires) may
 * name the user in the body. A self-registered client can never hold that
 * scope (admin is not a public scope).
 */
export type CreditCheckSubject =
  { ok: true; userId: string } | { ok: false; status: 400 | 403; error: string };

export function creditCheckSubject(
  auth: { userId?: string; scopes?: string[] },
  bodyUserId: unknown
): CreditCheckSubject {
  const named = typeof bodyUserId === 'string' && bodyUserId.trim() ? bodyUserId : undefined;
  if (auth.userId) {
    if (named !== undefined && named !== auth.userId) {
      return { ok: false, status: 403, error: 'userId does not match the token user' };
    }
    return { ok: true, userId: auth.userId };
  }
  const scopes = auth.scopes ?? [];
  const operator = scopes.includes('admin:*') || scopes.includes('tools:admin');
  if (!operator) {
    return {
      ok: false,
      status: 403,
      error:
        'This token acts for no user. A balance can be read only with a token a signed-in user consented to.',
    };
  }
  if (!named) return { ok: false, status: 400, error: 'Missing required field: userId' };
  return { ok: true, userId: named };
}
