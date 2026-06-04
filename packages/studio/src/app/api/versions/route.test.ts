import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getDbMock, requireAuthMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  // Default: authenticated as user 'user-A'. Individual tests reassign the
  // mock implementation to simulate a second user or an unauthenticated call.
  requireAuthMock: vi.fn(async () => ({ user: { id: 'user-A' } })),
}));

vi.mock('@/db/client', () => ({ getDb: getDbMock }));
vi.mock('@/db/schema', () => ({
  sceneVersions: { id: 'id', projectId: 'projectId', createdAt: 'createdAt' },
}));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ op: 'eq', args }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (arg: unknown) => ({ op: 'desc', arg }),
}));

import { NextResponse } from 'next/server';
import { GET as listVersions, POST as saveVersion } from './route';
import {
  GET as getSceneVersions,
  PUT as restoreVersion,
  DELETE as deleteVersion,
} from './[sceneId]/route';
import { clearVersionsStore } from './store';

function makeSelectChainWithLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function makeSelectChainWhereTerminal(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

describe('/api/versions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbMock.mockReturnValue(null);
    // Re-assert the default authenticated user after clearAllMocks() wipes
    // the implementation (clearAllMocks clears impls set via mockImplementation
    // but NOT the hoisted factory default; reset explicitly to be safe).
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-A' } }));
    clearVersionsStore();
  });

  it('shares fallback store between POST /api/versions and GET /api/versions/[sceneId]', async () => {
    const postReq = new NextRequest('http://localhost/api/versions', {
      method: 'POST',
      body: JSON.stringify({ sceneId: 'scene-1', code: 'object "Cube" {}', label: 'Initial' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const postRes = await saveVersion(postReq);
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.version.sceneId).toBe('scene-1');

    const getRes = await getSceneVersions(
      new NextRequest('http://localhost/api/versions/scene-1'),
      {
        params: Promise.resolve({ sceneId: 'scene-1' }),
      }
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.versions).toHaveLength(1);
    expect(getBody.versions[0].versionId).toBe(postBody.version.versionId);
  });

  it('restores and deletes versions from the shared fallback store', async () => {
    await saveVersion(
      new NextRequest('http://localhost/api/versions', {
        method: 'POST',
        body: JSON.stringify({ sceneId: 'scene-2', code: 'object "Sphere" {}', label: 'Saved' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const listRes = await listVersions(
      new NextRequest('http://localhost/api/versions?sceneId=scene-2')
    );
    const listBody = await listRes.json();
    const versionId = listBody.versions[0].versionId as string;

    const putRes = await restoreVersion(
      new NextRequest(`http://localhost/api/versions/scene-2?v=${versionId}`, { method: 'PUT' }),
      { params: Promise.resolve({ sceneId: 'scene-2' }) }
    );
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.code).toContain('Sphere');

    const deleteRes = await deleteVersion(
      new NextRequest(`http://localhost/api/versions/scene-2?v=${versionId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ sceneId: 'scene-2' }) }
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.remaining).toBe(0);
  });

  it('returns 400 for listVersions when sceneId is missing', async () => {
    const res = await listVersions(new NextRequest('http://localhost/api/versions'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sceneId is required/i);
  });

  it('returns 400 for restoreVersion and deleteVersion when versionId query is missing', async () => {
    const putRes = await restoreVersion(
      new NextRequest('http://localhost/api/versions/scene-x', { method: 'PUT' }),
      { params: Promise.resolve({ sceneId: 'scene-x' }) }
    );
    expect(putRes.status).toBe(400);

    const deleteRes = await deleteVersion(
      new NextRequest('http://localhost/api/versions/scene-x', { method: 'DELETE' }),
      { params: Promise.resolve({ sceneId: 'scene-x' }) }
    );
    expect(deleteRes.status).toBe(400);
  });

  it('returns 404 for restoreVersion/deleteVersion when target version does not exist', async () => {
    // seed unrelated version to keep store non-empty
    await saveVersion(
      new NextRequest('http://localhost/api/versions', {
        method: 'POST',
        body: JSON.stringify({ sceneId: 'scene-a', code: 'object "A" {}', label: 'A' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const missingVersionId = 'v_missing';

    const putRes = await restoreVersion(
      new NextRequest(`http://localhost/api/versions/scene-a?v=${missingVersionId}`, {
        method: 'PUT',
      }),
      { params: Promise.resolve({ sceneId: 'scene-a' }) }
    );
    expect(putRes.status).toBe(404);

    const deleteRes = await deleteVersion(
      new NextRequest(`http://localhost/api/versions/scene-a?v=${missingVersionId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ sceneId: 'scene-a' }) }
    );
    expect(deleteRes.status).toBe(404);
  });

  it('lists versions from database when DB is available', async () => {
    const dbRows = [
      {
        id: 'v_db_1',
        projectId: 'scene-db',
        code: 'object "DB" {}',
        createdAt: new Date('2026-04-09T00:00:00.000Z'),
        metadata: { label: 'DB Snapshot', lineCount: 1 },
      },
    ];

    const db = {
      select: vi.fn(() => makeSelectChainWithLimit(dbRows)),
    };

    getDbMock.mockReturnValue(db);

    const res = await listVersions(
      new NextRequest('http://localhost/api/versions?sceneId=scene-db')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].versionId).toBe('v_db_1');
    expect(body.versions[0].sceneId).toBe('scene-db');
  });

  it('saves versions to database when DB is available', async () => {
    const insertedRow = {
      id: 'v_inserted',
      projectId: 'scene-db-save',
      code: 'object "SavedDB" {}',
      createdAt: new Date('2026-04-09T00:01:00.000Z'),
    };

    const db = {
      insert: vi.fn(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([insertedRow]),
        }),
      })),
    };

    getDbMock.mockReturnValue(db);

    const req = new NextRequest('http://localhost/api/versions', {
      method: 'POST',
      body: JSON.stringify({ sceneId: 'scene-db-save', code: insertedRow.code, label: 'Saved DB' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await saveVersion(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version.versionId).toBe('v_inserted');
    expect(body.version.sceneId).toBe('scene-db-save');
    expect(body.version.code).toBe(insertedRow.code);
  });

  it('restores from database and returns 404 when DB row is missing', async () => {
    const presentRow = {
      id: 'v_present',
      projectId: 'scene-db-restore',
      code: 'object "RestoreDB" {}',
      createdAt: new Date('2026-04-09T00:02:00.000Z'),
      metadata: { label: 'Restore DB', lineCount: 1 },
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectChainWithLimit([presentRow]))
        .mockReturnValueOnce(makeSelectChainWithLimit([])),
    };

    getDbMock.mockReturnValue(db);

    const okRes = await restoreVersion(
      new NextRequest('http://localhost/api/versions/scene-db-restore?v=v_present', {
        method: 'PUT',
      }),
      { params: Promise.resolve({ sceneId: 'scene-db-restore' }) }
    );
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.code).toContain('RestoreDB');

    const missingRes = await restoreVersion(
      new NextRequest('http://localhost/api/versions/scene-db-restore?v=v_missing', {
        method: 'PUT',
      }),
      { params: Promise.resolve({ sceneId: 'scene-db-restore' }) }
    );
    expect(missingRes.status).toBe(404);
  });

  it('deletes from database and returns remaining count', async () => {
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'v_deleted' }]),
        }),
      })),
      select: vi.fn(() => makeSelectChainWhereTerminal([{ id: 'a' }, { id: 'b' }])),
    };

    getDbMock.mockReturnValue(db);

    const res = await deleteVersion(
      new NextRequest('http://localhost/api/versions/scene-db-del?v=v_deleted', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ sceneId: 'scene-db-del' }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.remaining).toBe(2);
  });

  // --- Per-user auth scope (task_1780469216849_kd86) ----------------------

  it('returns 401 when listVersions is called unauthenticated', async () => {
    requireAuthMock.mockImplementationOnce(async () =>
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const res = await listVersions(new NextRequest('http://localhost/api/versions?sceneId=s'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when saveVersion is called unauthenticated', async () => {
    requireAuthMock.mockImplementationOnce(async () =>
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const res = await saveVersion(
      new NextRequest('http://localhost/api/versions', {
        method: 'POST',
        body: JSON.stringify({ sceneId: 's', code: 'x' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('isolates a second user: user-B cannot see user-A scene versions (fallback store)', async () => {
    // user-A saves a version for "shared-scene"
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-A' } }));
    const postRes = await saveVersion(
      new NextRequest('http://localhost/api/versions', {
        method: 'POST',
        body: JSON.stringify({ sceneId: 'shared-scene', code: 'secret-A', label: 'A' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(postRes.status).toBe(201);

    // user-A sees their own version under the SAME sceneId
    const ownRes = await listVersions(
      new NextRequest('http://localhost/api/versions?sceneId=shared-scene')
    );
    const ownBody = await ownRes.json();
    expect(ownBody.versions).toHaveLength(1);

    // user-B queries the IDENTICAL sceneId and must see nothing
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-B' } }));
    const otherRes = await listVersions(
      new NextRequest('http://localhost/api/versions?sceneId=shared-scene')
    );
    expect(otherRes.status).toBe(200);
    const otherBody = await otherRes.json();
    expect(otherBody.versions).toHaveLength(0);
  });

  it('isolates a second user: user-B cannot restore/delete user-A version (fallback store)', async () => {
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-A' } }));
    await saveVersion(
      new NextRequest('http://localhost/api/versions', {
        method: 'POST',
        body: JSON.stringify({ sceneId: 'iso-scene', code: 'secret-A', label: 'A' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const listRes = await listVersions(
      new NextRequest('http://localhost/api/versions?sceneId=iso-scene')
    );
    const versionId = (await listRes.json()).versions[0].versionId as string;

    // user-B cannot restore user-A's version even knowing the exact sceneId+id
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-B' } }));
    const putRes = await restoreVersion(
      new NextRequest(`http://localhost/api/versions/iso-scene?v=${versionId}`, { method: 'PUT' }),
      { params: Promise.resolve({ sceneId: 'iso-scene' }) }
    );
    expect(putRes.status).toBe(404);

    const delRes = await deleteVersion(
      new NextRequest(`http://localhost/api/versions/iso-scene?v=${versionId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ sceneId: 'iso-scene' }) }
    );
    expect(delRes.status).toBe(404);

    // user-A's version is still intact
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-A' } }));
    const stillRes = await listVersions(
      new NextRequest('http://localhost/api/versions?sceneId=iso-scene')
    );
    expect((await stillRes.json()).versions).toHaveLength(1);
  });

  it('DB list scopes the query by the owner-namespaced projectId key', async () => {
    requireAuthMock.mockImplementation(async () => ({ user: { id: 'user-A' } }));
    const db = { select: vi.fn(() => makeSelectChainWithLimit([])) };
    getDbMock.mockReturnValue(db);

    await listVersions(new NextRequest('http://localhost/api/versions?sceneId=scene-1'));

    // The where() predicate must compare projectId against `${userId}::scene-1`,
    // never the bare sceneId.
    const chain = db.select.mock.results[0]!.value;
    const wherePredicate = chain.where.mock.calls[0]![0] as { op: string; args: unknown[] };
    expect(wherePredicate.op).toBe('eq');
    expect(wherePredicate.args[1]).toBe('user-A::scene-1');
  });
});
