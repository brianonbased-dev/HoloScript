/**
 * GitHub Identity Resolver
 *
 * Validates GitHub OAuth tokens against the GitHub API, auto-creates
 * user records in the database, and caches resolved identities.
 *
 * Used by auth middleware to map GitHub tokens → internal userId UUIDs.
 */

import { getDb } from '../db/client.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitHubIdentity {
  userId: string;
  githubUsername: string;
  githubId: string;
  isAdmin: boolean;
  avatarUrl?: string;
  name?: string;
}

interface CacheEntry {
  identity: GitHubIdentity;
  expiresAt: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = parseInt(process.env.GITHUB_TOKEN_CACHE_TTL_MS || '300000', 10);
const CACHE_MAX = parseInt(process.env.GITHUB_TOKEN_CACHE_MAX || '500', 10);

function getAdminUsernames(): Set<string> {
  const raw = process.env.ADMIN_GITHUB_USERNAMES || 'brianonbased-dev';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();

function getCached(token: string): GitHubIdentity | null {
  const entry = cache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(token);
    return null;
  }
  return entry.identity;
}

function setCache(token: string, identity: GitHubIdentity): void {
  // Evict oldest if at capacity
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(token, { identity, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for testing */
export function clearCache(): void {
  cache.clear();
}

// ─── GitHub API ─────────────────────────────────────────────────────────────

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

async function fetchGitHubUser(token: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'absorb-service/6.0.0',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as GitHubUser;
  } catch {
    return null;
  }
}

// ─── User Upsert ────────────────────────────────────────────────────────────

async function upsertUser(ghUser: GitHubUser, token: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const { users, accounts } = await import('../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const githubId = String(ghUser.id);

    // Check if account already exists
    const [existing] = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(eq(accounts.provider, 'github'), eq(accounts.providerAccountId, githubId)))
      .limit(1);

    if (existing) {
      // Update access token
      await db
        .update(accounts)
        .set({ access_token: token })
        .where(and(eq(accounts.provider, 'github'), eq(accounts.providerAccountId, githubId)));
      return existing.userId;
    }

    // Create new user + account
    const [newUser] = await db
      .insert(users)
      .values({
        name: ghUser.name || ghUser.login,
        email: null,
        image: ghUser.avatar_url,
      })
      .returning({ id: users.id });

    if (!newUser) return null;

    await db.insert(accounts).values({
      userId: newUser.id,
      type: 'oauth',
      provider: 'github',
      providerAccountId: githubId,
      access_token: token,
      token_type: 'bearer',
      scope: 'repo,read:org,workflow',
    });

    return newUser.id;
  } catch (err: any) {
    console.error('[github-identity] Upsert failed:', err.message);
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve a GitHub OAuth token to an internal user identity.
 *
 * 1. Checks LRU cache
 * 2. Calls GitHub API to validate token + get profile
 * 3. Upserts user/account records in database
 * 4. Determines admin status from ADMIN_GITHUB_USERNAMES env var
 * 5. Caches and returns identity
 *
 * Returns null if the token is invalid or GitHub API is unreachable.
 */
export async function resolveGitHubToken(token: string): Promise<GitHubIdentity | null> {
  // 1. Cache check
  const cached = getCached(token);
  if (cached) return cached;

  // 2. Validate against GitHub API
  const ghUser = await fetchGitHubUser(token);
  if (!ghUser) return null;

  // 3. Upsert user record
  const userId = await upsertUser(ghUser, token);
  if (!userId) return null;

  // 4. Build identity
  const adminSet = getAdminUsernames();
  const identity: GitHubIdentity = {
    userId,
    githubUsername: ghUser.login,
    githubId: String(ghUser.id),
    isAdmin: adminSet.has(ghUser.login.toLowerCase()),
    avatarUrl: ghUser.avatar_url,
    name: ghUser.name ?? undefined,
  };

  // 5. Cache and return
  setCache(token, identity);
  return identity;
}

export function isAdminUsername(username: string): boolean {
  return getAdminUsernames().has(username.toLowerCase());
}
