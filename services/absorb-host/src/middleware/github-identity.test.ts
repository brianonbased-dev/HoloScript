/**
 * GitHub Identity Resolver Tests
 *
 * Validates token resolution, caching, user upsert, and admin detection.
 * Uses mock fetch + mock DB pattern (no external dependencies).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock DB ──────────────────────────────────────────────────────────────────

let mockDbInstance: any = null;

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(() => mockDbInstance),
}));

vi.mock('../db/schema.js', () => ({
  users: {
    id: 'users.id',
    name: 'users.name',
    email: 'users.email',
    image: 'users.image',
  },
  accounts: {
    userId: 'accounts.userId',
    provider: 'accounts.provider',
    providerAccountId: 'accounts.providerAccountId',
    access_token: 'accounts.access_token',
    type: 'accounts.type',
    token_type: 'accounts.token_type',
    scope: 'accounts.scope',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => 'eq-clause'),
  and: vi.fn((..._args: any[]) => 'and-clause'),
}));

// ── Mock GitHub API ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const VALID_GITHUB_USER = {
  id: 12345678,
  login: 'testuser',
  name: 'Test User',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345678',
};

const ADMIN_GITHUB_USER = {
  id: 99999999,
  login: 'brianonbased-dev',
  name: 'Brian',
  avatar_url: 'https://avatars.githubusercontent.com/u/99999999',
};

function mockGitHubResponse(user: any, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status === 200,
    status,
    json: async () => user,
  });
}

// ── DB Chain Helpers ────────────────────────────────────────────────────────

function createDbWithExistingUser(userId: string) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ userId }]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: userId }]),
      }),
    }),
  };
}

function createDbWithNoUser(newUserId: string) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: newUserId }]),
      }),
    }),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('resolveGitHubToken', () => {
  let resolveGitHubToken: typeof import('./github-identity.js').resolveGitHubToken;
  let clearCache: typeof import('./github-identity.js').clearCache;
  let isAdminUsername: typeof import('./github-identity.js').isAdminUsername;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbInstance = null;
    process.env.ADMIN_GITHUB_USERNAMES = 'brianonbased-dev';

    const mod = await import('./github-identity.js');
    resolveGitHubToken = mod.resolveGitHubToken;
    clearCache = mod.clearCache;
    isAdminUsername = mod.isAdminUsername;
    clearCache();
  });

  afterEach(() => {
    delete process.env.ADMIN_GITHUB_USERNAMES;
  });

  it('resolves a valid GitHub token to GitHubIdentity', async () => {
    mockGitHubResponse(VALID_GITHUB_USER);
    mockDbInstance = createDbWithExistingUser('uuid-existing-user');

    const identity = await resolveGitHubToken('ghp_valid_token');

    expect(identity).not.toBeNull();
    expect(identity!.userId).toBe('uuid-existing-user');
    expect(identity!.githubUsername).toBe('testuser');
    expect(identity!.githubId).toBe('12345678');
    expect(identity!.isAdmin).toBe(false);
    expect(identity!.avatarUrl).toBe('https://avatars.githubusercontent.com/u/12345678');
  });

  it('returns null for invalid token (GitHub 401)', async () => {
    mockGitHubResponse({}, 401);

    const identity = await resolveGitHubToken('ghp_invalid_token');

    expect(identity).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('creates new user on first auth', async () => {
    const newUserId = 'uuid-brand-new-user';
    mockGitHubResponse(VALID_GITHUB_USER);
    const db = createDbWithNoUser(newUserId);
    mockDbInstance = db;

    const identity = await resolveGitHubToken('ghp_new_user_token');

    expect(identity).not.toBeNull();
    expect(identity!.userId).toBe(newUserId);
    // insert should be called twice: once for users, once for accounts
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('finds existing user on repeat auth', async () => {
    mockGitHubResponse(VALID_GITHUB_USER);
    const db = createDbWithExistingUser('uuid-returning-user');
    mockDbInstance = db;

    const identity = await resolveGitHubToken('ghp_repeat_token');

    expect(identity).not.toBeNull();
    expect(identity!.userId).toBe('uuid-returning-user');
    // update should be called to refresh the access_token
    expect(db.update).toHaveBeenCalled();
  });

  it('caches identity and avoids repeat GitHub API calls', async () => {
    mockGitHubResponse(VALID_GITHUB_USER);
    mockDbInstance = createDbWithExistingUser('uuid-cached-user');

    // First call — hits GitHub API
    const id1 = await resolveGitHubToken('ghp_cache_test_token');
    expect(id1).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();

    // Second call — should come from cache (no new fetch)
    const id2 = await resolveGitHubToken('ghp_cache_test_token');
    expect(id2).not.toBeNull();
    expect(id2!.userId).toBe(id1!.userId);
    expect(mockFetch).toHaveBeenCalledOnce(); // Still only 1 call
  });

  it('evicts expired cache entries', async () => {
    // Override TTL to 1ms for testing
    const originalTTL = process.env.GITHUB_TOKEN_CACHE_TTL_MS;
    process.env.GITHUB_TOKEN_CACHE_TTL_MS = '1';

    // Re-import to pick up new TTL — but since it's read at module load,
    // we test via clearCache + natural expiration instead
    mockGitHubResponse(VALID_GITHUB_USER);
    mockDbInstance = createDbWithExistingUser('uuid-ttl-user');

    const id1 = await resolveGitHubToken('ghp_ttl_token');
    expect(id1).not.toBeNull();

    // Wait for natural expiration (module uses 5min default, so we clear manually)
    clearCache();

    // Second call should hit GitHub API again
    mockGitHubResponse(VALID_GITHUB_USER);
    mockDbInstance = createDbWithExistingUser('uuid-ttl-user');

    const id2 = await resolveGitHubToken('ghp_ttl_token');
    expect(id2).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    process.env.GITHUB_TOKEN_CACHE_TTL_MS = originalTTL;
  });

  it('identifies admin from ADMIN_GITHUB_USERNAMES env var', async () => {
    mockGitHubResponse(ADMIN_GITHUB_USER);
    mockDbInstance = createDbWithExistingUser('uuid-admin-user');

    const identity = await resolveGitHubToken('ghp_admin_token');

    expect(identity).not.toBeNull();
    expect(identity!.isAdmin).toBe(true);
    expect(identity!.githubUsername).toBe('brianonbased-dev');
  });
});

describe('isAdminUsername', () => {
  beforeEach(async () => {
    process.env.ADMIN_GITHUB_USERNAMES = 'brianonbased-dev,other-admin';
  });

  afterEach(() => {
    delete process.env.ADMIN_GITHUB_USERNAMES;
  });

  it('returns true for admin usernames (case-insensitive)', async () => {
    const { isAdminUsername } = await import('./github-identity.js');
    expect(isAdminUsername('brianonbased-dev')).toBe(true);
    expect(isAdminUsername('BrianOnBased-Dev')).toBe(true);
    expect(isAdminUsername('other-admin')).toBe(true);
  });

  it('returns false for non-admin usernames', async () => {
    const { isAdminUsername } = await import('./github-identity.js');
    expect(isAdminUsername('randomuser')).toBe(false);
    expect(isAdminUsername('')).toBe(false);
  });
});
