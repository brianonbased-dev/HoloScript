import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listDaemonJobsMock, getTelemetrySummaryMock, loadDaemonSurfaceMock, requireAuthMock } =
  vi.hoisted(() => ({
    listDaemonJobsMock: vi.fn(),
    getTelemetrySummaryMock: vi.fn(),
    loadDaemonSurfaceMock: vi.fn(),
    requireAuthMock: vi.fn(),
  }));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

vi.mock('@/app/api/daemon/jobs/store', () => ({
  listDaemonJobs: listDaemonJobsMock,
  getTelemetrySummary: getTelemetrySummaryMock,
}));

vi.mock('@/lib/daemon/compositionSurfaces', () => ({
  loadDaemonSurface: loadDaemonSurfaceMock,
}));

import { GET } from './route';

describe('/api/daemon/surface route', () => {
  const jobs = [{ id: 'job-1' }];
  const telemetry = {
    totalJobs: 1,
    completedJobs: 0,
    failedJobs: 0,
    totalPatches: 0,
    appliedPatches: 0,
    avgQualityDelta: 0,
    avgDurationMs: 0,
    profileUsage: { quick: 0, balanced: 1, deep: 0 },
    recentEvents: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listDaemonJobsMock.mockReturnValue(jobs);
    getTelemetrySummaryMock.mockReturnValue(telemetry);
    requireAuthMock.mockResolvedValue({ user: { id: 'user-test-1' } });
  });

  it("lists only the signed-in caller's jobs and refuses anonymous callers", async () => {
    await GET(new Request('http://localhost/api/daemon/surface'));
    expect(listDaemonJobsMock).toHaveBeenCalledWith('user-test-1');
    const { NextResponse } = await import('next/server');
    requireAuthMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const res = await GET(new Request('http://localhost/api/daemon/surface'));
    expect(res.status).toBe(401);
  });

  it('returns hydrated dashboard surface by default', async () => {
    loadDaemonSurfaceMock.mockResolvedValue({
      kind: 'dashboard',
      format: 'hsplus',
      name: 'StudioOperationsDashboard',
      code: 'composition "StudioOperationsDashboard" {}',
      sourcePath: 'compositions/studio-operations-dashboard.hsplus',
      validation: { valid: true, errors: [] },
      summary: {
        activityCount: 0,
        agentCount: 0,
        forkCount: 0,
        runningJobs: 0,
        queuedJobs: 0,
        reviewJobs: 0,
      },
    });

    const response = await GET(new Request('http://localhost/api/daemon/surface'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(loadDaemonSurfaceMock).toHaveBeenCalledWith('dashboard', jobs, telemetry);
    expect(body.kind).toBe('dashboard');
    expect(body.jobCount).toBe(1);
    expect(body.generation).toEqual({
      native: true,
      mode: 'loaded-from-composition',
      hydrated: true,
    });
  });

  it('returns orchestration surface when kind query is set', async () => {
    loadDaemonSurfaceMock.mockResolvedValue({
      kind: 'orchestration',
      format: 'hsplus',
      name: 'StudioJobOrchestration',
      code: 'composition "StudioJobOrchestration" {}',
      sourcePath: 'compositions/studio-job-orchestration.hsplus',
      validation: { valid: true, errors: [] },
      summary: {
        activityCount: 1,
        agentCount: 1,
        forkCount: 1,
        runningJobs: 1,
        queuedJobs: 0,
        reviewJobs: 0,
      },
    });

    const response = await GET(
      new Request('http://localhost/api/daemon/surface?kind=orchestration')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(loadDaemonSurfaceMock).toHaveBeenCalledWith('orchestration', jobs, telemetry);
    expect(body.kind).toBe('orchestration');
  });

  it('returns structured 500 payload when loading fails', async () => {
    loadDaemonSurfaceMock.mockRejectedValue(new Error('boom'));

    const response = await GET(new Request('http://localhost/api/daemon/surface?kind=dashboard'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.kind).toBe('dashboard');
    expect(body.validation.valid).toBe(false);
    expect(body.validation.errors).toContain('boom');
    expect(body.generation.hydrated).toBe(false);
  });
});
