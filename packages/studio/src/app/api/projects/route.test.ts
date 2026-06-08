import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './route';

// Mock next-auth so getSession() (via getServerSession) is controllable.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

// No DB → exercise the in-memory owner-scoped fallback.
vi.mock('../../../db/client', () => ({
  getDb: vi.fn(() => null),
}));

import { getServerSession } from 'next-auth';
import { getDb } from '../../../db/client';

const mockSession = (id: string | null) =>
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(id ? { user: { id } } : null);

function postReq(body: unknown) {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Parameters<typeof POST>[0];
}

function getReq(url: string) {
  return {
    headers: new Headers(),
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

function delReq(url: string) {
  return {
    headers: new Headers(),
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof DELETE>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  delete process.env.BRITTNEY_BENCHMARK_KEY;
  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
  // Reset the in-memory fallback store between tests.
  (globalThis as { __projects__?: Map<string, unknown> }).__projects__ = new Map();
});

describe('POST /api/projects', () => {
  it('requires authentication', async () => {
    mockSession(null);
    const res = await POST(postReq({ name: 'X' }));
    expect(res.status).toBe(401);
  });

  it('rejects a project with no name', async () => {
    mockSession('user-1');
    const res = await POST(postReq({ code: 'box {}' }));
    expect(res.status).toBe(400);
  });

  it('creates a project scoped to the authenticated owner', async () => {
    mockSession('user-1');
    const res = await POST(postReq({ name: 'My Scene', code: 'box {}' }));
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(project.name).toBe('My Scene');
    expect(project.slug).toBe('my-scene');
    expect(project.code).toBe('box {}');
  });
});

describe('authed POST then GET returns the project (vertical slice)', () => {
  it('GET lists only the caller’s projects', async () => {
    mockSession('user-1');
    const created = await (await POST(postReq({ name: 'Alpha', code: 'a {}' }))).json();

    // A different user must NOT see user-1's project.
    mockSession('user-2');
    const otherList = await (await GET(getReq('http://localhost/api/projects'))).json();
    expect(otherList.projects).toHaveLength(0);

    // user-1 sees exactly their project.
    mockSession('user-1');
    const mineRes = await GET(getReq('http://localhost/api/projects'));
    expect(mineRes.status).toBe(200);
    const { projects } = await mineRes.json();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(created.project.id);
    expect(projects[0].name).toBe('Alpha');
    // List view omits the (potentially large) code blob.
    expect(projects[0].code).toBeUndefined();
  });

  it('GET ?id returns the full project incl. code, owner-scoped', async () => {
    mockSession('user-1');
    const created = await (await POST(postReq({ name: 'Beta', code: 'b {}' }))).json();
    const id = created.project.id;

    mockSession('user-1');
    const oneRes = await GET(getReq(`http://localhost/api/projects?id=${id}`));
    expect(oneRes.status).toBe(200);
    const { project } = await oneRes.json();
    expect(project.code).toBe('b {}');

    // user-2 cannot read user-1's project by id.
    mockSession('user-2');
    const denied = await GET(getReq(`http://localhost/api/projects?id=${id}`));
    expect(denied.status).toBe(404);
  });
});

describe('POST upsert + slug reconciliation', () => {
  it('updates in place when a valid owned uuid is supplied', async () => {
    mockSession('user-1');
    const created = await (await POST(postReq({ name: 'Gamma', code: 'g1 {}' }))).json();
    const id = created.project.id;

    mockSession('user-1');
    const updated = await (await POST(postReq({ id, name: 'Gamma v2', code: 'g2 {}' }))).json();
    expect(updated.project.id).toBe(id); // same row, not a new one
    expect(updated.project.code).toBe('g2 {}');

    mockSession('user-1');
    const { projects } = await (await GET(getReq('http://localhost/api/projects'))).json();
    expect(projects).toHaveLength(1); // upsert, not duplicate
  });

  it('mints a fresh uuid for a non-uuid client id (string-id reconciliation)', async () => {
    mockSession('user-1');
    const res = await POST(postReq({ id: '1717000000000-ab12cd', name: 'Legacy', code: 'x {}' }));
    const { project } = await res.json();
    expect(project.id).not.toBe('1717000000000-ab12cd');
    expect(project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('disambiguates duplicate slugs for the same owner', async () => {
    mockSession('user-1');
    const a = await (await POST(postReq({ name: 'Same Name' }))).json();
    mockSession('user-1');
    const b = await (await POST(postReq({ name: 'Same Name' }))).json();
    expect(a.project.slug).toBe('same-name');
    expect(b.project.slug).toBe('same-name-2');
    expect(a.project.id).not.toBe(b.project.id);
  });
});

describe('DELETE /api/projects', () => {
  it('deletes an owned project', async () => {
    mockSession('user-1');
    const created = await (await POST(postReq({ name: 'Doomed' }))).json();
    const id = created.project.id;

    mockSession('user-1');
    const res = await DELETE(delReq(`http://localhost/api/projects?id=${id}`));
    expect(res.status).toBe(200);

    mockSession('user-1');
    const { projects } = await (await GET(getReq('http://localhost/api/projects'))).json();
    expect(projects).toHaveLength(0);
  });

  it('cannot delete another user’s project', async () => {
    mockSession('user-1');
    const created = await (await POST(postReq({ name: 'Protected' }))).json();
    const id = created.project.id;

    mockSession('user-2');
    const res = await DELETE(delReq(`http://localhost/api/projects?id=${id}`));
    expect(res.status).toBe(404);

    // Still present for the real owner.
    mockSession('user-1');
    const { projects } = await (await GET(getReq('http://localhost/api/projects'))).json();
    expect(projects).toHaveLength(1);
  });

  it('400 when id is missing', async () => {
    mockSession('user-1');
    const res = await DELETE(delReq('http://localhost/api/projects'));
    expect(res.status).toBe(400);
  });
});
