import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock, sessionMock, tokenMock } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  sessionMock: vi.fn(),
  tokenMock: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: tokenMock }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
  callMcpTool: callMcpToolMock,
}));

import { POST } from './route';

const OWNER = 'user-owner';
const WS_ID = 'ws-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function post(id: string, body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/absorb/projects/${encodeURIComponent(id)}/absorb`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('/api/absorb/projects/[id]/absorb route (direct absorb /scan, no MCP loop)', () => {
  let tempRoot: string;
  let repoDir: string;
  let savedWorkspaceRoot: string | undefined;
  let savedStateFile: string | undefined;

  function readJobs() {
    const state = JSON.parse(
      fs.readFileSync(path.join(tempRoot, '.absorb-projects.json'), 'utf-8')
    ) as { projects: Array<{ id: string; absorbJobs: Array<{ status: string; error: string | null }> }> };
    return state.projects.flatMap((p) => p.absorbJobs);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    callMcpToolMock.mockReset();
    sessionMock.mockReset();
    tokenMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-absorb-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    repoDir = path.join(tempRoot, WS_ID, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(tempRoot, '.absorb-projects.json'),
      JSON.stringify({
        version: 1,
        updatedAt: now,
        projects: [
          {
            id: WS_ID,
            name: 'repo',
            sourceType: 'github',
            localPath: repoDir,
            status: 'ready',
            ownerId: OWNER,
            absorbJobs: [],
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    );
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
    await POST(post(WS_ID, '{"depth":"deep"}'), { params: Promise.resolve({ id: WS_ID }) });
    expect(callMcpToolMock).not.toHaveBeenCalled();
  });

  it('calls absorb /scan once with only path, shallow and projectId, and returns its result', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"graphId":"g1","stats":{"totalFiles":3},"cost":10}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(post(WS_ID, '{"depth":"shallow","tier":"ultra","rootDir":"/etc"}'), {
      params: Promise.resolve({ id: WS_ID }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).graphId).toBe('g1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://absorb.test/api/absorb/scan');
    expect(JSON.parse(init.body as string)).toEqual({
      path: fs.realpathSync(repoDir),
      shallow: true,
      projectId: WS_ID,
    });
  });

  it("an Authorization header that is the owner's own credential is forwarded as the user identity", async () => {
    const fetchMock = vi.fn(async () => new Response('{"graphId":"g1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await POST(post(WS_ID, '{}', { Authorization: 'Bearer gho_owner' }), {
      params: Promise.resolve({ id: WS_ID }),
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer absorb-key-test');
    expect(headers['X-User-Authorization']).toBe('Bearer gho_owner');
  });

  it('an id that is not a saved workspace: 404, nothing sent', async () => {
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
    const res = await POST(post(WS_ID, '{}'), { params: Promise.resolve({ id: WS_ID }) });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Absorb could not run/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('absorb 5xx: 502 with a short reason; upstream text only in the job record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('stack trace secret-ish', { status: 500 })));
    const res = await POST(post(WS_ID, '{"depth":"shallow"}'), {
      params: Promise.resolve({ id: WS_ID }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.reason).toBe('absorb_upstream_failed');
    expect(JSON.stringify(body)).not.toContain('stack trace');
    const recorded = readJobs()[0];
    expect(recorded.status).toBe('failed');
    expect(recorded.error).toContain('HTTP 500');
  });

  it("absorb's own refusals pass through: 402 not enough credits", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Not enough credits"}', { status: 402 })));
    const res = await POST(post(WS_ID, '{}'), { params: Promise.resolve({ id: WS_ID }) });
    expect(res.status).toBe(402);
    expect((await res.json()).reason).toBe('absorb_refused');
  });

  it('refuses a JSON body that is not an object (null) with 400, not a 500', async () => {
    const res = await POST(post(WS_ID, 'null'), { params: Promise.resolve({ id: WS_ID }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('JSON body must be an object');
  });

  it('refuses a malformed JSON body with the parse error instead of running with defaults', async () => {
    const res = await POST(post(WS_ID, '{"depth":'), { params: Promise.resolve({ id: WS_ID }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Invalid JSON body: /);
  });
});
