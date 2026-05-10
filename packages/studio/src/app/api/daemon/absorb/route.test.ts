import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock, forwardAuthHeadersMock } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  forwardAuthHeadersMock: vi.fn(() => ({ Authorization: 'Bearer user-token' })),
}));

vi.mock('@/lib/services/absorb-client', () => ({
  callMcpTool: callMcpToolMock,
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
}));

vi.mock('@/lib/api-auth', () => ({
  forwardAuthHeaders: forwardAuthHeadersMock,
}));

import { GET, POST } from './route';

describe('/api/daemon/absorb route', () => {
  let tempRoot: string;
  let savedWorkspaceRoot: string | undefined;
  let savedStateFile: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    callMcpToolMock.mockReset();
    forwardAuthHeadersMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
  });

  afterEach(() => {
    if (savedWorkspaceRoot === undefined) {
      delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    } else {
      process.env.HOLOSCRIPT_WORKSPACES_DIR = savedWorkspaceRoot;
    }
    if (savedStateFile === undefined) {
      delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    } else {
      process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = savedStateFile;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('GET returns static guidance payload', async () => {
    const req = new NextRequest('http://localhost/api/daemon/absorb');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.hint).toMatch(/POST instead/i);
  });

  it('POST returns MCP result when tool call succeeds', async () => {
    callMcpToolMock.mockResolvedValue({ ok: true, data: { jobId: 'job-mcp', status: 'queued' } });

    const req = new NextRequest('http://localhost/api/daemon/absorb', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-1', depth: 'deep', tier: 'high' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-mcp');
    const state = JSON.parse(
      fs.readFileSync(path.join(tempRoot, '.absorb-projects.json'), 'utf-8')
    ) as {
      projects: Array<{ id: string; absorbJobs: Array<{ jobId: string; source: string }> }>;
    };
    expect(state.projects[0].id).toBe('proj-1');
    expect(state.projects[0].absorbJobs[0]).toMatchObject({
      jobId: 'job-mcp',
      source: 'mcp',
    });

    expect(callMcpToolMock).toHaveBeenCalledWith('absorb_run_absorb', {
      projectId: 'proj-1',
      depth: 'deep',
      tier: 'high',
    });
  });

  it('POST falls back to HTTP API when MCP result is unavailable', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-http', status: 'running' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/daemon/absorb', {
      method: 'POST',
      body: JSON.stringify({ projectPath: '/tmp/repo', depth: 'medium', tier: 'medium' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-http');

    expect(forwardAuthHeadersMock).toHaveBeenCalled();
    const fetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = (fetchInit.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer user-token');
  });

  it('POST returns 502 when MCP and HTTP fallback both fail', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const req = new NextRequest('http://localhost/api/daemon/absorb', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-fail' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to run absorb_run_absorb/i);
  });
});
