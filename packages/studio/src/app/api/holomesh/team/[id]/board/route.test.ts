import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mock factories (must be at top before any imports)
// ---------------------------------------------------------------------------
const {
  proxyMock,
  boardReadLimitMock,
  boardWriteLimitMock,
  getDbMock,
  dbUpdateMock,
  dbSelectMock,
} = vi.hoisted(() => {
  const dbUpdateMock = vi.fn();
  const dbSelectMock = vi.fn();
  return {
    proxyMock: vi.fn(),
    boardReadLimitMock: vi.fn(),
    boardWriteLimitMock: vi.fn(),
    getDbMock: vi.fn(),
    dbUpdateMock,
    dbSelectMock,
  };
});

vi.mock('@/lib/holomesh-proxy', () => ({ proxyHoloMesh: proxyMock }));
vi.mock('@/lib/rate-limiter', () => ({
  boardReadLimit: boardReadLimitMock,
  boardWriteLimit: boardWriteLimitMock,
}));
vi.mock('@/db/client', () => ({ getDb: getDbMock }));
vi.mock('@/db/schema', () => ({ holomeshBoardTasks: {} }));

// Drizzle-orm mock – just pass through the operator values
vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, val: unknown) => ({ op: 'eq', val }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    op: 'sql',
    strings,
    vals,
  }),
}));

// ---------------------------------------------------------------------------
// Import route handlers under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import { GET as boardGET, POST as boardPOST } from './route';
import { GET as taskGET, PATCH as taskPATCH } from './[taskId]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReq(url = 'http://localhost/api/holomesh/team/t1/board'): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

function makeOkLimit() {
  return { ok: true as const, remaining: 99, reset: Date.now() + 60_000 };
}

function make429Limit() {
  const resp = new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429 });
  return { ok: false as const, response: resp };
}

const teamParam = (id = 't1') => ({ params: Promise.resolve({ id }) });
const taskParam = (id = 't1', taskId = 'task1') => ({
  params: Promise.resolve({ id, taskId }),
});

