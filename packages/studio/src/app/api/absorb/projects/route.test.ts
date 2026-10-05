import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ getSession: getSessionMock }));

import { GET, POST } from './route';

const ACCOUNT_A = '11111111-2222-4333-8444-555555555555';
const ACCOUNT_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

function signInAs(userId: string | null) {
  getSessionMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

describe('/api/absorb/projects route', () => {
  let tempRoot: string;
  let savedWorkspaceRoot: string | undefined;
  let savedStateFile: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getSessionMock.mockReset();
    signInAs(null);
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-projects-test-'));
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

  it('GET returns upstream projects payload and forwards user auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ projects: [{ id: 'p1', name: 'Upstream Project' }], count: 1 }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/projects', {
      headers: { authorization: 'Bearer user-token' },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.projects[0].id).toBe('p1');

    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toContain('https://absorb.test/api/absorb/projects');
    const init = call?.[1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer absorb-key-test');
    expect(headers['X-User-Authorization']).toBe('Bearer user-token');
  });

  it('POST returns upstream create response on proxy success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ project: { id: 'upstream-created', name: 'Created' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Created', source_type: 'github' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.id).toBe('upstream-created');
  });

  it('POST falls back to durable local store and GET fallback lists durable projects', async () => {
    signInAs(ACCOUNT_A);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));

    const postReq = new NextRequest('http://localhost/api/absorb/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Local Project',
        source_type: 'local',
        source_url: '/tmp/repo',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.standalone).toBe(true);
    expect(postBody.durable).toBe(true);
    expect(postBody.project.name).toBe('Local Project');
    expect(fs.existsSync(path.join(tempRoot, '.absorb-projects.json'))).toBe(true);

    const getReq = new NextRequest('http://localhost/api/absorb/projects');
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.standalone).toBe(true);
    expect(getBody.durable).toBe(true);
    expect(getBody.count).toBe(1);
    expect(Array.isArray(getBody.projects)).toBe(true);
    expect(getBody.projects[0].name).toBe('Local Project');
    expect(getBody.projects[0].ownerId).toBe(ACCOUNT_A);
  });

  it('account B cannot see account A local project on the list or the absorb-down fallback', async () => {
    signInAs(ACCOUNT_A);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));

    const postRes = await POST(
      new NextRequest('http://localhost/api/absorb/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'A only', source_type: 'local' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    const projectA = created.project.id as string;

    signInAs(ACCOUNT_B);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ projects: [{ id: 'upstream-b', name: 'Upstream B' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const listed = await GET(new NextRequest('http://localhost/api/absorb/projects'));
    const listedBody = await listed.json();
    const listedIds = (listedBody.projects as Array<{ id: string }>).map((project) => project.id);
    expect(listedIds).toContain('upstream-b');
    expect(listedIds).not.toContain(projectA);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));
    const fallback = await GET(new NextRequest('http://localhost/api/absorb/projects'));
    const fallbackBody = await fallback.json();
    expect(fallbackBody.standalone).toBe(true);
    expect(fallbackBody.projects).toEqual([]);
    expect(fallbackBody.count).toBe(0);

    signInAs(null);
    const stranger = await GET(new NextRequest('http://localhost/api/absorb/projects'));
    const strangerBody = await stranger.json();
    expect(strangerBody.projects).toEqual([]);
  });

  it('a legacy ownerless local entry is visible to nobody', async () => {
    const statePath = path.join(tempRoot, '.absorb-projects.json');
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        projects: [
          {
            id: 'legacy-1',
            name: 'Legacy',
            sourceType: 'local',
            sourceUrl: null,
            localPath: null,
            status: 'pending',
            lastAbsorbedAt: null,
            totalSpentCents: 0,
            totalOperations: 0,
            metadata: {},
            absorbJobs: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    );

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));
    for (const userId of [ACCOUNT_A, ACCOUNT_B, null]) {
      signInAs(userId);
      const res = await GET(new NextRequest('http://localhost/api/absorb/projects'));
      const body = await res.json();
      expect(body.projects).toEqual([]);
    }

    signInAs(ACCOUNT_A);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ projects: [{ id: 'upstream-a', name: 'Upstream A' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const merged = await GET(new NextRequest('http://localhost/api/absorb/projects'));
    const mergedBody = await merged.json();
    const ids = (mergedBody.projects as Array<{ id: string }>).map((project) => project.id);
    expect(ids).toEqual(['upstream-a']);
    expect(ids).not.toContain('legacy-1');
  });

  it('POST fallback returns 400 on invalid request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));

    const req = new NextRequest('http://localhost/api/absorb/projects', {
      method: 'POST',
      body: '{not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });
});
