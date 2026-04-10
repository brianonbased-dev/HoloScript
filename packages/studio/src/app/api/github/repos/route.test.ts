import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ accessToken: 'test-token' })),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { getServerSession } from 'next-auth';
import { GET } from './route';

describe('/api/github/repos route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches repos via shared headers and applies local search filtering', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: 'HoloScript',
            full_name: 'brianonbased-dev/HoloScript',
            description: 'Universal semantic platform',
            clone_url: 'https://github.com/brianonbased-dev/HoloScript.git',
            default_branch: 'main',
            language: 'TypeScript',
            stargazers_count: 100,
            pushed_at: '2026-04-08T00:00:00Z',
            private: false,
            fork: false,
            size: 1234,
          },
          {
            id: 2,
            name: 'OtherRepo',
            full_name: 'brianonbased-dev/OtherRepo',
            description: 'Something else',
            clone_url: 'https://github.com/brianonbased-dev/OtherRepo.git',
            default_branch: 'main',
            language: 'TypeScript',
            stargazers_count: 5,
            pushed_at: '2026-04-08T00:00:00Z',
            private: false,
            fork: false,
            size: 12,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/github/repos?per_page=30&q=holoscript');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.repos[0].fullName).toBe('brianonbased-dev/HoloScript');

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/user/repos');
    expect(calledUrl).toContain('type=owner');
    expect(calledUrl).toContain('sort=updated');
    expect(calledUrl).toContain('per_page=30');

    const calledOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = (calledOptions.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('returns 401 when no token is available', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const req = new NextRequest('http://localhost/api/github/repos');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Not authenticated/i);
    if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
  });

  it('returns 502 when GitHub API returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    );
    const req = new NextRequest('http://localhost/api/github/repos');
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/GitHub API error/i);
  });

  it('returns all repos without filtering when no q param is provided', async () => {
    const repoFixture = (id: number, name: string) => ({
      id,
      name,
      full_name: `user/${name}`,
      description: null,
      clone_url: `https://github.com/user/${name}.git`,
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: id,
      pushed_at: '2026-04-08T00:00:00Z',
      private: false,
      fork: false,
      size: 100,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([repoFixture(1, 'Alpha'), repoFixture(2, 'Beta')]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const req = new NextRequest('http://localhost/api/github/repos');
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.repos.map((r: { name: string }) => r.name)).toEqual(['Alpha', 'Beta']);
  });
});
