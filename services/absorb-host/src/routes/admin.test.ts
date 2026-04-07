/**
 * Admin Router Tests
 *
 * Validates admin guard, user listing, project listing, stats, and force-stop.
 * Uses mock req/res pattern (no supertest dependency).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock DB ──────────────────────────────────────────────────────────────────

let mockDbInstance: any = null;

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(() => mockDbInstance),
}));

vi.mock('../db/schema.js', () => ({
  users: { id: 'users.id', name: 'users.name', email: 'users.email', image: 'users.image', createdAt: 'users.createdAt' },
  accounts: { userId: 'accounts.userId', provider: 'accounts.provider', providerAccountId: 'accounts.providerAccountId' },
  absorbProjects: { userId: 'absorbProjects.userId', createdAt: 'absorbProjects.createdAt' },
  moltbookAgents: {
    id: 'moltbookAgents.id',
    userId: 'moltbookAgents.userId',
    agentName: 'moltbookAgents.agentName',
    heartbeatEnabled: 'moltbookAgents.heartbeatEnabled',
    totalPostsGenerated: 'moltbookAgents.totalPostsGenerated',
    totalCommentsGenerated: 'moltbookAgents.totalCommentsGenerated',
    totalUpvotesGiven: 'moltbookAgents.totalUpvotesGiven',
    totalLlmSpentCents: 'moltbookAgents.totalLlmSpentCents',
    moltbookApiKey: 'moltbookAgents.moltbookApiKey',
    createdAt: 'moltbookAgents.createdAt',
    updatedAt: 'moltbookAgents.updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => 'eq-clause'),
  and: vi.fn((..._args: any[]) => 'and-clause'),
  desc: vi.fn((_col) => 'desc-clause'),
  sql: Object.assign(vi.fn(), {
    raw: vi.fn((s: string) => s),
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockReq(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as any;
}

function createMockRes(): Response & { _status: number; _json: any } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
  };
  return res;
}

function chainBuilder(resolveData: any[]) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(resolveData);
  chain.offset = vi.fn().mockReturnValue(chain);
  return chain;
}

// ── Extract Route Handler ──────────────────────────────────────────────────
// The admin router uses `router.use(requireAdmin)` so we need to test the guard
// separately and then test individual route handlers.

type RouteHandler = (req: Request, res: Response, next?: any) => Promise<void> | void;

async function getAdminRouter() {
  const { adminRouter } = await import('./admin.js');
  return adminRouter;
}

async function getRouteHandler(method: string, pathPattern: string): Promise<RouteHandler> {
  const router = await getAdminRouter();
  const stack = (router as any).stack;
  for (const layer of stack) {
    if (
      layer.route &&
      layer.route.path === pathPattern &&
      layer.route.methods[method]
    ) {
      // Return the actual handler (skip middleware layers)
      const handlers = layer.route.stack.filter((l: any) => l.name !== 'requireAdmin');
      return handlers[handlers.length - 1]?.handle ?? layer.route.stack[0].handle;
    }
  }
  throw new Error(`No route found: ${method.toUpperCase()} ${pathPattern}`);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Admin Guard (requireAdmin)', () => {
  it('returns 403 for non-admin requests', async () => {
    const router = await getAdminRouter();
    const middleware = (router as any).stack.find(
      (layer: any) => !layer.route && layer.handle.name === 'requireAdmin'
    );
    expect(middleware).toBeDefined();

    const req = createMockReq({ isAdmin: false });
    const res = createMockRes();
    const next = vi.fn();

    middleware.handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._json.error).toBe('Admin access required');
  });

  it('passes through for admin requests', async () => {
    const router = await getAdminRouter();
    const middleware = (router as any).stack.find(
      (layer: any) => !layer.route && layer.handle.name === 'requireAdmin'
    );

    const req = createMockReq({ isAdmin: true });
    const res = createMockRes();
    const next = vi.fn();

    middleware.handle(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('GET /users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance = null;
  });

  it('lists users with enrichment for admin', async () => {
    const mockUsers = [
      { id: 'u1', name: 'User One', email: 'one@test.com', image: null, createdAt: new Date() },
    ];

    let selectCall = 0;
    const db: any = {
      select: vi.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // Users query
          return {
            from: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockUsers),
              }),
            }),
          };
        }
        if (selectCall === 2) {
          // Account lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ providerAccountId: '12345' }]),
              }),
            }),
          };
        }
        // Project count
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 3 }]),
          }),
        };
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/users');
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.users).toBeDefined();
    expect(res._json.users).toHaveLength(1);
    expect(res._json.users[0].githubId).toBe('12345');
    expect(res._json.users[0].projectCount).toBe(3);
  });
});

describe('GET /projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance = null;
  });

  it('lists all projects cross-user', async () => {
    const mockProjects = [
      { id: 'p1', name: 'Project A', userId: 'u1', createdAt: new Date() },
      { id: 'p2', name: 'Project B', userId: 'u2', createdAt: new Date() },
    ];

    mockDbInstance = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockProjects),
          }),
        }),
      }),
    };

    const handler = await getRouteHandler('get', '/projects');
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.projects).toHaveLength(2);
    expect(res._json.count).toBe(2);
  });
});

describe('GET /stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance = null;
  });

  it('returns global platform statistics', async () => {
    let selectCall = 0;
    const db: any = {
      select: vi.fn().mockImplementation(() => {
        selectCall++;
        return {
          from: vi.fn().mockResolvedValue([
            selectCall === 1
              ? { totalUsers: 10 }
              : selectCall === 2
                ? { totalProjects: 25 }
                : {
                    totalAgents: 5,
                    activeAgents: 2,
                    totalPosts: 100,
                    totalComments: 300,
                    totalUpvotesGiven: 50,
                    totalLlmSpentCents: 1500,
                  },
          ]),
        };
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/stats');
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.totalUsers).toBe(10);
    expect(res._json.totalProjects).toBe(25);
    expect(res._json.totalAgents).toBe(5);
    expect(res._json.activeAgents).toBe(2);
    expect(res._json.timestamp).toBeDefined();
  });
});

describe('POST /agents/:id/force-stop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance = null;
  });

  it('force-stops agent regardless of ownership', async () => {
    const stoppedAgent = { id: 'a1', agentName: 'bot-x', heartbeatEnabled: false };
    const db: any = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([stoppedAgent]),
          }),
        }),
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('post', '/agents/:id/force-stop');
    const req = createMockReq({
      params: { id: 'a1' },
      githubUsername: 'brianonbased-dev',
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.forceStopped).toBe(true);
    expect(res._json.agentName).toBe('bot-x');
    expect(res._json.stoppedBy).toBe('brianonbased-dev');
  });

  it('returns 404 for non-existent agent', async () => {
    const db: any = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('post', '/agents/:id/force-stop');
    const req = createMockReq({ params: { id: 'nonexistent' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(404);
    expect(res._json.error).toBe('Agent not found');
  });
});
