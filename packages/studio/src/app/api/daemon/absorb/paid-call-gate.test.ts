import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// #620 (CoS): nothing paid runs, not even the primary MCP call, before the
// session, the payer and assertWorkspaceOwner. The owner is charged once,
// with an importId, never on the service key alone. Real filesystem.
const { callMcpToolMock, auth } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  auth: { session: null as unknown, token: 'gho_owner' as string | null },
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => auth.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: vi.fn(async () => auth.token) }));
vi.mock('@/lib/services/absorb-client', async (importOriginal) => ({
  mcpClearlyDidNotRun: (await importOriginal<typeof import('@/lib/services/absorb-client')>())
    .mcpClearlyDidNotRun,
  callMcpTool: callMcpToolMock,
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { POST } from './route';
import { registerWorkspaceRows, sessionFor } from '@/lib/workspace/testing/ownedWorkspaceFixture';

function post(projectPath: string, extra: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify({ projectPath, ...extra }),
    headers: { 'Content-Type': 'application/json' },
  });
}

const OWNER_HEADERS = { Authorization: 'Bearer service-key', 'X-User-Authorization': 'Bearer gho_owner' };

describe('/api/daemon/absorb: session, payer and owner before any paid call (#620)', () => {
  let tempRoot: string;
  let repoA: string;
  let repoB: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
  const originalStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-paid-gate-'));
    const root = path.join(tempRoot, 'workspaces');
    repoA = path.join(root, 'ws-aaaa', 'repo-a');
    repoB = path.join(root, 'ws-bbbb', 'repo-b');
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    registerWorkspaceRows(root, [
      { id: 'ws-aaaa', localPath: repoA, ownerId: 'user-a' },
      { id: 'ws-bbbb', localPath: repoB, ownerId: 'user-b' },
    ]);
    auth.session = sessionFor('user-a');
    auth.token = 'gho_owner';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    callMcpToolMock.mockReset();
    callMcpToolMock.mockResolvedValue({ ok: true, data: { status: 'complete', cost: 10 } });
    fetchMock = vi.fn(async () => new Response('{"status":"complete"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWorkspacesDir === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = originalWorkspacesDir;
    if (originalStateFile === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = originalStateFile;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('no session: 401, and neither MCP nor /scan is called', async () => {
    auth.session = null;
    const res = await POST(post(repoA));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_not_authenticated');
    expect(callMcpToolMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a foreign path (another user's workspace): 404, and MCP is never called", async () => {
    const res = await POST(post(repoB));
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('absorb_workspace_not_owned');
    expect(callMcpToolMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a path outside the workspaces root: 404, MCP never called', async () => {
    const res = await POST(post(os.tmpdir()));
    expect(res.status).toBe(404);
    expect(callMcpToolMock).not.toHaveBeenCalled();
  });

  it('no projectPath: 400, MCP never called', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/daemon/absorb', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('absorb_project_path_required');
    expect(callMcpToolMock).not.toHaveBeenCalled();
  });

  it('the owner is charged once: one MCP call, as the owner, with an importId, on the realpath', async () => {
    const res = await POST(post(repoA));
    expect(res.status).toBe(200);
    expect(callMcpToolMock).toHaveBeenCalledTimes(1);
    const [tool, args, headers] = callMcpToolMock.mock.calls[0];
    expect(tool).toBe('absorb_run_absorb');
    expect(args.projectId).toBe(fs.realpathSync(repoA));
    expect(args.importId).toMatch(/^[A-Za-z0-9-]{8,100}$/);
    // Never the service key alone: the owner's credential always goes with it.
    expect(headers).toEqual(OWNER_HEADERS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('MCP clearly did not run: one /scan as the owner, with the SAME importId', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null, error: 'ECONNREFUSED', failure: 'refused' });
    const res = await POST(post(repoA));
    expect(res.status).toBe(200);
    expect(callMcpToolMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject(OWNER_HEADERS);
    const sent = JSON.parse(init.body as string);
    expect(sent.importId).toBe(callMcpToolMock.mock.calls[0][1].importId);
    expect(sent.path).toBe(fs.realpathSync(repoA));
  });

  it('MCP may have run (5xx): no /scan, so no second charge', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null, error: 'MCP 502', failure: 'http_5xx' });
    const res = await POST(post(repoA));
    expect(res.status).toBe(502);
    expect(callMcpToolMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a client retry's importId is reused; a malformed one is refused before any call", async () => {
    await POST(post(repoA, { importId: 'retry-0001-abcd' }));
    expect(callMcpToolMock.mock.calls[0][1].importId).toBe('retry-0001-abcd');
    callMcpToolMock.mockClear();
    const res = await POST(post(repoA, { importId: 'bad id!' }));
    expect(res.status).toBe(400);
    expect(callMcpToolMock).not.toHaveBeenCalled();
  });
});