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

import { GET } from './route';

describe('/api/github/tree route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes directory path segments before calling GitHub contents API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            name: 'index.ts',
            path: 'src/My Folder/index.ts',
            sha: 'tree-sha',
            size: 42,
            type: 'file',
          },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost/api/github/tree?owner=brianonbased-dev&repo=HoloScript&path=src/My Folder'
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/repos/brianonbased-dev/HoloScript/contents/src/My%20Folder');
  });
});
