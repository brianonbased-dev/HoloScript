import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createDaemonJobMock, listDaemonJobsMock, getTelemetrySummaryMock } = vi.hoisted(() => ({
  createDaemonJobMock: vi.fn(),
  listDaemonJobsMock: vi.fn(),
  getTelemetrySummaryMock: vi.fn(),
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

  it('POST returns 400 when required fields are missing', async () => {
    const req = new Request('http://localhost/api/daemon/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required fields/i);
  });

  it('POST creates and returns job when payload is valid', async () => {
    createDaemonJobMock.mockReturnValue({ id: 'dj-created', status: 'queued' });

    const payload = {
      projectId: 'project-1',
      profile: 'balanced',
      projectDna: { domain: 'general' },
      projectPath: '/tmp/project',
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
