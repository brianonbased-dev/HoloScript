import type { NextRequest } from 'next/server';
import { getGitHubDeviceToken } from '@/lib/github-device-session';
import { SESSION_COOKIE_NAMES } from '@/lib/session-cookie-names';

export const GITHUB_API_BASE_URL = (
  process.env.GITHUB_API_URL ||
  process.env.GITHUB_API_BASE_URL ||
  'https://api.github.com'
).replace(/\/+$/, '');

export const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || '2022-11-28';
export const GITHUB_USER_AGENT = 'HoloScript-Studio';
export const GITHUB_REQUEST_TIMEOUT_MS = 15_000;

const GITHUB_MAX_RETRIES = 3;
const GITHUB_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function allowsServerTokenFallback(): boolean {
  const explicit =
    process.env.STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK ??
    process.env.ALLOW_SERVER_GITHUB_TOKEN_FALLBACK;

  if (explicit !== undefined) {
    return /^(1|true|yes)$/i.test(explicit.trim());
  }

  return process.env.NODE_ENV !== 'production';
}

export function getGitHubAuthRequiredMessage(): string {
  return allowsServerTokenFallback()
    ? 'Not authenticated. Sign in with GitHub or set GITHUB_TOKEN.'
    : 'Not authenticated. Sign in with GitHub.';
}

function parseRetryAfterMs(raw: string | null): number | undefined {
  if (!raw) return undefined;

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return undefined;
}

function calculateBackoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) {
    return Math.min(30_000, Math.max(0, retryAfterMs));
  }

  return Math.min(30_000, 1000 * Math.pow(2, attempt));
}

async function sleep(ms: number): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * The verified Studio session behind this request, or null.
 *
 * Kept here rather than in `lib/api-auth.ts` on purpose: that module pulls in
 * the database client and the NextAuth options, and this helper is on the path
 * of every GitHub call.
 */
async function readStudioSessionToken(req?: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!req || !secret) return null;

  const { getToken } = await import('next-auth/jwt');
  for (const cookieName of SESSION_COOKIE_NAMES) {
    try {
      const token = await getToken({ req, secret, cookieName });
      if (token) return token;
    } catch {
      // Malformed under this name; the other name still gets its turn.
    }
  }
  return null;
}

/** The signed-in Studio user id behind this request, for binding checks. */
export async function getStudioSessionUserId(req?: NextRequest): Promise<string | null> {
  const token = await readStudioSessionToken(req);
  const subject = typeof token?.sub === 'string' ? token.sub.trim() : '';
  return subject.length > 0 ? subject : null;
}

/**
 * Did this identity sign in through GitHub?
 *
 * `provider` is the answer whenever it is present. Only when it is ABSENT does
 * the GitHub login stand in for it — a token minted before `provider` was
 * recorded can still be placed, because `githubUsername` is written from the
 * `login` field and no other provider's profile carries one. The order matters:
 * a session that signed in with Google can hold a STALE `githubUsername` from
 * an earlier GitHub sign-in on the same token, so a present `provider` must
 * always win.
 */
function signedInWithGitHub(identity: {
  provider?: unknown;
  githubUsername?: unknown;
}): boolean {
  const provider = typeof identity.provider === 'string' ? identity.provider.trim().toLowerCase() : '';
  if (provider) return provider === 'github';
  const login = typeof identity.githubUsername === 'string' ? identity.githubUsername.trim() : '';
  return login.length > 0;
}

/**
 * The signed-in user's GitHub token: NextAuth JWT, then device session, then
 * the server session. Outside production (or with
 * STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK) it may fall back to a SERVER token
 * (PERSONAL_ACCESS_TOKEN / PAT_TOKEN / GITHUB_TOKEN). Pass
 * `{ userOnly: true }` wherever the token stands for WHO the user is (credits,
 * billing): a server token there would act as someone else.
 *
 * EVERY branch that returns a session credential is checked against the
 * provider first. `lib/auth.ts` sets `token.accessToken` from `account.access_token`
 * for EVERY provider, so a Google sign-in stores a GOOGLE OAuth token in the
 * same field a GitHub sign-in uses. Returning it here sent that credential to
 * api.github.com as `Authorization: Bearer` — for the exact caller the Google
 * rescue path was written for. GitHub rejected it, so the caller saw the same
 * failure either way and nothing pointed at the cause; the cost was not the
 * failed call, it was a credential leaving its audience on the way.
 */
export async function getGitHubToken(
  req?: NextRequest,
  options: { userOnly?: boolean } = {}
): Promise<string | null> {
  const token = await readStudioSessionToken(req);
  if (
    token &&
    signedInWithGitHub(token) &&
    typeof token.accessToken === 'string' &&
    token.accessToken.length > 0
  ) {
    return token.accessToken;
  }

  // A Google session that linked GitHub through the device flow is the caller
  // this path exists for, and its credential lives in the cookie, not the JWT.
  const deviceToken = await getGitHubDeviceToken(req, {
    userId: typeof token?.sub === 'string' ? token.sub : null,
    // An unowned cookie is a capability, never an identity: it cannot say who
    // linked it, and `userOnly` is precisely the flag for "this token has to
    // answer who the caller is".
    allowUnbound: options.userOnly !== true,
  });
  if (deviceToken) {
    return deviceToken;
  }

  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (
    session?.accessToken &&
    signedInWithGitHub({
      provider: session.user?.provider,
      githubUsername: session.user?.githubUsername,
    })
  ) {
    return session.accessToken;
  }

  if (options.userOnly) return null;

  // GITHUB_TOKEN is a known-invalid ambient token on this machine (F.109 / lib.mjs).
  // Prefer PERSONAL_ACCESS_TOKEN / PAT_TOKEN — the real credentials.
  const adminToken =
    process.env.PERSONAL_ACCESS_TOKEN || process.env.PAT_TOKEN || process.env.GITHUB_TOKEN || null;
  return allowsServerTokenFallback() ? adminToken : null;
}

export function createGitHubHeaders(
  token: string,
  options?: {
    accept?: string;
    contentTypeJson?: boolean;
  }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: options?.accept ?? 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': GITHUB_USER_AGENT,
  };

  if (options?.contentTypeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export function encodeGitHubPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function githubFetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;

  while (attempt <= GITHUB_MAX_RETRIES) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    });

    if (!GITHUB_RETRYABLE_STATUS.has(response.status) || attempt === GITHUB_MAX_RETRIES) {
      return response;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
    const backoffMs = calculateBackoffMs(attempt, retryAfterMs);
    await sleep(backoffMs);
    attempt += 1;
  }

  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  });
}
