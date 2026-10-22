/**
 * card-absorb-projects-route-owner-check: the four problems on main.
 *   1. no session check      -> 401, absorb never called
 *   2. no owner check        -> another user's workspace is 404
 *   3. raw absolute path id  -> 404, absorb never called
 *   4. service-key fallback  -> the key goes only with the user's identity
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sessionMock, tokenMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  tokenMock: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: tokenMock }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { POST } from './route';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const WS_ID = 'ws-11111111-2222-3333-4444-555555555555';

function post(id: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/absorb/projects/${encodeURIComponent(id)}/absorb`, {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function call(id: string, headers: Record<string, string> = {}) {
  return POST(post(id, headers), { params: Promise.resolve({ id }) });
}

describe('/api/absorb/projects/[id]/absorb owner check', () => {
  let tempRoot: string;
  let repoDir: string;
  let savedRoot: string | undefined;
  let savedState: string | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionMock.mockReset();
    tokenMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedState = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-owner-test-'));
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
            sourceUrl: 'https://github.com/o/r',
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
    fetchMock = vi.fn(async () => new Response('{"graphId":"g1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    if (savedRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedRoot;
    if (savedState === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = savedState;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('1. no session: 401 and absorb is never called', async () => {
    sessionMock.mockResolvedValue(null);
    const res = await call(WS_ID);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("2. another user's workspace: 404 and absorb is never called", async () => {
    sessionMock.mockResolvedValue({ user: { id: OTHER } });
    tokenMock.mockResolvedValue('gho_other');
    const res = await call(WS_ID);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('3. an absolute-path id is never a scan root: 404 and absorb is never called', async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
    for (const id of ['/etc', repoDir, path.resolve(tempRoot)]) {
      const res = await call(id);
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('3b. an owned row whose localPath points outside the workspaces root: 404', async () => {
    const statePath = path.join(tempRoot, '.absorb-projects.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.projects[0].localPath = os.tmpdir();
    fs.writeFileSync(statePath, JSON.stringify(state));
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
    const res = await call(WS_ID);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("4. the owner's workspace is forwarded with the user's identity next to the service key", async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
    const res = await call(WS_ID);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://absorb.test/api/absorb/scan');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer absorb-key-test');
    expect(headers['X-User-Authorization']).toBe('Bearer gho_owner');
    const sent = JSON.parse(init.body as string);
    expect(sent.projectId).toBe(WS_ID);
    expect(fs.realpathSync(sent.path)).toBe(fs.realpathSync(repoDir));
  });

  it("5. an Authorization header for someone other than the session owner: 403, nothing sent", async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
    const res = await call(WS_ID, { Authorization: 'Bearer gho_someone_else' });
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('absorb_credential_not_session_owner');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('5b. a header with no session credential to match it: 403, nothing sent', async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue(null);
    const res = await call(WS_ID, { Authorization: 'Bearer gho_someone_else' });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('4b. a signed-in caller with no user credential: 401, the service key is never sent alone', async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue(null);
    const res = await call(WS_ID);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
