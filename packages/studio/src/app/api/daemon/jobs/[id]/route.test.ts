import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
  applyPatchesToWorkspaceBranchMock,
  getDaemonJobMock,
  getJobPatchesMock,
  getJobLogsMock,
  recordPatchActionMock,
  requireAuthMock,
} = vi.hoisted(() => ({
  applyPatchesToWorkspaceBranchMock: vi.fn(),
  getDaemonJobMock: vi.fn(),
  getJobPatchesMock: vi.fn(),
  getJobLogsMock: vi.fn(),
  recordPatchActionMock: vi.fn(),
  requireAuthMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('../store', () => ({
  applyPatchesToWorkspaceBranch: applyPatchesToWorkspaceBranchMock,
  getDaemonJob: getDaemonJobMock,
  getJobPatches: getJobPatchesMock,
  getJobLogs: getJobLogsMock,
  recordPatchAction: recordPatchActionMock,
}));

import { GET, POST } from './route';

describe('/api/daemon/jobs/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: 'user-test-1' } });
  });

  it('returns 401 when requireAuth fails', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    getDaemonJobMock.mockReturnValue({ id: 'dj-1', status: 'running' });

    const res = await GET(new Request('http://localhost/api/daemon/jobs/dj-1'), {
      params: Promise.resolve({ id: 'dj-1' }),
    });

    expect(res.status).toBe(401);
    expect(getDaemonJobMock).not.toHaveBeenCalled();
  });

  it('GET returns 404 when job is missing', async () => {
    getDaemonJobMock.mockReturnValue(null);

    const res = await GET(new Request('http://localhost/api/daemon/jobs/dj-missing'), {
      params: Promise.resolve({ id: 'dj-missing' }),
    });

    expect(res.status).toBe(404);
  });

  it('GET returns full job by default', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-1', status: 'running' });

    const res = await GET(new Request('http://localhost/api/daemon/jobs/dj-1'), {
      params: Promise.resolve({ id: 'dj-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe('dj-1');
  });

  it('GET returns patches when view=patches', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-2', status: 'running' });
    getJobPatchesMock.mockReturnValue([{ id: 'patch-1' }]);

    const res = await GET(new Request('http://localhost/api/daemon/jobs/dj-2?view=patches'), {
      params: Promise.resolve({ id: 'dj-2' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('dj-2');
    expect(body.patches).toHaveLength(1);
  });

  it('GET returns logs when view=logs', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-3', status: 'running' });
    getJobLogsMock.mockReturnValue([{ id: 'log-1' }]);

    const res = await GET(new Request('http://localhost/api/daemon/jobs/dj-3?view=logs'), {
      params: Promise.resolve({ id: 'dj-3' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('dj-3');
    expect(body.logs).toHaveLength(1);
  });

  it('POST returns 404 when job is missing', async () => {
    getDaemonJobMock.mockReturnValue(null);

    const req = new Request('http://localhost/api/daemon/jobs/dj-missing', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply', patchIds: ['p1'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-missing' }) });
    expect(res.status).toBe(404);
  });

  it('POST returns 400 on invalid JSON body', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-4' });

    const req = new Request('http://localhost/api/daemon/jobs/dj-4', {
      method: 'POST',
      body: '{bad-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-4' }) });
    expect(res.status).toBe(400);
  });

  it('POST returns 400 on missing action or patchIds', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-5' });

    const req = new Request('http://localhost/api/daemon/jobs/dj-5', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-5' }) });
    expect(res.status).toBe(400);
  });

  it('POST returns 400 on invalid action', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-6' });

    const req = new Request('http://localhost/api/daemon/jobs/dj-6', {
      method: 'POST',
      body: JSON.stringify({ action: 'ship', patchIds: ['p1'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-6' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid action/i);
  });

  it('POST records patch action and returns success for apply', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-7' });

    const req = new Request('http://localhost/api/daemon/jobs/dj-7', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply', patchIds: ['p1', 'p2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-7' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe('applied');
    expect(body.patchCount).toBe(2);
    expect(recordPatchActionMock).toHaveBeenCalledWith('dj-7', ['p1', 'p2'], 'applied');
  });

  it('POST applies selected patches to a durable branch', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-9' });
    applyPatchesToWorkspaceBranchMock.mockReturnValue({
      branchName: 'studio/project/dj-9',
      baseBranch: 'main',
      commitHash: 'abc1234',
      files: ['src/app.ts'],
      noChanges: false,
      pushRequest: {
        workspacePath: '/home/test/.holoscript/workspaces/project',
        remote: 'origin',
        branch: 'studio/project/dj-9',
        force: false,
      },
      pullRequest: {
        owner: 'owner',
        repo: 'repo',
        title: 'Apply daemon patches from dj-9',
        body: 'Changed files',
        head: 'studio/project/dj-9',
        base: 'main',
        draft: true,
      },
    });

    const req = new Request('http://localhost/api/daemon/jobs/dj-9', {
      method: 'POST',
      body: JSON.stringify({
        action: 'apply-to-branch',
        patchIds: ['p1'],
        branchName: 'studio/project/dj-9',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-9' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe('applied');
    expect(body.applyResult.commitHash).toBe('abc1234');
    expect(applyPatchesToWorkspaceBranchMock).toHaveBeenCalledWith('dj-9', ['p1'], {
      branchName: 'studio/project/dj-9',
      baseBranch: undefined,
    });
    expect(recordPatchActionMock).toHaveBeenCalledWith('dj-9', ['p1'], 'applied');
  });

  it('POST returns 400 when branch application fails', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-10' });
    applyPatchesToWorkspaceBranchMock.mockImplementation(() => {
      throw new Error('Workspace has uncommitted changes');
    });

    const req = new Request('http://localhost/api/daemon/jobs/dj-10', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply-to-branch', patchIds: ['p1'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'dj-10' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/uncommitted changes/i);
    expect(recordPatchActionMock).not.toHaveBeenCalled();
  });

  it('POST maps export/reject actions correctly', async () => {
    getDaemonJobMock.mockReturnValue({ id: 'dj-8' });

    const exportReq = new Request('http://localhost/api/daemon/jobs/dj-8', {
      method: 'POST',
      body: JSON.stringify({ action: 'export', patchIds: ['p3'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const rejectReq = new Request('http://localhost/api/daemon/jobs/dj-8', {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', patchIds: ['p4'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const exportRes = await POST(exportReq, { params: Promise.resolve({ id: 'dj-8' }) });
    const rejectRes = await POST(rejectReq, { params: Promise.resolve({ id: 'dj-8' }) });

    expect(exportRes.status).toBe(200);
    expect(rejectRes.status).toBe(200);

    const exportBody = await exportRes.json();
    const rejectBody = await rejectRes.json();

    expect(exportBody.action).toBe('exported');
    expect(rejectBody.action).toBe('rejected');

    expect(recordPatchActionMock).toHaveBeenCalledWith('dj-8', ['p3'], 'exported');
    expect(recordPatchActionMock).toHaveBeenCalledWith('dj-8', ['p4'], 'rejected');
  });
});
