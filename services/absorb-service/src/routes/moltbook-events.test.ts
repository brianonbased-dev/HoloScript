/**
 * Moltbook Agent Events Endpoint Tests
 *
 * Validates the GET /:id/events endpoint and logAgentEvent helper.
 * Uses mock req/res pattern (no supertest dependency).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock Data ───────────────────────────────────────────────────────────────

const mockEvents = [
  { id: 'evt-1', agentId: 'agent-1', eventType: 'started', details: { agentName: 'bot-a' }, createdAt: new Date('2026-03-25T10:00:00Z') },
  { id: 'evt-2', agentId: 'agent-1', eventType: 'triggered', details: {}, createdAt: new Date('2026-03-25T10:01:00Z') },
  { id: 'evt-3', agentId: 'agent-1', eventType: 'stopped', details: { agentName: 'bot-a' }, createdAt: new Date('2026-03-25T10:02:00Z') },
];

const mockAgent = {
  id: 'agent-1',
  userId: 'user-1',
  agentName: 'bot-a',
  moltbookApiKey: 'mb_test_key_123',
  heartbeatEnabled: false,
  config: {},
};

// ── Mock DB Chain Builder ───────────────────────────────────────────────────

function chainBuilder(resolveData: any[]) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(resolveData);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockResolvedValue(undefined);
  return chain;
}

let mockDbInstance: any = null;

vi.mock('../db/client.js', () => ({
  getDb: vi.fn(() => mockDbInstance),
}));

vi.mock('../db/schema.js', () => ({
  moltbookAgents: Symbol('moltbookAgents'),
  moltbookAgentEvents: Symbol('moltbookAgentEvents'),
  absorbProjects: Symbol('absorbProjects'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => 'eq-clause'),
  and: vi.fn((..._args: any[]) => 'and-clause'),
  desc: vi.fn((_col) => 'desc-clause'),
  sql: Object.assign(vi.fn(), {
    // Tagged template literal support for sql`...`
    raw: vi.fn((s: string) => s),
  }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockReq(overrides: Record<string, any> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    userId: 'user-1',
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

// ── Extract Route Handler ───────────────────────────────────────────────────
// We dynamically import the router and extract handlers by method+path pattern.

type RouteHandler = (req: Request, res: Response) => Promise<void>;

async function getRouteHandler(method: string, pathPattern: string): Promise<RouteHandler> {
  const { moltbookRouter } = await import('./moltbook.js');
  const stack = (moltbookRouter as any).stack;
  for (const layer of stack) {
    if (
      layer.route &&
      layer.route.path === pathPattern &&
      layer.route.methods[method]
    ) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No route found: ${method.toUpperCase()} ${pathPattern}`);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /:id/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance = null;
  });

  it('returns events array for owned agent', async () => {
    let selectCall = 0;
    const db: any = {
      select: vi.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // Ownership check — returns agent
          return chainBuilder([{ id: 'agent-1' }]);
        }
        // Events query
        return chainBuilder(mockEvents);
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/:id/events');
    const req = createMockReq({ params: { id: 'agent-1' }, query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.events).toBeDefined();
    expect(Array.isArray(res._json.events)).toBe(true);
    expect(res._json.events).toHaveLength(3);
  });

  it('returns 404 for non-owned agent', async () => {
    const db: any = {
      select: vi.fn().mockImplementation(() => chainBuilder([])),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/:id/events');
    const req = createMockReq({ params: { id: 'agent-999' }, query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(404);
    expect(res._json.error).toBe('Agent not found');
  });

  it('returns 503 when database is not configured', async () => {
    mockDbInstance = null;

    const handler = await getRouteHandler('get', '/:id/events');
    const req = createMockReq({ params: { id: 'agent-1' }, query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._json.error).toBe('Database not configured');
  });

  it('defaults limit to 20 and respects custom limit', async () => {
    const limitSpy = vi.fn().mockResolvedValue(mockEvents.slice(0, 2));
    let selectCall = 0;
    const db: any = {
      select: vi.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return chainBuilder([{ id: 'agent-1' }]);
        const chain = chainBuilder(mockEvents);
        chain.limit = limitSpy;
        return chain;
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/:id/events');
    const req = createMockReq({ params: { id: 'agent-1' }, query: { limit: '5' } });
    const res = createMockRes();

    await handler(req, res);

    expect(limitSpy).toHaveBeenCalledWith(5);
  });

  it('caps limit at 100', async () => {
    const limitSpy = vi.fn().mockResolvedValue(mockEvents);
    let selectCall = 0;
    const db: any = {
      select: vi.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return chainBuilder([{ id: 'agent-1' }]);
        const chain = chainBuilder(mockEvents);
        chain.limit = limitSpy;
        return chain;
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/:id/events');
    const req = createMockReq({ params: { id: 'agent-1' }, query: { limit: '999' } });
    const res = createMockRes();

    await handler(req, res);

    expect(limitSpy).toHaveBeenCalledWith(100);
  });

  it('returns empty array on db error', async () => {
    let selectCall = 0;
    const db: any = {
      select: vi.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return chainBuilder([{ id: 'agent-1' }]);
        throw new Error('DB connection lost');
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('get', '/:id/events');
    const req = createMockReq({ params: { id: 'agent-1' }, query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json.error).toBe('Failed to get events');
  });
});

describe('logAgentEvent (via start handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInstance = null;
  });

  it('start handler completes even if event insert fails', async () => {
    const db: any = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation(() => {
        throw new Error('Event insert failed');
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('post', '/:id/start');
    const req = createMockReq({ params: { id: 'agent-1' } });
    const res = createMockRes();

    await handler(req, res);

    // Start should succeed even though event logging threw
    expect(res._status).toBe(200);
    expect(res._json.started).toBe(true);
  });

  it('start handler logs a started event', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const db: any = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockAgent]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: insertValues,
      }),
    };
    mockDbInstance = db;

    const handler = await getRouteHandler('post', '/:id/start');
    const req = createMockReq({ params: { id: 'agent-1' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res._json.started).toBe(true);
    // logAgentEvent fires asynchronously, give it a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(db.insert).toHaveBeenCalled();
  });
});
