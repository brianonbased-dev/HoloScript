/**
 * Per-user auth scope for /api/snapshots (task_1780469216849_kd86).
 *
 * Before this fix, snapshots keyed on a global `project_id` text bucket with no
 * ownership check: any authenticated user could read, write, or delete any
 * other user's scene snapshots. These tests assert the canary requirement —
 * a second authenticated user must NOT see or mutate the first user's data.
 *
 * Exercises the in-memory fallback (getDb() === null) end to end. DB-path
 * scoping is covered structurally by asserting the query key in the versions
 * suite; the snapshots DB path uses the same scopedSceneKey()/ownerScopePrefix()
 * helpers, so the in-memory behavioural test is the authoritative isolation
 * check here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { getDbMock, requireAuthMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(() => null),
  requireAuthMock: vi.fn(async () => ({ user: { id: 'user-A' } })),
}));

vi.mock('../../../db/client', () => ({ getDb: getDbMock }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

import { GET, POST, DELETE } from './route';

function asUser(id: string | null) {
  if (id === null) {
    requireAuthMock.mockImplementation(async () =>
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
  } else {
    requireAuthMock.mockImplementation(async () => ({ user: { id } }));
  }
}

async function saveSnapshot(sceneId: string, label: string) {
  const res = await POST(
    new NextRequest('http://localhost/api/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sceneId, label, dataUrl: '', code: 'composition "X" {}' }),
    })
  );
  return res;
}

describe('/api/snapshots per-user auth scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbMock.mockReturnValue(null);
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-A' } }));
    // Reset the in-memory snapshot store between tests.
    (globalThis as { __snapshots__?: unknown }).__snapshots__ = {};
  });

  it('returns 401 for GET/POST/DELETE when unauthenticated', async () => {
    asUser(null);
    const getRes = await GET(new NextRequest('http://localhost/api/snapshots?sceneId=s'));
    expect(getRes.status).toBe(401);
    const postRes = await saveSnapshot('s', 'x');
    expect(postRes.status).toBe(401);
    const delRes = await DELETE(new NextRequest('http://localhost/api/snapshots?id=whatever'));
    expect(delRes.status).toBe(401);
  });

  it('user-B cannot list user-A snapshots for the same sceneId', async () => {
    asUser('user-A');
    expect((await saveSnapshot('shared', 'A-snap')).status).toBe(200);

    asUser('user-A');
    const ownBody = await (
      await GET(new NextRequest('http://localhost/api/snapshots?sceneId=shared'))
    ).json();
    expect(ownBody.snapshots).toHaveLength(1);
    expect(ownBody.snapshots[0].sceneId).toBe('shared'); // bare sceneId re-exposed, not the scoped key

    asUser('user-B');
    const otherRes = await GET(new NextRequest('http://localhost/api/snapshots?sceneId=shared'));
    expect(otherRes.status).toBe(200);
    const otherBody = await otherRes.json();
    expect(otherBody.snapshots).toHaveLength(0);
  });

  it('user-B cannot delete user-A snapshot by guessed id', async () => {
    asUser('user-A');
    const created = await (await saveSnapshot('iso', 'A-snap')).json();
    const snapId = created.snapshot.id as string;

    asUser('user-B');
    const delRes = await DELETE(
      new NextRequest(`http://localhost/api/snapshots?id=${snapId}`, { method: 'DELETE' })
    );
    expect(delRes.status).toBe(404);

    // user-A's snapshot survives
    asUser('user-A');
    const stillBody = await (
      await GET(new NextRequest('http://localhost/api/snapshots?sceneId=iso'))
    ).json();
    expect(stillBody.snapshots).toHaveLength(1);
  });

  it('owner can delete their own snapshot', async () => {
    asUser('user-A');
    const created = await (await saveSnapshot('mine', 'A-snap')).json();
    const snapId = created.snapshot.id as string;

    const delRes = await DELETE(
      new NextRequest(`http://localhost/api/snapshots?id=${snapId}`, { method: 'DELETE' })
    );
    expect(delRes.status).toBe(200);

    const afterBody = await (
      await GET(new NextRequest('http://localhost/api/snapshots?sceneId=mine'))
    ).json();
    expect(afterBody.snapshots).toHaveLength(0);
  });
});
