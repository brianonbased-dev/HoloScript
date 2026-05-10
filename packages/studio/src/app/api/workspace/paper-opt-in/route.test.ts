import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import * as fs from 'fs';

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from 'next-auth';

// Mock fs
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  existsSync: vi.fn(() => true),
}));

// Mock path
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...(actual as object),
    resolve: vi.fn((...args: string[]) => args.join('/').replace(/\/+/g, '/')),
    relative: vi.fn((_from: string, to: string) =>
      to.startsWith('/home/user/.holoscript/workspaces') ? 'workspace/abc' : '../../../outside'
    ),
  };
});

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user'),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('POST /api/workspace/paper-opt-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  function makeReq(body: unknown) {
    return {
      json: vi.fn().mockResolvedValue(body),
    } as unknown as Request;
  }

  it('returns 401 when unauthenticated', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = makeReq({
      workspaceId: 'ws-1',
      localPath: '/home/user/.holoscript/workspaces/ws-1/repo',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when workspaceId is missing', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    const req = makeReq({ localPath: '/path' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when localPath is missing', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    const req = makeReq({ workspaceId: 'ws-1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 403 when localPath is outside workspace root', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    const req = makeReq({ workspaceId: 'ws-1', localPath: '/etc/passwd' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('creates research artifacts and returns opted-in state', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    const req = makeReq({
      workspaceId: 'ws-1',
      localPath: '/home/user/.holoscript/workspaces/ws-1/repo',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.paperUnlockState.status).toBe('opted-in');
    expect(data.paperUnlockState.artifactsCreated).toContain('research/paper-cell.json');
    expect(data.paperUnlockState.artifactsCreated).toContain('research/d011-checklist.json');
    expect(data.paperUnlockState.artifactsCreated).toContain('research/evidence-refs.json');
    expect(data.paperUnlockState.artifactsCreated).toContain('memory/research-packet.json');
    expect(data.paperUnlockState.publicKnowledgeConsent).toBe(false);
    expect(data.paperUnlockState.publicationPrepConsent).toBe(false);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/memory[\\/]+research-packet\.json/),
      expect.stringContaining('"privacy": "workspace-local"')
    );
  });

  it('creates board tasks without publishing public knowledge when only board consent is present', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    mockFetch.mockImplementation(async (url: string | URL) => {
      if (typeof url === 'string' && url.includes('/board')) {
        return {
          ok: true,
          json: async () => ({ tasks: [{ id: 'task_123' }] }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/knowledge')) {
        return {
          ok: true,
          json: async () => ({ entries: [{ id: 'entry_456' }] }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const req = makeReq({
      workspaceId: 'ws-1',
      localPath: '/home/user/.holoscript/workspaces/ws-1/repo',
      teamId: 'team_abc',
      createBoardTasks: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paperUnlockState.boardTaskIds).toContain('task_123');
    expect(data.paperUnlockState.knowledgeEntryIds).toEqual([]);
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/knowledge'))).toBe(false);
  });

  it('publishes public knowledge only with explicit consent', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    mockFetch.mockImplementation(async (url: string | URL) => {
      if (typeof url === 'string' && url.includes('/knowledge')) {
        return {
          ok: true,
          json: async () => ({ entries: [{ id: 'entry_456' }] }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const req = makeReq({
      workspaceId: 'ws-1',
      localPath: '/home/user/.holoscript/workspaces/ws-1/repo',
      teamId: 'team_abc',
      syncPublicKnowledge: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.paperUnlockState.knowledgeEntryIds).toContain('entry_456');
    expect(data.paperUnlockState.publicKnowledgeConsent).toBe(true);
  });

  it('requires a teamId when public knowledge sync is requested', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    const req = makeReq({
      workspaceId: 'ws-1',
      localPath: '/home/user/.holoscript/workspaces/ws-1/repo',
      syncPublicKnowledge: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
