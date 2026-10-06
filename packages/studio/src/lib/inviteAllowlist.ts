/**
 * Who may hold a Studio session: invite-only sign-in. P0, 2026-10-05.
 *
 * Until this existed, anyone with a GitHub account could complete the OAuth
 * flow and get a session, because the auth config had no `signIn` callback.
 * Signed-in users could then reach workspace files that belong to the founder.
 * This module is the ONE rule for who is let in. Four places apply it:
 *
 *   1. `signIn` callback (lib/auth.ts): refuses new sign-ins before the adapter
 *      writes a user row, and sends the browser to INVITE_ONLY_PATH.
 *   2. `jwt` callback (lib/auth.ts): re-checks EVERY already-issued token on
 *      every session read and flags it `inviteDenied`. The `session` callback
 *      then throws, so NextAuth clears the cookie and `getServerSession`,
 *      `useSession` and `/api/auth/session` all answer "signed out".
 *   3. Edge proxy (src/proxy.ts): a verified token that fails this rule counts
 *      as no session. `/api/**` gets the usual 401 and pages redirect to
 *      INVITE_ONLY_PATH. In both cases the session cookies are cleared.
 *   4. `getSession()` raw-token fallback (lib/api-auth.ts), so the fallback
 *      cannot hand back a session that rule 2 refused.
 *
 * THE RULE (GitHub only; read fresh from env on every call):
 *
 *   - Allowlist = STUDIO_FOUNDER_GITHUB_IDS (numeric GitHub ids)
 *               + STUDIO_FOUNDER_GITHUB_USERS (founder GitHub logins)
 *               + ADMIN_GITHUB_USERNAMES (admin GitHub logins).
 *     The founder lists are parsed by `founderRecognitionConfig()` in
 *     workspace/workspaceIdentity.ts, the same parser founder recognition uses.
 *     The admin list is parsed by `adminGithubUsernames()` below, which
 *     creditGate.ts now uses too.
 *   - FAIL CLOSED. If all three are empty or unset, NOBODY is let in, and a loud
 *     console.error says why. Nothing is ever open by default.
 *   - Provider must be `github`. Google, and any other or absent provider, is
 *     refused. The single exception is the local "Dev Login" credentials
 *     provider, and only when NODE_ENV === 'development' exactly. lib/auth.ts
 *     registers that provider only in development and only when no OAuth
 *     provider is configured, so it can never exist in production.
 *   - The numeric id is checked FIRST: account.providerAccountId (or profile.id)
 *     in STUDIO_FOUNDER_GITHUB_IDS lets the user in.
 *   - The login (profile.login) is the FALLBACK:
 *       * MISMATCH RULE: the login is in STUDIO_FOUNDER_GITHUB_USERS,
 *         STUDIO_FOUNDER_GITHUB_IDS is non-empty, and the session carries a
 *         numeric id that is NOT in it. That is DENIED. The founder login
 *         belongs to the person whose ids are listed, so a different account
 *         holding that login (for example a renamed or recycled login) is
 *         refused. This wins over an admin-login match for the same login.
 *       * Otherwise a login in STUDIO_FOUNDER_GITHUB_USERS or
 *         ADMIN_GITHUB_USERNAMES is allowed. That covers: the founder id list
 *         is empty; the token predates `providerAccountId` and carries no id;
 *         or the login is an admin login. No admin id list exists, so an admin
 *         is recognised by login alone.
 *   - Everything else is denied.
 *
 * Matching is case-insensitive on trimmed values, the same as founder
 * recognition.
 */

import { founderRecognitionConfig } from './workspace/workspaceIdentity';

/** Where a refused sign-in, or a refused existing session, lands. */
export const INVITE_ONLY_PATH = '/invite-only';

/** Thrown by the session callback for a flagged token; NextAuth then clears the cookie. */
export const INVITE_ONLY_SESSION_ERROR =
  '[invite-only] This session is not on the Studio allowlist; signing it out.';

export const INVITE_ALLOWLIST_UNCONFIGURED_MESSAGE =
  '[invite-only] FAIL CLOSED: STUDIO_FOUNDER_GITHUB_IDS, STUDIO_FOUNDER_GITHUB_USERS and ' +
  'ADMIN_GITHUB_USERNAMES are all empty or unset, so NOBODY can sign in to Studio and every ' +
  'existing session is refused. Set STUDIO_FOUNDER_GITHUB_IDS to the founder GitHub numeric id.';

