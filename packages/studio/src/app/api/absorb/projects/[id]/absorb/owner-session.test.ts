/**
 * #618: a REAL logged-in user. The session is a real NextAuth JWT cookie read
 * by the real getGitHubToken (no mock of the session token helper), and the
 * client sends no Authorization header, exactly as absorbFetch now does for
 * this route. Absorb must run, as the owner.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

const AUTH_SECRET = 'test-auth-secret-for-owner-session-route';
const OWNER = 'user-owner-real';
const WS_ID = 'ws-99999999-8888-7777-6666-555555555555';

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { POST } from './route';

describe('/api/absorb/projects/[id]/absorb with a real session and no client header', () => {
  const envSnapshot = { ...process.env };
  let tempRoot: string;
  let repoDir: string;

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-owner-session-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    repoDir = path.join(tempRoot, WS_ID, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(tempRoot, '.absorb-projects.json'),
      JSON.stringify({
        version: 1,
        updatedAt: now,
        projects: [
          { id: WS_ID, name: 'repo', sourceType: 'github', localPath: repoDir, status: 'ready', ownerId: OWNER, absorbJobs: [], createdAt: now, updatedAt: now },
        ],
      })
    );
    sessionMock.mockResolvedValue({ user: { id: OWNER } });
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("runs absorb as the owner: 200, the session's own token as X-User-Authorization", async () => {
    const sessionToken = await encode({
      token: { sub: OWNER, accessToken: 'gho_owner_session', provider: 'github' },
      secret: AUTH_SECRET,
    });
    const fetchMock = vi.fn(async () => new Response('{"graphId":"g-owner"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest(`http://localhost/api/absorb/projects/${WS_ID}/absorb`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json', cookie: `next-auth.session-token=${sessionToken}` },
    });
    const res = await POST(req, { params: Promise.resolve({ id: WS_ID }) });
    expect(res.status).toBe(200);
    expect((await res.json()).graphId).toBe('g-owner');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer absorb-key-test');
    expect(headers['X-User-Authorization']).toBe('Bearer gho_owner_session');
  });
});