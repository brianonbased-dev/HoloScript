/**
 * GitHub Token Authentication for MCP Server
 *
 * Resolves GitHub OAuth tokens to TokenIntrospection objects.
 * Lightweight LRU cache avoids GitHub API rate limits.
 * Shares the same DATABASE_URL as absorb-service for user identity.
 */

import type { TokenIntrospection } from './oauth21';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface CachedIdentity {
  introspection: TokenIntrospection;
  expiresAt: number;
}

const CACHE_TTL_MS = parseInt(process.env.GITHUB_TOKEN_CACHE_TTL_MS || '300000', 10);
const CACHE_MAX = 500;
const cache = new Map<string, CachedIdentity>();

/**
 * Scopes any GitHub account that is not in ADMIN_GITHUB_USERNAMES receives.
 * Exported so the Gate 2 tests check host-reaching tools against the grant
 * this file actually makes.
 */
export const GITHUB_MEMBER_SCOPES: readonly string[] = [
  'tools:read',
  'tools:write',
  'tools:codebase',
  'scenes:read',
];

const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_GITHUB_USERNAMES || 'brianonbased-dev')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * The shapes GitHub issues tokens in: gho_ (OAuth app: the device flow and web sign-in), ghu_
 * (GitHub App user token), ghp_ (classic PAT), ghs_ / ghr_ (server and refresh tokens),
 * github_pat_ (fine-grained PAT), and the 40-hex tokens from before April 2021.
 */
const GITHUB_TOKEN_SHAPES: readonly RegExp[] = [
  /^gh[pousr]_[A-Za-z0-9]{20,}$/,
  /^github_pat_[A-Za-z0-9_]{20,}$/,
  /^[0-9a-f]{40}$/,
];

/**
 * Could this be a GitHub token? Only these are ever sent to api.github.com. The resolver is the
 * last fallback for ANY unrecognised Bearer, so without this check a HoloMesh agent key, a
 * Moltbook key, or any other secret sent to this server was shown to GitHub.
 */
export function isGitHubShapedToken(token: string): boolean {
  return GITHUB_TOKEN_SHAPES.some((shape) => shape.test(token));
}

async function fetchGitHubUser(token: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'holoscript-mcp/6.0.0',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as GitHubUser;
  } catch {
    return null;
  }
}

/**
 * Resolve a GitHub token to a TokenIntrospection.
 * Returns null if the token is not a valid GitHub token.
 */
export async function resolveGitHubTokenForMcp(token: string): Promise<TokenIntrospection | null> {
  // Not GitHub's shape: not a GitHub token. No request leaves this server.
  if (!isGitHubShapedToken(token)) return null;

  // Cache check
  const cached = cache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.introspection;
  }
  if (cached) cache.delete(token);

  const ghUser = await fetchGitHubUser(token);
  if (!ghUser) return null;

  const isAdmin = ADMIN_USERNAMES.has(ghUser.login.toLowerCase());

  const introspection: TokenIntrospection = {
    active: true,
    clientId: `github:${ghUser.login}`,
    agentId: `github:${ghUser.id}`,
    scopes: isAdmin
      ? [
          'admin:*',
          'tools:read',
          'tools:write',
          'tools:codebase',
          'a2a:tasks',
          'scenes:read',
          'scenes:write',
        ]
      : [...GITHUB_MEMBER_SCOPES],
  };

  // Cache
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(token, { introspection, expiresAt: Date.now() + CACHE_TTL_MS });

  return introspection;
}
