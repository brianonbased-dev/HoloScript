/**
 * /api/holodaemon (also served as /api/holoheal) — P0 workspace owner check.
 *
 * Real filesystem + real registry file; only auth and the in-memory job store
 * are mocked. #515 already confines the runner to the workspaces root; these
 * tests pin the OWNERSHIP layer added on top at the route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { registerWorkspaceRows } from '@/lib/workspace/testing/ownedWorkspaceFixture';

const { createDaemonJobMock, listDaemonJobsMock, getTelemetrySummaryMock, requireAuthMock } =
  vi.hoisted(() => ({
    createDaemonJobMock: vi.fn(),
    listDaemonJobsMock: vi.fn(),
    getTelemetrySummaryMock: vi.fn(),
    requireAuthMock: vi.fn(),
  }));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

vi.mock('@/app/api/daemon/jobs/store', () => ({
  createDaemonJob: createDaemonJobMock,
  listDaemonJobs: listDaemonJobsMock,
  getTelemetrySummary: getTelemetrySummaryMock,
}));

import { GET, POST } from './route';

function post(body: unknown): Request {
  return new Request('http://localhost/api/holodaemon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/holodaemon owner check (P0)', () => {
  let savedWorkspacesDir: string | undefined;
  let root: string;
  let repoA: string;

  beforeEach(() => {
    vi.clearAllMocks();
    savedWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'holodaemon-owner-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    repoA = path.join(root, 'ws-owned-by-a', 'repo');
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(path.join(root, 'ws-legacy', 'repo'), { recursive: true });
    registerWorkspaceRows(root, [
      { id: 'ws-owned-by-a', localPath: repoA, ownerId: 'user-a' },
      { id: 'ws-legacy', localPath: path.join(root, 'ws-legacy', 'repo'), ownerId: null },
    ]);
    requireAuthMock.mockResolvedValue({ user: { id: 'user-a' } });
    listDaemonJobsMock.mockReturnValue([]);
    getTelemetrySummaryMock.mockReturnValue({ totalJobs: 0 });
    createDaemonJobMock.mockImplementation((input: Record<string, unknown>) => ({
      id: 'dj-1',
      status: 'queued',
      ...input,
    }));
  });

  afterEach(() => {
    if (savedWorkspacesDir === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedWorkspacesDir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('401 when unauthenticated (#515 requireAuth still first)', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const res = await POST(post({ action: 'start', projectPath: repoA }));
    expect(res.status).toBe(401);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('owner A can start HoloHeal on their own workspace', async () => {
    const res = await POST(post({ action: 'start', projectPath: repoA }));
    expect(res.status).toBe(201);
    expect(createDaemonJobMock).toHaveBeenCalledTimes(1);
    expect(createDaemonJobMock.mock.calls[0][0]).toMatchObject({
      projectPath: repoA,
      userId: 'user-a',
    });
  });

  it("owner B is denied owner A's workspace with the uniform 404 (negative control)", async () => {
    requireAuthMock.mockResolvedValue({ user: { id: 'user-b' } });
    const res = await POST(post({ action: 'start', projectPath: repoA }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Workspace not found or not accessible' });
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('a missing projectPath is refused (400), never falls back to cwd', async () => {
    const res = await POST(post({ action: 'start' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectPath is required/);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('blank or non-string projectPath is refused (400)', async () => {
    for (const projectPath of ['', '   ', 42, null]) {
      const res = await POST(post({ action: 'start', projectPath }));
      expect(res.status).toBe(400);
    }
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('the Studio deployment tree (cwd) is refused even when named explicitly', async () => {
    const res = await POST(post({ action: 'start', projectPath: process.cwd() }));
    expect(res.status).toBe(404);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('a legacy workspace row with no owner is refused', async () => {
    const res = await POST(
      post({ action: 'start', projectPath: path.join(root, 'ws-legacy', 'repo') })
    );
    expect(res.status).toBe(404);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('a traversal that lexically starts in A but escapes the root is refused', async () => {
    const res = await POST(
      post({ action: 'start', projectPath: path.join(repoA, '..', '..', '..') })
    );
    expect(res.status).toBe(404);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('stop needs no projectPath and only touches the caller’s own jobs', async () => {
    const res = await POST(post({ action: 'stop' }));
    expect(res.status).toBe(200);
    expect(listDaemonJobsMock).toHaveBeenCalledWith('user-a');
  });

  it('GET stays scoped to the caller (#515)', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listDaemonJobsMock).toHaveBeenCalledWith('user-a');
    expect(getTelemetrySummaryMock).toHaveBeenCalledWith('user-a');
  });
});
