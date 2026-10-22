import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// #620: the /scan fallback scans only a workspace the session owner OWNS,
// checked with assertWorkspaceOwner exactly as #618 does. Real filesystem and
// real workspace registry: users A and B each own one workspace.
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

function post(projectPath: string): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify({ projectPath }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/daemon/absorb fallback: workspace owner check (#620)', () => {
  let tempRoot: string;
  let repoA: string;
  let repoB: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
  const originalStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-fallback-owner-'));
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
    callMcpToolMock.mockResolvedValue({ ok: false, data: null, error: 'MCP 400', failure: 'http_4xx' });
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

  it("another user's workspace is refused (404) and /scan is never called", async () => {
    const res = await POST(post(repoB));
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('absorb_workspace_not_owned');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a path outside the workspaces root is refused, no /scan', async () => {
    const res = await POST(post(os.tmpdir()));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the owner's own workspace scans, with the realpath sent to /scan", async () => {
    const res = await POST(post(repoA));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.path).toBe(fs.realpathSync(repoA));
  });
});