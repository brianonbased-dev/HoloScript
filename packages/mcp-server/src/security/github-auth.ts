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

const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_GITHUB_USERNAMES || 'brianonbased-dev')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

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
      : ['tools:read', 'tools:write', 'tools:codebase', 'scenes:read'],
  };

  // Cache
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(token, { introspection, expiresAt: Date.now() + CACHE_TTL_MS });

  return introspection;
}
