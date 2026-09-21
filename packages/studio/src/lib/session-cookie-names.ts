/**
 * The one place that says which cookie names a Studio session may arrive under.
 *
 * WHY THIS IS A FILE OF ITS OWN. `getToken()` picks exactly ONE name from the
 * ENVIRONMENT — `__Secure-next-auth.session-token` when `NEXTAUTH_URL` starts
 * with `https://`, `next-auth.session-token` otherwise (next-auth 4.24.15,
 * jwt/index.js:65-66). The browser's cookie name was chosen by that same
 * setting at sign-in. So the moment `NEXTAUTH_URL` is absent, http, or simply
 * different from the origin somebody actually signed in on, the environment and
 * the browser disagree, and every reader that consults only the env-derived
 * name refuses every signed-in caller — with a 401 that reads like a broken
 * login rather than like a gate.
 *
 * That is not hypothetical here: the founder rollout this branch documents
 * REQUIRES a deploy-time environment edit, which is precisely the trigger.
 *
 * Reading both names is not a weakening. The token still has to carry a valid
 * signature under our own `NEXTAUTH_SECRET`, which is the entire check either
 * way; only the name of the container differs.
 *
 * Three readers had their own copy of this list and a fourth had none, which is
 * how the edge gate came to admit a request that `getSession` then refused:
 *   - `src/proxy.ts`                         the edge gate (#306)
 *   - `src/app/api/github/_shared.ts`        the GitHub credential path
 *   - `src/lib/api-auth.ts`                  `getSession` → `requireFounder`
 * They now read this. Keep it a LEAF — no imports — because the edge runtime
 * loads it through the middleware bundle.
 *
 * Deliberately NOT imported by the tests that assert these names. A test that
 * re-states the literals fails when a name is dropped from this list; a test
 * that imports the list would agree with the mistake.
 */
export const SESSION_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
] as const;
