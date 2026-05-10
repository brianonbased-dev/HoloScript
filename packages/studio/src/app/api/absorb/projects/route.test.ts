import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { GET, POST } from './route';

describe('/api/absorb/projects route', () => {
  let tempRoot: string;
  let savedWorkspaceRoot: string | undefined;
  let savedStateFile: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    expect(String(call?.[0])).toContain('https://absorb.test/api/projects');
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
