import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ accessToken: 'test-token' })),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { getServerSession } from 'next-auth';
import { GET } from './route';

describe('/api/github/access route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses shared auth headers for user/repo requests and classifies owner role', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: 'brianonbased-dev' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            owner: { login: 'brianonbased-dev' },
            permissions: { admin: false, push: true, pull: true },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost/api/github/access?owner=brianonbased-dev&repo=HoloScript'
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.role).toBe('owner');
    expect(body.canDirectShip).toBe(true);
    expect(body.recommendedFlow).toBe('direct-ship');

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/user');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/repos/brianonbased-dev/HoloScript');

    const firstHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    const secondHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;

    expect(firstHeaders.Authorization).toBe('Bearer test-token');
    expect(secondHeaders.Authorization).toBe('Bearer test-token');
    expect(firstHeaders['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(secondHeaders['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('returns 401 when no token is available', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const req = new NextRequest(
      'http://localhost/api/github/access?owner=brianonbased-dev&repo=HoloScript'
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Not authenticated/i);
    if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
  });

  it('returns 400 when owner or repo params are missing', async () => {
    const req = new NextRequest('http://localhost/api/github/access?owner=only');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Required/i);
  });

  it('classifies contributor role when user has push but is not the owner', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: 'contributor-user' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            owner: { login: 'brianonbased-dev' },
            permissions: { admin: false, push: true, pull: true },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest(
      'http://localhost/api/github/access?owner=brianonbased-dev&repo=HoloScript'
    );
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.role).toBe('contributor');
    expect(body.canDirectShip).toBe(false);
    expect(body.recommendedFlow).toBe('branch-pr');
  });

  it('returns 502 when GitHub API calls fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    const req = new NextRequest(
      'http://localhost/api/github/access?owner=brianonbased-dev&repo=HoloScript'
    );
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Unable to resolve/i);
  });
});
