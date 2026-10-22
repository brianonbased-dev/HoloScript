import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  session: { user: { id: 'user-a' } } as { user: { id: string } } | null,
  ghToken: 'gh-user-token' as string | null,
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => m.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: vi.fn(async () => m.ghToken) }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { POST } from './route';
import { upsertDurableAbsorbProject } from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-555555555555';
const IMPORT_ID = 'imp-0001-aaaa';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/daemon/absorb: owner-checked, sends repoUrl (never a path) to absorb /scan', () => {
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    m.session = { user: { id: 'user-a' } };
    m.ghToken = 'gh-user-token';
    upsertDurableAbsorbProject({
      id: WS,
      name: 'tiny',
      ownerId: 'user-a',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/tiny.git',
      localPath: `/data/workspaces/${WS}/tiny`,
      metadata: { branch: 'main' },
    });
    fetchMock = vi.fn(async () => new Response('{"graphId":"g1","stats":{"totalFiles":1},"cost":10}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('sends {repoUrl, branch, importId, projectId, shallow} and no path', async () => {
    const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID, depth: 'shallow' }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://absorb.test/api/absorb/scan');
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({
      repoUrl: 'https://github.com/owner/tiny.git',
      branch: 'main',
      importId: IMPORT_ID,
      projectId: WS,
      shallow: true,
    });
    expect(sent.path).toBeUndefined();
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer service-key');
    expect(h['X-User-Authorization']).toBe('Bearer gh-user-token');
  });

  it("someone else's workspace: 404, nothing sent", async () => {
    m.session = { user: { id: 'user-b' } };
    const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('not signed in: 401, nothing sent', async () => {
    m.session = null;
    const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a raw path instead of a workspace id is refused', async () => {
    const res = await POST(post({ workspaceId: '/etc', projectPath: '/etc', importId: IMPORT_ID }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing importId: the server mints one (or uses its pending one); a malformed one is refused', async () => {
    const res = await POST(post({ workspaceId: WS }));
    expect(res.status).toBe(200);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.importId).toMatch(/^imp-[0-9a-f-]{36}$/);
    const bad = await POST(post({ workspaceId: WS, importId: 'x' }));
    expect(bad.status).toBe(400);
  });

  it('absorb timeout (504), oversize (413) and no credits (402) pass through with a clear message', async () => {
    for (const status of [504, 413, 402]) {
      fetchMock.mockResolvedValueOnce(new Response('{"error":"x"}', { status }));
      const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
      expect(res.status).toBe(status);
      expect((await res.json()).reason).toBe('absorb_refused');
    }
  });

  it('absorb 5xx or a network error: 502, one attempt, upstream text not returned', async () => {
    fetchMock.mockResolvedValueOnce(new Response('internal detail', { status: 500 }));
    const a = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(a.status).toBe(502);
    expect(JSON.stringify(await a.json())).not.toContain('internal detail');
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const b = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(b.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bad JSON: 400', async () => {
    const res = await POST(post('{"x":'));
    expect(res.status).toBe(400);
  });

  it('no GitHub token: 401, nothing sent (the service key never goes alone; Treasurer A)', async () => {
    m.ghToken = null;
    const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_no_user_credential');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the absorb call has a timeout; a cut call is "outcome unknown" (502), not a refusal', async () => {
    const res0 = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(res0.status).toBe(200);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('absorb_outcome_unknown');
  });

  it("absorb's 409 is passed through with its own code and message (Treasurer, #617)", async () => {
    for (const code of ['import_in_progress', 'import_already_charged', 'import_claim_lost', 'import_id_reused']) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: code, message: 'x' }), { status: 409 }));
      const res = await POST(post({ workspaceId: WS, importId: IMPORT_ID }));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.reason).toBe(code);
      expect(body.error).not.toContain('did not answer');
    }
  });
});
