import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import * as path from 'path';
import * as os from 'os';

const { createDaemonJobMock, listDaemonJobsMock, getTelemetrySummaryMock, requireAuthMock } =
  vi.hoisted(() => ({
    createDaemonJobMock: vi.fn(),
    listDaemonJobsMock: vi.fn(),
    getTelemetrySummaryMock: vi.fn(),
    requireAuthMock: vi.fn(),
  }));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('./store', () => ({
  createDaemonJob: createDaemonJobMock,
  listDaemonJobs: listDaemonJobsMock,
  getTelemetrySummary: getTelemetrySummaryMock,
}));

import { GET, POST } from './route';

describe('/api/daemon/jobs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: 'user-test-1' } });
  });

  it('returns 401 when requireAuth fails', async () => {
    requireAuthMock.mockResolvedValue(NextResponse.json({ error: 'Authentication required' }, { status: 401 }));

    const res = await GET(new Request('http://localhost/api/daemon/jobs'));
    expect(res.status).toBe(401);
  });

  it('GET returns jobs by default', async () => {
    listDaemonJobsMock.mockReturnValue([{ id: 'dj-1' }]);

    const res = await GET(new Request('http://localhost/api/daemon/jobs'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe('dj-1');
  });

  it('GET returns telemetry when view=telemetry', async () => {
    getTelemetrySummaryMock.mockReturnValue({ totalJobs: 3, completedJobs: 2 });

    const res = await GET(new Request('http://localhost/api/daemon/jobs?view=telemetry'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.telemetry.totalJobs).toBe(3);
    expect(body.telemetry.completedJobs).toBe(2);
  });

  it('POST returns 400 on invalid JSON body', async () => {
    const req = new Request('http://localhost/api/daemon/jobs', {
      method: 'POST',
      body: '{invalid-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON body/i);
  });

  it('POST returns 400 when Zod validation fails (missing profile / dna)', async () => {
    const req = new Request('http://localhost/api/daemon/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid body/i);
  });

  it('POST rejects projectPath outside ~/.holoscript/workspaces', async () => {
    const req = new Request('http://localhost/api/daemon/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        profile: 'balanced',
        projectDna: { domain: 'general' },
        projectPath: '/tmp/evil-escape',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/projectPath must be inside/i);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('POST rejects shell-like projectPath outside workspace (SEC-T02 $(whoami) case)', async () => {
    const req = new Request('http://localhost/api/daemon/jobs', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        profile: 'balanced',
        projectDna: { domain: 'general' },
        projectPath: '/tmp/$(whoami)',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(createDaemonJobMock).not.toHaveBeenCalled();
  });

  it('POST creates and returns job when payload is valid', async () => {
    createDaemonJobMock.mockReturnValue({ id: 'dj-created', status: 'queued' });

    const workspaceRoot = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(),
      '.holoscript',
      'workspaces'
    );
    const safeProjectPath = path.join(workspaceRoot, 'project-1');

    const payload = {
      projectId: 'project-1',
      profile: 'balanced',
      projectDna: { domain: 'general' },
      projectPath: safeProjectPath,
    };

    const req = new Request('http://localhost/api/daemon/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job.id).toBe('dj-created');
    expect(createDaemonJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        profile: 'balanced',
      })
    );
  });
});
