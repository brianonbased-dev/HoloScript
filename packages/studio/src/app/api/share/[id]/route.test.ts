/**
 * GET /api/share/[id] — the public share viewer's only way in.
 *
 * The regression this file exists for: the route resolved a share token by
 * fetching its own bare `GET /api/share` with no credential. Once that listing
 * became session-only, the internal call came back 401 and the route answered
 * 502 "Gallery unavailable" WITHOUT ever trying the `/api/publish` fallback
 * below it. Every shared link went dark while the branch stayed green, because
 * nothing here had ever driven the refused-listing path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stand = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../../../db/client', () => ({ getDb: () => stand.db }));

import { GET } from './route';

const SOURCE = 'composition "Fallback World" { object "Orb" { geometry: "sphere" } }';

function publishedPayload() {
  return {
    publishedAt: '2026-07-01T12:00:00.000Z',
    scene: {
      code: SOURCE,
      title: 'Fallback World',
      author: 'codex',
      metadata: { name: 'Fallback World' },
    },
  };
}

/** A drizzle-shaped chain whose terminal `limit` resolves to these rows. */
function standInDb(rows: Array<Record<string, unknown>>) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  return { select: () => chain };
}

function get(id: string) {
  return GET(new Request(`https://studio.test/api/share/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  stand.db = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/share/[id] publish fallback', () => {
  it('bridges /api/publish scenes into the shared WebXR viewer contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ scenes: [] }))
      .mockResolvedValueOnce(Response.json(publishedPayload()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await get('abc123ef');
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
      code: SOURCE,
    });
  });

  it('serves the scene when the gallery listing REFUSES, instead of answering 502', async () => {
    // This is the live failure. The listing is session-only and answers 401 to
    // the route's own credential-less call; that must not end the request.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'Authentication required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(publishedPayload()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await get('abc123ef');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'abc123ef', code: SOURCE });
  });

  it('serves the scene when the gallery listing is unreachable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce(Response.json(publishedPayload()));
    vi.stubGlobal('fetch', fetchMock);

    expect((await get('abc123ef')).status).toBe(200);
  });

  it('still 404s a token that resolves nowhere', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ scenes: [] }))
      .mockResolvedValueOnce(Response.json({ error: 'Scene not found' }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await get('deadbeef')).status).toBe(404);
  });
});

describe('GET /api/share/[id] reads the database directly when there is one', () => {
  it('answers a published row with no internal HTTP call at all', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    stand.db = standInDb([
      {
        id: 'abc123ef-0000-0000-0000-000000000000',
        code: JSON.stringify(publishedPayload().scene),
        metadata: { type: 'published', publishedAt: '2026-07-01T12:00:00.000Z' },
        viewCount: 7,
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    ]);

    const response = await get('abc123ef');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'abc123ef', code: SOURCE });
    // The whole point: no credential can be missing from a call never made.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers a shared row from its metadata', async () => {
    stand.db = standInDb([
      {
        id: 'feed0042-0000-0000-0000-000000000000',
        code: SOURCE,
        metadata: { name: 'Shared World', author: 'ada' },
        viewCount: 3,
        createdAt: new Date('2026-07-02T09:00:00.000Z'),
      },
    ]);

    const response = await get('feed0042');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 'feed0042',
      name: 'Shared World',
      author: 'ada',
      createdAt: '2026-07-02T09:00:00.000Z',
      views: 3,
    });
  });

  it('404s when the row is not there', async () => {
    stand.db = standInDb([]);
    expect((await get('abc123ef')).status).toBe(404);
  });

  it('refuses a token that is a LIKE wildcard rather than a share id', async () => {
    // `LIKE <id>%` treats `%` and `_` as wildcards, so an unchecked id would
    // match every row and return somebody else's most recent scene.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let queried = false;
    stand.db = {
      select: () => {
        queried = true;
        return standInDb([]).select();
      },
    };

    for (const id of ['%', '%%%%%%%%', '________']) {
      expect.soft((await get(id)).status, id).toBe(404);
    }
    expect(queried).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
