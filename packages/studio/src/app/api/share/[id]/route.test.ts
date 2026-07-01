import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('GET /api/share/[id] publish fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bridges /api/publish scenes into the shared WebXR viewer contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ scenes: [] }))
      .mockResolvedValueOnce(
        Response.json({
          publishedAt: '2026-07-01T12:00:00.000Z',
          scene: {
            code: 'composition "Fallback World" { object "Orb" { geometry: "sphere" } }',
            title: 'Fallback World',
            author: 'codex',
            metadata: { name: 'Fallback World' },
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new Request('https://studio.test/api/share/abc123ef'), {
      params: Promise.resolve({ id: 'abc123ef' }),
    });
    const body = (await response.json()) as {
      id: string;
      name: string;
      author: string;
      createdAt: string;
      views: number;
      code: string;
    };

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://studio.test/api/share');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://studio.test/api/publish?id=abc123ef');
    expect(body).toEqual({
      id: 'abc123ef',
      name: 'Fallback World',
      author: 'codex',
      createdAt: '2026-07-01T12:00:00.000Z',
      views: 0,
      code: 'composition "Fallback World" { object "Orb" { geometry: "sphere" } }',
    });
  });
});
