/**
 * /api/absorb/projects/[id]/absorb/stream: session plus owner check, matching
 * POST /api/absorb/projects/[id]/absorb (#618), and an allowlisted body.
 * The proxy behavior (query params, reconnect cursor, upstream errors) is kept.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sessionMock, tokenMock } = vi.hoisted(() => ({ sessionMock: vi.fn(), tokenMock: vi.fn() }));

vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: tokenMock }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));
// Old route only: it forwarded whatever this returned. The fixed route must not use it.
vi.mock('@/lib/api-auth', () => ({
  forwardAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer absorb-key-test' })),
}));
vi.mock('@/lib/absorbStreamContract', () => ({
  ABSORB_PROGRESS_CONTRACT_VERSION: 'v-test',
  toAbsorbProgressContractEvent: vi.fn((event) => event),
}));
vi.mock('@/lib/sseStreamProxy', () => ({
  resolveReconnectCursor: vi.fn(() => 'cursor-123'),
  createSSEHeartbeatStream: vi.fn((body) => body),
}));

import { GET, POST } from './route';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const WS_ID = 'ws-11111111-2222-3333-4444-555555555555';
const URL_BASE = 'http://localhost/api/absorb/projects';

const sse = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"status":"running"}\n\n'));
        c.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );

function get(id: string, query = '', headers: Record<string, string> = {}) {
  const req = new NextRequest(`${URL_BASE}/${encodeURIComponent(id)}/absorb/stream${query}`, { headers });
  return GET(req, { params: Promise.resolve({ id }) });
}
function post(id: string, body: unknown, headers: Record<string, string> = {}) {
  const req = new NextRequest(`${URL_BASE}/${encodeURIComponent(id)}/absorb/stream`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe('/api/absorb/projects/[id]/absorb/stream owner check', () => {
  let tempRoot: string;
  let savedRoot: string | undefined;
  let savedState: string | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    sessionMock.mockReset();
    tokenMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedState = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-stream-owner-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    const repoDir = path.join(tempRoot, WS_ID, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(tempRoot, '.absorb-projects.json'),
      JSON.stringify({
        version: 1,
        updatedAt: now,
        projects: [
          {
            id: WS_ID, name: 'repo', sourceType: 'github', sourceUrl: 'https://github.com/o/r',
            localPath: repoDir, status: 'ready', ownerId: OWNER, absorbJobs: [], createdAt: now, updatedAt: now,
          },
        ],
      })
    );
    fetchMock = vi.fn(async () => sse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    if (savedRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedRoot;
    if (savedState === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = savedState;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const asOwner = () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
  };
  const sent = () => {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
  };

  it('GET with no session: 401, absorb never called', async () => {
    sessionMock.mockResolvedValue(null);
    expect((await get(WS_ID)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST with no session: 401, absorb never called', async () => {
    sessionMock.mockResolvedValue(null);
    expect((await post(WS_ID, {})).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("another user's workspace: 404 on GET and POST, absorb never called", async () => {
    sessionMock.mockResolvedValue({ user: { id: OTHER } });
    tokenMock.mockResolvedValue('gho_other');
    expect((await get(WS_ID)).status).toBe(404);
    expect((await post(WS_ID, {})).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unknown or path-like id: 404, absorb never called', async () => {
    asOwner();
    expect((await get('ws-does-not-exist')).status).toBe(404);
    expect((await post(tempRoot, {})).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a signed-in owner with no user credential: 401, the service key never stands in alone', async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue(null);
    expect((await get(WS_ID)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a client Authorization that is not the owner's own: 403, absorb never called", async () => {
    asOwner();
    expect((await post(WS_ID, {}, { Authorization: 'Bearer gho_someone_else' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the owner: GET proxies the stream with the service key plus the owner credential and the cursor', async () => {
    asOwner();
    const res = await get(WS_ID, '?depth=deep&tier=high');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-holoscript-stream-contract')).toBe('v-test');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/absorb/stream');
    const { headers, body } = sent();
    expect(headers.Authorization).toBe('Bearer absorb-key-test');
    expect(headers['X-User-Authorization']).toBe('Bearer gho_owner');
    expect(headers['Last-Event-ID']).toBe('cursor-123');
    expect(body).toEqual({ projectId: WS_ID, depth: 'deep', tier: 'high' });
  });

  it('POST forwards only the allowlisted body, never the raw one; projectId comes from the URL', async () => {
    asOwner();
    await post(WS_ID, {
      projectId: 'ws-someone-elses',
      depth: 'deep',
      tier: 'medium',
      languages: ['ts'],
      path: '/etc',
      userId: OTHER,
      cost: 0,
    });
    expect(sent().body).toEqual({ projectId: WS_ID, depth: 'deep', tier: 'medium', languages: ['ts'] });
  });

  it('POST with unknown depth or tier values falls back to the defaults', async () => {
    asOwner();
    await post(WS_ID, { depth: 'everything', tier: 'free' });
    expect(sent().body).toEqual({ projectId: WS_ID, depth: 'shallow', tier: 'medium' });
  });

  it('POST with a malformed body: 400, absorb never called', async () => {
    asOwner();
    expect((await post(WS_ID, '{not json')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the owner: an upstream error is passed back with its status', async () => {
    asOwner();
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const res = await post(WS_ID, {});
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('429');
  });
});