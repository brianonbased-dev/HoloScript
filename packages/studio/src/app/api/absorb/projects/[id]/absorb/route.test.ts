import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock, auth } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  auth: { userToken: 'gh-user-token' as string | null },
}));

vi.mock('@/app/api/github/_shared', () => ({
  getGitHubToken: vi.fn(async () => auth.userToken),
}));

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
  callMcpTool: callMcpToolMock,
}));

import { POST } from './route';

const WS_PATH = '/ws/ws-1/repo';

function post(id: string, body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/absorb/projects/${encodeURIComponent(id)}/absorb`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('/api/absorb/projects/[id]/absorb route (direct absorb /scan, no MCP loop)', () => {
  let tempRoot: string;
  let savedWorkspaceRoot: string | undefined;
  let savedStateFile: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    callMcpToolMock.mockReset();
    auth.userToken = 'gh-user-token';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-absorb-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
  });

  afterEach(() => {
    if (savedWorkspaceRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedWorkspaceRoot;
    if (savedStateFile === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = savedStateFile;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('never calls the absorb_run_absorb MCP tool (that tool calls this route: the loop)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"graphId":"g1","stats":{"totalFiles":1}}', { status: 200 }))
    );
    await POST(post(WS_PATH, '{"depth":"deep"}'), { params: Promise.resolve({ id: WS_PATH }) });
    expect(callMcpToolMock).not.toHaveBeenCalled();
  });

  it('calls absorb /scan once with only path, shallow and projectId, and returns its result', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"graphId":"g1","stats":{"totalFiles":3},"cost":10}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(post(WS_PATH, '{"depth":"shallow","tier":"ultra","rootDir":"/etc"}'), {
      params: Promise.resolve({ id: WS_PATH }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).graphId).toBe('g1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://absorb.test/api/absorb/scan');
    expect(JSON.parse(init.body as string)).toEqual({ path: WS_PATH, shallow: true, projectId: WS_PATH });
    // No service key ever on a paid scan: only the user's own credential.
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gh-user-token');
    expect((init.headers as Record<string, string>)['X-User-Authorization']).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain('absorb-key-test');
  });

  it('no user credential: 401 absorb_no_user_credential, nothing sent, no service-key fallback', async () => {
    auth.userToken = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(post(WS_PATH, '{}', { Authorization: 'Bearer absorb-key-test' }), {
      params: Promise.resolve({ id: WS_PATH }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: 'absorb_no_user_credential' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an id that is neither a saved project nor a path: 404, nothing sent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(post('p999', '{}'), { params: Promise.resolve({ id: 'p999' }) });
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('absorb_no_project_path');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timeout or network error: 502, one attempt, no retry', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(post(WS_PATH, '{}'), { params: Promise.resolve({ id: WS_PATH }) });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Absorb could not run/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('absorb 5xx: 502 with a short reason; upstream text only in the job record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('stack trace secret-ish', { status: 500 })));
    const res = await POST(post(WS_PATH, '{"depth":"shallow"}'), {
      params: Promise.resolve({ id: WS_PATH }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.reason).toBe('absorb_upstream_failed');
    expect(JSON.stringify(body)).not.toContain('stack trace');
    const state = JSON.parse(
      fs.readFileSync(path.join(tempRoot, '.absorb-projects.json'), 'utf-8')
    ) as { projects: Array<{ absorbJobs: Array<{ status: string; error: string | null }> }> };
    const recorded = state.projects[0].absorbJobs[0];
    expect(recorded.status).toBe('failed');
    expect(recorded.error).toContain('HTTP 500');
  });

  it("absorb's own refusals pass through: 402 not enough credits", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Not enough credits"}', { status: 402 })));
    const res = await POST(post(WS_PATH, '{}'), { params: Promise.resolve({ id: WS_PATH }) });
    expect(res.status).toBe(402);
    expect((await res.json()).reason).toBe('absorb_refused');
  });

  it('refuses a JSON body that is not an object (null) with 400, not a 500', async () => {
    const res = await POST(post('p401', 'null'), { params: Promise.resolve({ id: 'p401' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('JSON body must be an object');
  });

  it('refuses a malformed JSON body with the parse error instead of running with defaults', async () => {
    const res = await POST(post('p400', '{"depth":'), { params: Promise.resolve({ id: 'p400' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Invalid JSON body: /);
  });
});
