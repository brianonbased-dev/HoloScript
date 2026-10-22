/**
 * /api/absorb/projects/[id]/knowledge: session, owner check, the owner's own
 * credential (never the service key alone), allowlisted body, and the SSRF
 * guard on a caller-supplied url.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sessionMock, tokenMock, pageMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  tokenMock: vi.fn(),
  pageMock: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: tokenMock }));
vi.mock('@/lib/services/absorb-client', () => ({
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));
vi.mock('@/lib/security/safeFetchPage', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/security/safeFetchPage')>();
  return { ...actual, fetchPageSafely: pageMock };
});

import { POST } from './route';
import * as safe from '@/lib/security/safeFetchPage';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const WS_ID = 'ws-11111111-2222-3333-4444-555555555555';
const NOOWNER_ID = 'ws-99999999-2222-3333-4444-555555555555';

function post(id: string, body: unknown, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost/api/absorb/projects/${encodeURIComponent(id)}/knowledge`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

const mcpOk = (data: unknown) =>
  new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(data) }] } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('/api/absorb/projects/[id]/knowledge guard', () => {
  let tempRoot: string;
  let savedRoot: string | undefined;
  let savedState: string | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    sessionMock.mockReset();
    tokenMock.mockReset();
    pageMock.mockReset();
    const actual = await vi.importActual<typeof import('@/lib/security/safeFetchPage')>(
      '@/lib/security/safeFetchPage'
    );
    pageMock.mockImplementation(actual.fetchPageSafely);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    savedRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedState = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-knowledge-owner-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    const now = new Date().toISOString();
    const row = (id: string, ownerId?: string) => {
      const repoDir = path.join(tempRoot, id, 'repo');
      fs.mkdirSync(repoDir, { recursive: true });
      return {
        id, name: 'repo', sourceType: 'github', sourceUrl: 'https://github.com/o/r',
        localPath: repoDir, status: 'ready', ...(ownerId ? { ownerId } : {}),
        absorbJobs: [], createdAt: now, updatedAt: now,
      };
    };
    fs.writeFileSync(
      path.join(tempRoot, '.absorb-projects.json'),
      JSON.stringify({ version: 1, updatedAt: now, projects: [row(WS_ID, OWNER), row(NOOWNER_ID)] })
    );
    fetchMock = vi.fn(async () => mcpOk({ success: true, summary: { total: 3 }, entries: [{}] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    if (savedRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedRoot;
    if (savedState === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = savedState;
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const asOwner = () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue('gho_owner');
  };
  const sent = () => {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return { url: String(fetchMock.mock.calls[0][0]), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
  };

  it('no session: 401, nothing sent', async () => {
    sessionMock.mockResolvedValue(null);
    expect((await post(WS_ID, {})).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("another user's workspace: 404, nothing sent", async () => {
    sessionMock.mockResolvedValue({ user: { id: OTHER } });
    tokenMock.mockResolvedValue('gho_other');
    const res = await post(WS_ID, {});
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('absorb_no_project');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ownerless workspace: the same 404, nothing sent', async () => {
    asOwner();
    const res = await post(NOOWNER_ID, {});
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('absorb_no_project');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unknown or path-like id: the same 404, nothing sent', async () => {
    asOwner();
    for (const id of ['ws-does-not-exist', '/etc', '../' + WS_ID, tempRoot]) {
      const res = await post(id, {});
      expect(res.status).toBe(404);
      expect((await res.json()).reason).toBe('absorb_no_project');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('owner without their own credential: 401, the service key is never sent alone', async () => {
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
    tokenMock.mockResolvedValue(null);
    const res = await post(WS_ID, {}, { Authorization: 'Bearer absorb-key-test' });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_no_user_credential');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tokenMock).toHaveBeenCalledWith(expect.anything(), { userOnly: true });
  });

  it("happy path: the owner's own token rides with the key; allowlisted args only", async () => {
    asOwner();
    const res = await post(
      WS_ID,
      { minConfidence: 0.8, maxPerType: 5, includeSpeculative: true, workspaceId: 'someone-else', path: '/etc' },
      { Authorization: 'Bearer gho_someone_else' }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).summary.total).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const s = sent();
    expect(s.url).toBe('https://mcp.test/mcp');
    expect(s.headers.Authorization).toBe('Bearer absorb-key-test');
    expect(s.headers['X-User-Authorization']).toBe('Bearer gho_owner');
    expect(JSON.stringify(s.headers)).not.toContain('gho_someone_else');
    expect(s.body.params).toEqual({
      name: 'absorb_extract_knowledge',
      arguments: { minConfidence: 0.8, maxPerType: 5, includeSpeculative: true, workspaceId: WS_ID },
    });
  });

  it('MCP failure: 502, and no key-only REST fallback (exactly one upstream call)', async () => {
    asOwner();
    fetchMock.mockResolvedValue(new Response('down', { status: 502 }));
    const res = await post(WS_ID, {});
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.reason).toBe('absorb_upstream_failed');
    expect(JSON.stringify(body)).not.toContain('down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).headers).toHaveProperty('X-User-Authorization', 'Bearer gho_owner');
    }
  });

  it('invalid body values: 400, nothing sent', async () => {
    asOwner();
    for (const b of ['{not json', [], { minConfidence: 2 }, { maxPerType: 0 }, { includeSpeculative: 'yes' }, { url: 5 }]) {
      expect((await post(WS_ID, b)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['file:///etc/passwd', 'url_scheme_not_allowed'],
    ['gopher://example.com/', 'url_scheme_not_allowed'],
    ['ftp://example.com/x', 'url_scheme_not_allowed'],
    ['http://127.0.0.1/', 'url_blocked_address'],
    ['http://[::1]/', 'url_blocked_address'],
    ['http://169.254.169.254/latest/meta-data/', 'url_blocked_address'],
    ['http://[fd00:ec2::254]/', 'url_blocked_address'],
    ['http://10.0.0.1/', 'url_blocked_address'],
    ['http://100.64.0.1/', 'url_blocked_address'],
    ['http://[::ffff:10.0.0.1]/', 'url_blocked_address'],
    ['http://[::ffff:a9fe:a9fe]/', 'url_blocked_address'],
    ['http://2130706433/', 'url_blocked_address'],
    ['http://user:pw@example.com/', 'url_credentials_in_url'],
  ])('url %s: 400 %s, absorb never called', async (url, reason) => {
    asOwner();
    const res = await post(WS_ID, { url });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('url happy path: only the fetched text goes upstream, never the url', async () => {
    asOwner();
    pageMock.mockResolvedValue({ url: 'https://example.com/a', title: 'A', bodyText: 'Some page text.' });
    const res = await post(WS_ID, { url: 'https://example.com/a' });
    expect(res.status).toBe(200);
    expect(pageMock).toHaveBeenCalledWith('https://example.com/a');
    const args = sent().body.params.arguments;
    expect(args.bodyText).toBe('Some page text.');
    expect(args.title).toBe('A');
    expect(args).not.toHaveProperty('url');
    expect(JSON.stringify(sent().body)).not.toContain('example.com');
  });

  it('url to an empty page: 422, absorb never called (so absorb never fetches it itself)', async () => {
    asOwner();
    pageMock.mockResolvedValue({ url: 'https://example.com/a', bodyText: '   ' });
    expect((await post(WS_ID, { url: 'https://example.com/a' })).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('url refused by the guard after DNS: 400 with its reason', async () => {
    asOwner();
    pageMock.mockRejectedValue(new safe.UnsafeUrlError('private', 'blocked_address'));
    const res = await post(WS_ID, { url: 'https://internal.example/' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('url_blocked_address');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});