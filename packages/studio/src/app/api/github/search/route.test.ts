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

describe('/api/github/search route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scopes search query to repo and uses text-match accept header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              name: 'route.ts',
              path: 'packages/studio/src/app/api/github/pr/route.ts',
              sha: 'abc123',
              html_url:
                'https://github.com/brianonbased-dev/HoloScript/blob/main/packages/studio/src/app/api/github/pr/route.ts',
              repository: { full_name: 'brianonbased-dev/HoloScript' },
              text_matches: [
                {
                  fragment: 'createGitHubHeaders(token)',
                  matches: [{ text: 'createGitHubHeaders', indices: [0, 19] }],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost/api/github/search?owner=brianonbased-dev&repo=HoloScript&query=createGitHubHeaders'
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalCount).toBe(1);
    expect(body.results[0].name).toBe('route.ts');

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/search/code');
    expect(calledUrl).toContain('q=createGitHubHeaders+repo%3Abrianonbased-dev%2FHoloScript');
    expect(calledUrl).toContain('per_page=30');

    const calledOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = (calledOptions.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers.Accept).toBe('application/vnd.github.text-match+json');
  });

  it('returns 401 when no token is available', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const req = new NextRequest(
      'http://localhost/api/github/search?owner=a&repo=b&query=something'
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Not authenticated/i);
    if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
  });

  it('returns 400 when required params are missing', async () => {
    const req = new NextRequest('http://localhost/api/github/search?owner=a&repo=b');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required/i);
  });

  it('propagates GitHub API error status and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const req = new NextRequest(
      'http://localhost/api/github/search?owner=a&repo=b&query=something'
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('API rate limit exceeded');
  });
});
