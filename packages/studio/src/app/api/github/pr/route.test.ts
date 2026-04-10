import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ accessToken: 'test-token' })),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { getServerSession } from 'next-auth';
import { GET, POST } from './route';

describe('/api/github/pr route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET builds encoded pulls URL and uses shared auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            number: 12,
            title: 'Add tests',
            state: 'open',
            html_url: 'https://github.com/brianonbased-dev/HoloScript/pull/12',
            head: { ref: 'feature/tests' },
            base: { ref: 'main' },
            draft: false,
            created_at: '2026-04-08T00:00:00Z',
            updated_at: '2026-04-08T00:00:00Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost/api/github/pr?owner=brianonbased-dev&repo=Holo Script&state=open'
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.prs[0].number).toBe(12);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/repos/brianonbased-dev/Holo%20Script/pulls');
    expect(calledUrl).toContain('state=open');
    expect(calledUrl).toContain('per_page=50');

    const calledOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = (calledOptions.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('POST sends JSON payload with shared headers and returns normalized data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          number: 77,
          html_url: 'https://github.com/brianonbased-dev/HoloScript/pull/77',
          state: 'open',
          title: 'Add route tests',
          draft: false,
          node_id: 'PR_kwD123',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/github/pr', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'brianonbased-dev',
        repo: 'HoloScript',
        title: 'Add route tests',
        head: 'feature/tests',
        base: 'main',
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.number).toBe(77);
    expect(body.head).toBe('feature/tests');
    expect(body.base).toBe('main');

    const calledOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = (calledOptions.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['Content-Type']).toBe('application/json');

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/repos/brianonbased-dev/HoloScript/pulls');

    const sentBody = JSON.parse(String(calledOptions.body));
    expect(sentBody).toMatchObject({
      title: 'Add route tests',
      head: 'feature/tests',
      base: 'main',
      draft: false,
      body: '',
    });
  });

  it('GET returns 401 when no token is available', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const req = new NextRequest('http://localhost/api/github/pr?owner=a&repo=b');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Not authenticated/i);
    if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
  });

  it('GET returns 400 when owner or repo is missing', async () => {
    const req = new NextRequest('http://localhost/api/github/pr?owner=onlyone');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Required/i);
  });

  it('POST returns 401 when no token is available', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const req = new NextRequest('http://localhost/api/github/pr', {
      method: 'POST',
      body: JSON.stringify({ owner: 'a', repo: 'b', title: 't', head: 'h', base: 'main' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
  });

  it('POST returns 400 when required fields are missing', async () => {
    const req = new NextRequest('http://localhost/api/github/pr', {
      method: 'POST',
      body: JSON.stringify({ owner: 'brianonbased-dev', repo: 'HoloScript' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Required/i);
  });

  it('POST forwards GitHub API error status and message via createGitHubHeaders', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Validation Failed' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const req = new NextRequest('http://localhost/api/github/pr', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'brianonbased-dev',
        repo: 'HoloScript',
        title: 'duplicate',
        head: 'main',
        base: 'main',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('Validation Failed');
  });

  it('POST retries on 429 using Retry-After and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number: 91,
            html_url: 'https://github.com/brianonbased-dev/HoloScript/pull/91',
            state: 'open',
            title: 'Retry PR',
            draft: false,
            node_id: 'PR_retry_91',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/github/pr', {
      method: 'POST',
      body: JSON.stringify({
        owner: 'brianonbased-dev',
        repo: 'HoloScript',
        title: 'Retry PR',
        head: 'feature/retry',
        base: 'main',
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.number).toBe(91);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET retries transient 503 and returns successful list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 33,
              title: 'Recovered list',
              state: 'open',
              html_url: 'https://github.com/brianonbased-dev/HoloScript/pull/33',
              head: { ref: 'feature/recover' },
              base: { ref: 'main' },
              draft: false,
              created_at: '2026-04-08T00:00:00Z',
              updated_at: '2026-04-08T00:00:00Z',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/github/pr?owner=brianonbased-dev&repo=HoloScript');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});