/** Comma-separated GitHub logins, trimmed and lower-cased. */
export function parseGithubLoginList(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** ADMIN_GITHUB_USERNAMES, read fresh. Shared with creditGate.ts. */
export function adminGithubUsernames(): Set<string> {
  return parseGithubLoginList(
    typeof process !== 'undefined' ? process.env.ADMIN_GITHUB_USERNAMES : undefined
  );
}

export interface InviteIdentity {
  /** OAuth provider id: 'github', 'google', 'credentials', ... */
  provider?: unknown;
  /** GitHub numeric account id (account.providerAccountId / profile.id). */
  providerAccountId?: unknown;
  /** GitHub login (profile.login / token.githubUsername). */
  githubLogin?: unknown;
}

export type InviteDecision =
  | { allowed: true; reason: 'founder-id' | 'founder-login' | 'admin-login' | 'dev-login' }
  | {
      allowed: false;
      reason: 'unconfigured' | 'non-github-provider' | 'login-id-mismatch' | 'not-listed';
    };

function normalized(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const UNCONFIGURED_LOG_INTERVAL_MS = 60_000;
let lastUnconfiguredLogAt = 0;

function logUnconfigured(): void {
  const now = Date.now();
  if (now - lastUnconfiguredLogAt < UNCONFIGURED_LOG_INTERVAL_MS) return;
  lastUnconfiguredLogAt = now;
  console.error(INVITE_ALLOWLIST_UNCONFIGURED_MESSAGE);
}

/** Test hook: let the next unconfigured check log again. */
export function resetInviteAllowlistLogThrottleForTests(): void {
  lastUnconfiguredLogAt = 0;
}

export function evaluateInviteAllowlist(
  identity: InviteIdentity | null | undefined
): InviteDecision {
  const provider = normalized(identity?.provider);

  // Local Dev Login only. It is registered only when NODE_ENV === 'development'
  // and no OAuth provider exists (lib/auth.ts buildProviders), so it is never
  // live in production, and production is never NODE_ENV === 'development'.
  if (provider === 'credentials' && process.env.NODE_ENV === 'development') {
    return { allowed: true, reason: 'dev-login' };
  }

  const founder = founderRecognitionConfig();
  const founderIds = founder.githubIds;
  const founderLogins = founder.githubLogins;
  const adminLogins = adminGithubUsernames();

  if (founderIds.size === 0 && founderLogins.size === 0 && adminLogins.size === 0) {
    logUnconfigured();
    return { allowed: false, reason: 'unconfigured' };
  }

  if (provider !== 'github') return { allowed: false, reason: 'non-github-provider' };

  const id = normalized(identity?.providerAccountId);
  const login = normalized(identity?.githubLogin);

  // 1. Numeric id first: immutable and never reissued.
  if (id && founderIds.has(id)) return { allowed: true, reason: 'founder-id' };

  const founderLoginMatch = login !== '' && founderLogins.has(login);
  const adminLoginMatch = login !== '' && adminLogins.has(login);

  // 2. Mismatch: the founder's login, presented by an account whose id is
  //    known and is not one of the founder's listed ids.
  if (founderLoginMatch && founderIds.size > 0 && id) {
    return { allowed: false, reason: 'login-id-mismatch' };
  }

  // 3. Login fallback.
  if (founderLoginMatch) return { allowed: true, reason: 'founder-login' };
  if (adminLoginMatch) return { allowed: true, reason: 'admin-login' };

  return { allowed: false, reason: 'not-listed' };
}

/** The same rule, applied to a decoded NextAuth JWT. */
export function evaluateInviteAllowlistForToken(
  token: Record<string, unknown> | null | undefined
): InviteDecision {
  return evaluateInviteAllowlist({
    provider: token?.provider,
    providerAccountId: token?.providerAccountId,
    githubLogin: token?.githubUsername,
  });
}

export function isInviteAllowlistedToken(
  token: Record<string, unknown> | null | undefined
): boolean {
  return evaluateInviteAllowlistForToken(token).allowed;
}
