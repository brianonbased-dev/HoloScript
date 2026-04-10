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

describe('/api/github/file route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes file path segments before calling GitHub contents API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'file',
          path: 'src/My File.ts',
          name: 'My File.ts',
          sha: 'abc123',
          size: 12,
          content: Buffer.from('hello world', 'utf-8').toString('base64'),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest(
      'http://localhost/api/github/file?owner=brianonbased-dev&repo=HoloScript&path=src/My File.ts'
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.content).toBe('hello world');

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/repos/brianonbased-dev/HoloScript/contents/src/My%20File.ts');
  });
});