// ---------------------------------------------------------------------------
// GET /api/holomesh/team/[id]/board
// ---------------------------------------------------------------------------
describe('GET /api/holomesh/team/[id]/board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardReadLimitMock.mockReturnValue(makeOkLimit());
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ success: true, source: 'mcp' })));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('returns 429 when rate limit hit', async () => {
    boardReadLimitMock.mockReturnValue(make429Limit());
    const res = await boardGET(makeReq(), teamParam());
    expect(res.status).toBe(429);
  });

  it('falls through to MCP proxy when DB returns no rows', async () => {
    const db = makeDb([]);
    getDbMock.mockReturnValue(db);
    await boardGET(makeReq(), teamParam());
    expect(proxyMock).toHaveBeenCalledOnce();
  });

  it('serves board from DB when rows exist', async () => {
    const rows = [
      { id: 'task1', status: 'open', priority: 2, syncedAt: new Date() },
      { id: 'task2', status: 'done', priority: 1, syncedAt: new Date() },
    ];
    getDbMock.mockReturnValue(makeDb(rows));
    const res = await boardGET(makeReq(), teamParam());
    const body = await res.json();
    expect(body.source).toBe('db');
    expect(body.board.open).toHaveLength(1);
    expect(body.done.total).toBe(1);
    expect(proxyMock).not.toHaveBeenCalled();
  });

  it('auto-expires stale claimed tasks (> 30 min)', async () => {
    const staleDate = new Date(Date.now() - 35 * 60 * 1000); // 35 min ago
    const rows = [
      { id: 'stale1', status: 'claimed', claimedBy: 'agentX', priority: 2, syncedAt: staleDate },
      { id: 'fresh1', status: 'open', priority: 1, syncedAt: new Date() },
    ];
    const db = makeDb(rows);
    getDbMock.mockReturnValue(db);
    const res = await boardGET(makeReq(), teamParam());
    const body = await res.json();
    // Update should have been called for the stale task
    expect(db.update).toHaveBeenCalled();
    // Response should include expired list
    expect(body.expired).toContain('stale1');
    // Stale task should appear as open now
    const allOpen = body.board.open as Array<{ id: string }>;
    expect(allOpen.some((t) => t.id === 'stale1')).toBe(true);
  });

  it('does not expire fresh claimed tasks', async () => {
    const freshDate = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    const rows = [
      { id: 'fresh1', status: 'claimed', claimedBy: 'agentX', priority: 2, syncedAt: freshDate },
    ];
    const db = makeDb(rows);
    getDbMock.mockReturnValue(db);
    const res = await boardGET(makeReq(), teamParam());
    const body = await res.json();
    expect(db.update).not.toHaveBeenCalled();
    expect(body.expired).toBeUndefined();
    expect(body.board.claimed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/holomesh/team/[id]/board  (thin proxy)
// ---------------------------------------------------------------------------
describe('POST /api/holomesh/team/[id]/board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
  });

  it('proxies POST to HoloMesh', async () => {
    await boardPOST(makeReq(), teamParam());
    expect(proxyMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/holomesh/team/[id]/board/[taskId]
// ---------------------------------------------------------------------------
describe('PATCH /api/holomesh/team/[id]/board/[taskId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardWriteLimitMock.mockReturnValue(makeOkLimit());
    proxyMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, task: { id: 'task1' } }))
    );
  });

  it('returns 429 when rate limit hit', async () => {
    boardWriteLimitMock.mockReturnValue(make429Limit());
    const req = new Request('http://localhost/', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'claim', agentId: 'agent1' }),
    }) as unknown as NextRequest;
    const res = await taskPATCH(req, taskParam());
    expect(res.status).toBe(429);
  });

  it('proxies claim action to MCP and mirrors to DB', async () => {
    const db = makeDb([]);
    getDbMock.mockReturnValue(db);
    const req = patchReq({ action: 'claim', agentId: 'agent1', agentName: 'Agent One' });
    await taskPATCH(req, taskParam());
    expect(proxyMock).toHaveBeenCalledOnce();
    expect(db.update).toHaveBeenCalled();
  });

  it('proxies done action to MCP and mirrors to DB', async () => {
    const db = makeDb([]);
    getDbMock.mockReturnValue(db);
    const req = patchReq({ action: 'done', agentId: 'agent1', commit: 'abc123' });
    await taskPATCH(req, taskParam());
    expect(proxyMock).toHaveBeenCalledOnce();
    expect(db.update).toHaveBeenCalled();
  });

  it('heartbeat: returns 200 and updates syncedAt for owner agent', async () => {
    const db = makeDbWithSelect([{ id: 'task1', status: 'claimed', claimedBy: 'agent1' }]);
    getDbMock.mockReturnValue(db);
    const req = patchReq({ action: 'heartbeat', agentId: 'agent1' });
    const res = await taskPATCH(req, taskParam());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.heartbeat).toBeTruthy();
    // Should NOT forward to MCP
    expect(proxyMock).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('heartbeat: returns 403 when wrong agent tries to heartbeat', async () => {
    const db = makeDbWithSelect([{ id: 'task1', status: 'claimed', claimedBy: 'agent-other' }]);
    getDbMock.mockReturnValue(db);
    const req = patchReq({ action: 'heartbeat', agentId: 'agent1' });
    const res = await taskPATCH(req, taskParam());
    expect(res.status).toBe(403);
    expect(proxyMock).not.toHaveBeenCalled();
  });

  it('heartbeat: returns 404 when task not found', async () => {
    const db = makeDbWithSelect([]); // no rows
    getDbMock.mockReturnValue(db);
    const req = patchReq({ action: 'heartbeat', agentId: 'agent1' });
    const res = await taskPATCH(req, taskParam());
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function patchReq(body: object): NextRequest {
  return new Request('http://localhost/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** Fluent Drizzle query builder mock — returns rows on `.from()` */
function makeDb(rows: object[]) {
  const setMock = vi.fn().mockReturnThis();
  const whereMock = vi.fn().mockReturnThis();
  const limitMock = vi.fn().mockResolvedValue(rows);
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const updateMock = vi.fn().mockReturnValue({ set: setMock });
  setMock.mockReturnValue({ where: whereMock });
  whereMock.mockReturnValue({ orderBy: orderByMock, limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return {
    select: selectMock,
    update: updateMock,
    set: setMock,
    where: whereMock,
    from: fromMock,
  };
}

/** Like makeDb but select resolves to given selectRows (for heartbeat tests) */
function makeDbWithSelect(selectRows: object[]) {
  const setMock = vi.fn().mockReturnThis();
  const whereMock = vi.fn().mockResolvedValue(selectRows);
  const updateWhereMock = vi.fn().mockResolvedValue({ rowCount: 1 });
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });
  const limitMock = vi.fn().mockResolvedValue(selectRows);
  const fromMock = vi.fn().mockReturnValue({ where: { ...whereMock, limit: limitMock } });
  // The select chain in route is: db.select({...}).from(table).where(eq(...)).limit(1)
  const innerWhere = vi.fn().mockReturnValue({ limit: limitMock });
  fromMock.mockReturnValue({ where: innerWhere });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return { select: selectMock, update: updateMock, set: setMock };
}
