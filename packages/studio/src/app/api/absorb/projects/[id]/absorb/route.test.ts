import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
}));

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
  callMcpTool: callMcpToolMock,
}));

import { POST } from './route';

describe('/api/absorb/projects/[id]/absorb route', () => {
  let tempRoot: string;
  let savedWorkspaceRoot: string | undefined;
  let savedStateFile: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    callMcpToolMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-absorb-test-'));
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

  it('returns MCP tool result when available', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: true,
      data: { jobId: 'job-1', status: 'queued' },
    });

    const req = new NextRequest('http://localhost/api/absorb/projects/p123/absorb', {
      method: 'POST',
      body: JSON.stringify({ depth: 'deep', tier: 'high' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-1');
    const state = JSON.parse(
      fs.readFileSync(path.join(tempRoot, '.absorb-projects.json'), 'utf-8')
    ) as {
      projects: Array<{ id: string; absorbJobs: Array<{ jobId: string; source: string }> }>;
    };
    expect(state.projects[0].id).toBe('p123');
    expect(state.projects[0].absorbJobs[0]).toMatchObject({
      jobId: 'job-1',
      source: 'mcp',
    });

    expect(callMcpToolMock).toHaveBeenCalledWith('absorb_run_absorb', {
      projectId: 'p123',
      depth: 'deep',
      tier: 'high',
    });
  });

  it('falls back to HTTP API when MCP result is unavailable', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ jobId: 'job-http', status: 'running' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/projects/p999/absorb', {
      method: 'POST',
      body: JSON.stringify({ depth: 'shallow', tier: 'medium' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p999' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-http');
  });

  it('returns 502 when both MCP and HTTP fallback fail', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const req = new NextRequest('http://localhost/api/absorb/projects/p404/absorb', {
      method: 'POST',
      body: JSON.stringify({ depth: 'shallow', tier: 'medium' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p404' }) });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to run absorb_run_absorb/i);
  });
});
