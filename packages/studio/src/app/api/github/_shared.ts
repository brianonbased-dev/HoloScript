import type { NextRequest } from 'next/server';

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

export async function getGitHubToken(req?: NextRequest): Promise<string | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  void req; // session is request-scoped in route handlers
  return session?.accessToken ?? process.env.GITHUB_TOKEN ?? null;
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
